// ============================================================
// AeroFly — Rede ADS-B multi-provedor e resiliente
//
// Prioridade:
//  1. FlyItalyADSB (chave gratuita, comercial, 500 km)
//  2. adsb.lol (aberto, 250 NM)
//  3. adsb.fi  (aberto, 250 NM, limite 1 req/s)
//
// A cobertura do Brasil usa nove regioes. Cada regiao tem cache
// independente: se uma chamada falha, a ultima resposta daquela regiao
// continua valida. Uma area lenta nao derruba o mapa inteiro.
// ============================================================

import type { LiveAircraft, ProviderHealth } from "./types";

type ProviderName = "flyitalyadsb" | "adsb.lol" | "adsb.fi";

interface Provider {
  name: ProviderName;
  key: "ac" | "aircraft";
  radius: number;
  concurrency: number;
  pauseMs: number;
  url: (lat: number, lon: number, d: number) => string;
  headers: Record<string, string>;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const flyKey = process.env.FLYITALYADSB_API_KEY;
  if (flyKey) {
    list.push({
      name: "flyitalyadsb",
      key: "ac",
      radius: 500, // km no endpoint /v2
      concurrency: 5,
      pauseMs: 80,
      url: (lat, lon, d) =>
        `https://api.flyitalyadsb.com/v2/lat/${lat}/lon/${lon}/dist/${d}`,
      headers: { "X-Api-Key": flyKey },
    });
  }
  list.push(
    {
      name: "adsb.lol",
      key: "ac",
      radius: 250, // NM
      concurrency: 3,
      pauseMs: 120,
      url: (lat, lon, d) =>
        `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${d}`,
      headers: {},
    },
    {
      name: "adsb.fi",
      key: "aircraft",
      radius: 250, // NM
      concurrency: 1, // limite publico: 1 req/s
      pauseMs: 1050,
      url: (lat, lon, d) =>
        `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${d}`,
      headers: {},
    },
  );
  return list;
}

// Centros que cobrem os principais corredores do Brasil
const COVERAGE: { id: string; lat: number; lon: number }[] = [
  { id: "sudeste-sp", lat: -23.0, lon: -46.3 },
  { id: "sul", lat: -27.5, lon: -50.5 },
  { id: "centro-oeste", lat: -15.8, lon: -47.9 },
  { id: "sudeste-mg", lat: -19.9, lon: -43.9 },
  { id: "nordeste-sul", lat: -9.5, lon: -38.5 },
  { id: "nordeste-norte", lat: -4.0, lon: -40.5 },
  { id: "norte-belem", lat: -2.5, lon: -48.5 },
  { id: "norte-manaus", lat: -4.0, lon: -60.0 },
  { id: "mato-grosso", lat: -13.0, lon: -56.0 },
];

const ICAO_TO_IATA: Record<string, string> = {
  TAM: "LA",
  LAN: "LA",
  GLO: "G3",
  AZU: "AD",
  PTB: "2Z",
};

interface RawAc {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  rc?: number;
}

interface RegionCache {
  at: number;
  list: RawAc[];
}

const regionCache = new Map<string, RegionCache>();
const REGION_STALE_MS = 15 * 60_000;
const health = new Map<ProviderName, ProviderHealth>();

function setHealth(
  name: ProviderName,
  patch: Partial<ProviderHealth>,
): void {
  const previous = health.get(name);
  health.set(name, {
    name,
    configured: name !== "flyitalyadsb" || Boolean(process.env.FLYITALYADSB_API_KEY),
    status: "idle",
    latencyMs: null,
    successfulRegions: 0,
    totalRegions: COVERAGE.length,
    aircraft: 0,
    lastSuccessAt: null,
    error: null,
    ...previous,
    ...patch,
  });
}

export function getAdsbProviderHealth(): ProviderHealth[] {
  // inclui FlyItaly mesmo sem chave, para a interface mostrar a opcao
  if (!health.has("flyitalyadsb")) {
    setHealth("flyitalyadsb", {
      configured: Boolean(process.env.FLYITALYADSB_API_KEY),
      status: process.env.FLYITALYADSB_API_KEY ? "idle" : "unconfigured",
    });
  }
  for (const p of ["adsb.lol", "adsb.fi"] as ProviderName[]) {
    if (!health.has(p)) setHealth(p, {});
  }
  return [...health.values()];
}

function normalize(list: RawAc[]): LiveAircraft[] {
  const out: LiveAircraft[] = [];
  for (const a of list) {
    if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    const callsign = a.flight?.trim() || null;
    const onGround = a.alt_baro === "ground";
    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : null;
    const vsFtMin =
      typeof a.baro_rate === "number"
        ? a.baro_rate
        : typeof a.geom_rate === "number"
          ? a.geom_rate
          : null;
    out.push({
      hex: String(a.hex ?? callsign ?? `${a.lat},${a.lon}`).trim(),
      callsign,
      airline: callsign ? (ICAO_TO_IATA[callsign.slice(0, 3)] ?? null) : null,
      country: a.r && /^P[PRSTU]/i.test(a.r) ? "Brasil" : "ADS-B",
      lat: a.lat,
      lon: a.lon,
      altM: altFt !== null ? Math.round(altFt * 0.3048) : null,
      speedKmh: typeof a.gs === "number" ? Math.round(a.gs * 1.852) : null,
      track: typeof a.track === "number" ? a.track : null,
      vsMs: vsFtMin !== null ? Math.round(vsFtMin * 0.00508 * 100) / 100 : null,
      onGround,
      flightNumber: callsign,
      registration: a.r?.trim() || null,
      aircraftType: a.t?.trim() || null,
      squawk: a.squawk ?? null,
      accuracyM: typeof a.rc === "number" ? a.rc : null,
      posAgeSec:
        typeof a.seen_pos === "number" ? Math.round(a.seen_pos * 10) / 10 : null,
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchArea(
  provider: Provider,
  region: (typeof COVERAGE)[number],
): Promise<RawAc[]> {
  const res = await fetch(provider.url(region.lat, region.lon, provider.radius), {
    headers: {
      Accept: "application/json",
      "User-Agent": "aerofly/1.0 (+https://aerofly.app)",
      ...provider.headers,
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const list = json[provider.key];
  return Array.isArray(list) ? (list as RawAc[]) : [];
}

async function fetchRegions(provider: Provider): Promise<{
  lists: RawAc[][];
  successes: number;
  lastError: string | null;
}> {
  const lists: RawAc[][] = new Array(COVERAGE.length);
  let cursor = 0;
  let successes = 0;
  let lastError: string | null = null;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= COVERAGE.length) return;
      const region = COVERAGE[i];
      const cacheKey = `${provider.name}:${region.id}`;
      try {
        const list = await fetchArea(provider, region);
        lists[i] = list;
        successes++;
        regionCache.set(cacheKey, { at: Date.now(), list });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        const cached = regionCache.get(cacheKey);
        lists[i] =
          cached && Date.now() - cached.at < REGION_STALE_MS ? cached.list : [];
      }
      if (provider.pauseMs > 0) await sleep(provider.pauseMs);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(provider.concurrency, COVERAGE.length) }, worker),
  );
  return { lists, successes, lastError };
}

/** Trafego real sobre o Brasil com fallback e cache por regiao. */
export async function fetchOpenAdsbBrazil(): Promise<{
  aircraft: LiveAircraft[];
  provider: ProviderName;
}> {
  let lastErr: unknown = null;

  for (const provider of providers()) {
    const started = Date.now();
    setHealth(provider.name, { status: "loading", error: null });
    try {
      const result = await fetchRegions(provider);
      const byHex = new Map<string, LiveAircraft>();
      for (const list of result.lists) {
        for (const ac of normalize(list ?? [])) {
          const prev = byHex.get(ac.hex);
          if (!prev || (ac.posAgeSec ?? 99) < (prev.posAgeSec ?? 99)) {
            byHex.set(ac.hex, ac);
          }
        }
      }
      const aircraft = [...byHex.values()];
      const viable = aircraft.length >= 10 && result.successes >= 2;
      setHealth(provider.name, {
        status: viable ? "online" : result.successes > 0 ? "partial" : "offline",
        latencyMs: Date.now() - started,
        successfulRegions: result.successes,
        aircraft: aircraft.length,
        lastSuccessAt: viable ? new Date().toISOString() : health.get(provider.name)?.lastSuccessAt ?? null,
        error: result.lastError,
      });
      if (viable) return { aircraft, provider: provider.name };
      lastErr = new Error(
        `${provider.name}: cobertura insuficiente (${result.successes}/${COVERAGE.length})`,
      );
    } catch (err) {
      lastErr = err;
      setHealth(provider.name, {
        status: "offline",
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastErr ?? new Error("Nenhum provedor ADS-B respondeu");
}
