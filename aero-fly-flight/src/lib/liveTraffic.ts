// ============================================================
// AeroFly — Tráfego aéreo REAL via OpenSky Network (ADS-B)
// Busca os vetores de estado (posicao, altitude, velocidade)
// de aeronaves voando sobre o Brasil neste momento.
//
// Documentacao: https://openskynetwork.github.io/opensky-api/
// - anonimo: ~400 req/dia (sem credenciais)
// - autenticado (OAuth2): ~4000 req/dia — defina
//   OPENSKY_CLIENT_ID e OPENSKY_CLIENT_SECRET no ambiente
// ============================================================

import type { LiveAircraft, LiveTrafficData } from "./types";

export type { LiveAircraft, LiveTrafficData };

// Janela que cobre todo o territorio brasileiro
const BBOX = { lamin: -34.5, lomin: -74, lamax: 6, lomax: -33 };
const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

// Prefixos ICAO -> IATA das companhias monitoradas
const ICAO_TO_IATA: Record<string, string> = {
  TAM: "LA",
  LAN: "LA",
  GLO: "G3",
  AZU: "AD",
  PTB: "2Z",
};

const TTL_MS = Number(process.env.LIVE_TRAFFIC_TTL_MS ?? 90_000);
let cache: { at: number; data: LiveTrafficData } | null = null;
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
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

async function fetchStates(token: string | null): Promise<RawState[]> {
  const qs = new URLSearchParams({
    lamin: String(BBOX.lamin),
    lomin: String(BBOX.lomin),
    lamax: String(BBOX.lamax),
    lomax: String(BBOX.lomax),
  });
  const res = await fetch(`${STATES_URL}?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 429) throw new Error("OpenSky: limite de requisições atingido");
  if (!res.ok) throw new Error(`OpenSky: HTTP ${res.status}`);
  const json = (await res.json()) as { states?: RawState[] | null };
  return json.states ?? [];
}

function normalize(states: RawState[]): LiveAircraft[] {
  const out: LiveAircraft[] = [];
  for (const s of states) {
    const lon = s[5];
    const lat = s[6];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const callsign = typeof s[1] === "string" && s[1].trim() ? s[1].trim() : null;
    const airline = callsign ? (ICAO_TO_IATA[callsign.slice(0, 3)] ?? null) : null;
    const speed = typeof s[9] === "number" ? s[9] : null;
    out.push({
      hex: String(s[0]),
      callsign,
      airline,
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
  return out;
}

/** Retorna o trafego real com cache (evita estourar o limite da API) */
export async function getLiveTraffic(): Promise<LiveTrafficData> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return {
      ...cache.data,
      cacheAgeSec: Math.round((Date.now() - cache.at) / 1000),
    };
  }
  try {
    const token = await getAccessToken();
    const states = await fetchStates(token);
    const aircraft = normalize(states);
    const data: LiveTrafficData = {
      updatedAt: new Date().toISOString(),
      source: "opensky",
      auth: token ? "oauth2" : "anonymous",
      count: aircraft.length,
      airborne: aircraft.filter((a) => !a.onGround).length,
      onGround: aircraft.filter((a) => a.onGround).length,
      stale: false,
      cacheAgeSec: 0,
      aircraft,
    };
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
    throw err;
  }
}
