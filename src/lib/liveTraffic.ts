// ============================================================
// AeroFly — Trafego aereo REAL (camada multi-fonte)
//
// Ordem de prioridade dos provedores:
//   1. FlightRadar24 (API oficial) — se FR24_API_TOKEN definida
//   2. OpenSky Network (ADS-B)     — fallback automatico
//
// Alem das posicoes ao vivo, integra os voos REAIS recentes
// (OpenSky /flights/all) e deriva EVENTOS REAIS das transicoes
// (aeronave detectada / decolagem / pouso) gravadas no banco.
// ============================================================

import { db } from "@/db";
import { flightEvents, liveTraffic } from "@/db/schema";
import { sql } from "drizzle-orm";
import { fetchFr24Brazil, fr24Configured } from "./flightRadar";
import type {
  LiveAircraft,
  LiveTrafficData,
  RealRouteFlight,
  Trail,
} from "./types";

export type { LiveAircraft, LiveTrafficData, RealRouteFlight };

// ------- OpenSky Network -------
const BBOX = { lamin: -34.5, lomin: -74, lamax: 6, lomax: -33 };
const API_BASE = "https://opensky-network.org/api";
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

const ICAO_TO_IATA: Record<string, string> = {
  TAM: "LA",
  LAN: "LA",
  GLO: "G3",
  AZU: "AD",
  PTB: "2Z",
};

const airlineOf = (callsign: string | null): string | null =>
  callsign ? (ICAO_TO_IATA[callsign.slice(0, 3)] ?? null) : null;

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getOpenSkyToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OpenSky token: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 1800) * 1000,
  };
  return tokenCache.token;
}

type RawState = (string | number | boolean | null)[];

async function fetchOpenSkyBrazil(): Promise<{
  aircraft: LiveAircraft[];
  auth: "oauth2" | "anonymous";
}> {
  const token = await getOpenSkyToken();
  const qs = new URLSearchParams({
    lamin: String(BBOX.lamin),
    lomin: String(BBOX.lomin),
    lamax: String(BBOX.lamax),
    lomax: String(BBOX.lomax),
  });
  const res = await fetch(`${API_BASE}/states/all?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("OpenSky: limite de requisições atingido");
  if (!res.ok) throw new Error(`OpenSky: HTTP ${res.status}`);
  const json = (await res.json()) as { states?: RawState[] | null };

  const aircraft: LiveAircraft[] = [];
  for (const s of json.states ?? []) {
    const lon = s[5];
    const lat = s[6];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const callsign = typeof s[1] === "string" && s[1].trim() ? s[1].trim() : null;
    const speed = typeof s[9] === "number" ? s[9] : null;
    aircraft.push({
      hex: String(s[0]),
      callsign,
      airline: airlineOf(callsign),
      country: typeof s[2] === "string" ? s[2] : "?",
      lat,
      lon,
      altM: typeof s[7] === "number" ? Math.round(s[7]) : null,
      speedKmh: speed !== null ? Math.round(speed * 3.6) : null,
      track: typeof s[10] === "number" ? s[10] : null,
      vsMs: typeof s[11] === "number" ? s[11] : null,
      onGround: s[8] === true,
    });
  }
  return { aircraft, auth: token ? "oauth2" : "anonymous" };
}

// ------- eventos REAIS derivados das transicoes ADS-B -------
let prevSnapshot = new Map<string, boolean>(); // hex -> onGround

async function emitRealEvents(aircraft: LiveAircraft[]): Promise<void> {
  const current = new Map<string, boolean>();
  const events: (typeof flightEvents.$inferInsert)[] = [];
  const isBaseline = prevSnapshot.size === 0;

  for (const a of aircraft) {
    current.set(a.hex, a.onGround);
    const prev = prevSnapshot.get(a.hex);
    const cs = a.callsign ?? a.hex.toUpperCase();
    const airline = a.airline ?? (a.callsign?.slice(0, 3) || "ADS-B");
    const fl = a.altM ? `FL${Math.round((a.altM * 3.28084) / 100)}` : null;
    const base = {
      flightNumber: cs,
      airlineCode: airline,
      originCode: a.origIata ?? "BR",
      destinationCode: a.destIata ?? "BR",
    };
    const extra = `${fl ? ` · ${fl}` : ""}${a.speedKmh ? ` · ${a.speedKmh} km/h` : ""}`;

    // baseline (1a coleta): registra so as companhias monitoradas em voo
    if (isBaseline) {
      if (a.airline && !a.onGround && a.altM !== null && a.altM > 2000) {
        events.push({
          ...base,
          type: "created",
          message: `${cs} detectado sobre o Brasil${extra}`,
        });
      }
      continue;
    }

    if (prev === undefined && !a.onGround && a.altM !== null && a.altM > 600) {
      events.push({
        ...base,
        type: "created",
        message: `${cs} detectado sobre o espaço aéreo brasileiro${extra}`,
      });
    } else if (prev === false && a.onGround) {
      events.push({
        ...base,
        type: "arrival",
        message: `Pouso detectado · ${cs} agora em solo`,
      });
    } else if (prev === true && !a.onGround) {
      events.push({
        ...base,
        type: "departure",
        message: `Decolagem detectada · ${cs} em subida${fl ? ` (${fl})` : ""}`,
      });
    }
  }
  prevSnapshot = current;

  if (events.length === 0) return;
  try {
    // prioriza eventos de pousos/decolagens e limita volume por ciclo
    const priority = [...events].sort((a, b) => {
      const w = (t: string) => (t === "created" ? 1 : 0);
      return w(a.type) - w(b.type);
    });
    await db.insert(flightEvents).values(priority.slice(0, 30));
  } catch (err) {
    console.warn("[live-traffic] falha ao gravar eventos reais:", err);
  }
}

// ------- voos REAIS recentes (OpenSky /flights/all) -------
interface RecentCache {
  at: number;
  flights: RealRouteFlight[];
  available: boolean;
}
let recentCache: RecentCache | null = null;
const RECENT_TTL_MS = 240_000;
const RECENT_WINDOW_S = 90 * 60; // ultimos 90 minutos

export async function getRecentRealFlights(): Promise<{
  flights: RealRouteFlight[];
  available: boolean;
}> {
  if (recentCache && Date.now() - recentCache.at < RECENT_TTL_MS) {
    return { flights: recentCache.flights, available: recentCache.available };
  }
  try {
    const token = await getOpenSkyToken();
    const end = Math.floor(Date.now() / 1000);
    const begin = end - RECENT_WINDOW_S;
    const res = await fetch(`${API_BASE}/flights/all?begin=${begin}&end=${end}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as RawState[];

    const flights: RealRouteFlight[] = [];
    for (const f of json ?? []) {
      const fromIcao = typeof f[2] === "string" ? f[2] : null;
      const toIcao = typeof f[4] === "string" ? f[4] : null;
      const callsign = typeof f[1] === "string" && f[1].trim() ? f[1].trim() : null;
      // foco Brasil: ao menos uma ponta em aeroporto brasileiro (SB**)
      const touchesBr = fromIcao?.startsWith("SB") || toIcao?.startsWith("SB");
      if (!touchesBr) continue;
      flights.push({
        callsign,
        airline: airlineOf(callsign),
        fromIcao,
        toIcao,
        firstSeen: typeof f[3] === "number" ? f[3] : 0,
        lastSeen: typeof f[5] === "number" ? f[5] : 0,
      });
    }
    // anonimo: /flights/all retorna amostra global restrita — sem cobertura BR
    // confiavel; nesse caso consideramos a fonte de rotas indisponivel.
    const available = flights.length > 0;
    recentCache = { at: Date.now(), flights, available };
    return { flights, available };
  } catch (err) {
    console.warn("[live-traffic] flights/all indisponível:", err);
    recentCache = { at: Date.now(), flights: recentCache?.flights ?? [], available: false };
    return { flights: recentCache.flights, available: false };
  }
}

// ------- persistencia dos snapshots (constroi os rastros) -------
let lastPrune = 0;

async function persistSnapshot(
  aircraft: LiveAircraft[],
  source: string,
): Promise<void> {
  if (aircraft.length === 0) return;
  try {
    await db.insert(liveTraffic).values(
      aircraft.map((a) => ({
        icao24: a.hex,
        callsign: a.callsign,
        airlineCode: a.airline,
        originCountry: a.country,
        lat: a.lat,
        lon: a.lon,
        baroAltitude: a.altM,
        speedKmh: a.speedKmh,
        track: a.track,
        verticalRate: a.vsMs,
        onGround: a.onGround,
        source,
        origIata: a.origIata ?? null,
        destIata: a.destIata ?? null,
      })),
    );
    // limpeza periodica (retem 24h de historico)
    if (Date.now() - lastPrune > 3600_000) {
      lastPrune = Date.now();
      await db.execute(
        sql`DELETE FROM live_traffic WHERE seen_at < now() - interval '24 hours'`,
      );
    }
  } catch (err) {
    console.warn("[live-traffic] falha ao persistir snapshot:", err);
  }
}

/** Rastros reais percorridos (historico de posicoes do proprio banco) */
export async function getTrails(minutes = 75): Promise<Trail[]> {
  try {
    const rows = (
      await db.execute(sql`
        SELECT icao24, callsign, airline_code, lat, lon, on_ground,
               extract(epoch from seen_at)::bigint AS ts
        FROM live_traffic
        WHERE seen_at > now() - make_interval(mins => ${minutes})
        ORDER BY icao24, seen_at
      `)
    ).rows as unknown as {
      icao24: string;
      callsign: string | null;
      airline_code: string | null;
      lat: number;
      lon: number;
      on_ground: boolean;
      ts: string | number;
    }[];

    const byHex = new Map<string, Trail>();
    for (const r of rows) {
      let t = byHex.get(r.icao24);
      if (!t) {
        t = {
          hex: r.icao24,
          callsign: r.callsign,
          airline: r.airline_code,
          points: [],
        };
        byHex.set(r.icao24, t);
      }
      const last = t.points.at(-1);
      // descarta pontos repetidos/estaticos
      if (
        !last ||
        Math.abs(last[0] - r.lat) > 0.012 ||
        Math.abs(last[1] - r.lon) > 0.012
      ) {
        t.points.push([Number(r.lat), Number(r.lon)]);
      }
    }

    return [...byHex.values()]
      .filter((t) => t.points.length >= 2)
      .map((t) => ({ ...t, points: t.points.slice(-40) }))
      // companhias monitoradas primeiro, depois trilhas mais longas
      .sort((a, b) => {
        const aw = a.airline ? 1 : 0;
        const bw = b.airline ? 1 : 0;
        if (aw !== bw) return bw - aw;
        return b.points.length - a.points.length;
      })
      .slice(0, 160);
  } catch (err) {
    console.warn("[live-traffic] falha ao carregar rastros:", err);
    return [];
  }
}

// ------- cache + cadeia de provedores -------
// Cota anonima do OpenSky (~400 req/dia) exige cache largo: 180s ≈ 480 req/dia
// no pior caso. Com credenciais (OAuth2/FR24) pode baixar via env.
const TTL_MS = Number(process.env.LIVE_TRAFFIC_TTL_MS ?? 180_000);
let cache: { at: number; data: LiveTrafficData } | null = null;

async function fetchLiveTraffic(): Promise<LiveTrafficData> {
  if (fr24Configured()) {
    try {
      const aircraft = await fetchFr24Brazil();
      await emitRealEvents(aircraft);
      await persistSnapshot(aircraft, "flightradar24");
      return {
        updatedAt: new Date().toISOString(),
        source: "flightradar24",
        auth: "api-key",
        count: aircraft.length,
        airborne: aircraft.filter((a) => !a.onGround).length,
        onGround: aircraft.filter((a) => a.onGround).length,
        stale: false,
        cacheAgeSec: 0,
        aircraft,
      };
    } catch (err) {
      console.warn(
        "[live-traffic] FR24 falhou, usando OpenSky:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const os = await fetchOpenSkyBrazil();
  await emitRealEvents(os.aircraft);
  await persistSnapshot(os.aircraft, "opensky");
  return {
    updatedAt: new Date().toISOString(),
    source: "opensky",
    auth: os.auth,
    count: os.aircraft.length,
    airborne: os.aircraft.filter((a) => !a.onGround).length,
    onGround: os.aircraft.filter((a) => a.onGround).length,
    stale: false,
    cacheAgeSec: 0,
    aircraft: os.aircraft,
  };
}

/** Ultimo snapshot REAL persistido (resiliencia quando a fonte cai) */
async function loadLatestSnapshotFromDb(): Promise<LiveTrafficData | null> {
  try {
    const rows = (
      await db.execute(sql`
        SELECT DISTINCT ON (icao24)
          icao24, callsign, airline_code, origin_country, lat, lon,
          baro_altitude, speed_kmh, track, vertical_rate, on_ground,
          source, orig_iata, dest_iata,
          extract(epoch from seen_at)::bigint AS ts
        FROM live_traffic
        WHERE seen_at > now() - interval '60 minutes'
        ORDER BY icao24, seen_at DESC
      `)
    ).rows as unknown as Record<string, string | number | boolean | null>[];
    if (rows.length === 0) return null;

    let newest = 0;
    const aircraft: LiveAircraft[] = rows.map((r) => {
      newest = Math.max(newest, Number(r.ts ?? 0));
      return {
        hex: String(r.icao24),
        callsign: (r.callsign as string | null) ?? null,
        airline: (r.airline_code as string | null) ?? null,
        country: (r.origin_country as string | null) ?? "?",
        lat: Number(r.lat),
        lon: Number(r.lon),
        altM: r.baro_altitude === null ? null : Number(r.baro_altitude),
        speedKmh: r.speed_kmh === null ? null : Number(r.speed_kmh),
        track: r.track === null ? null : Number(r.track),
        vsMs: r.vertical_rate === null ? null : Number(r.vertical_rate),
        onGround: Boolean(r.on_ground),
        origIata: (r.orig_iata as string | null) ?? null,
        destIata: (r.dest_iata as string | null) ?? null,
      };
    });

    const source =
      (rows[0].source as string) === "flightradar24" ? "flightradar24" : "opensky";
    return {
      updatedAt: new Date(newest * 1000).toISOString(),
      source: source as LiveTrafficData["source"],
      auth: "anonymous",
      count: aircraft.length,
      airborne: aircraft.filter((a) => !a.onGround).length,
      onGround: aircraft.filter((a) => a.onGround).length,
      stale: true,
      cacheAgeSec: Math.max(0, Math.round(Date.now() / 1000 - newest)),
      aircraft,
    };
  } catch (err) {
    console.warn("[live-traffic] fallback de banco indisponível:", err);
    return null;
  }
}

/** Retorna o trafego real com cache (protege o limite das APIs) */
export async function getLiveTraffic(): Promise<LiveTrafficData> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return {
      ...cache.data,
      cacheAgeSec: Math.round((Date.now() - cache.at) / 1000),
    };
  }
  try {
    const data = await fetchLiveTraffic();
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    if (cache) {
      return {
        ...cache.data,
        stale: true,
        cacheAgeSec: Math.round((Date.now() - cache.at) / 1000),
      };
    }
    // fonte fora do ar e sem cache em memoria: usa o ultimo snapshot real
    const fromDb = await loadLatestSnapshotFromDb();
    if (fromDb) {
      console.warn("[live-traffic] servindo último snapshot persistido (fonte indisponível)");
      return fromDb;
    }
    throw err;
  }
}
