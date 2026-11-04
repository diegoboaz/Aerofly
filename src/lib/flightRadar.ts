// ============================================================
// AeroFly — Tráfego REAL via API oficial do FlightRadar24
// https://fr24api.flightradar24.com/docs
//
// Autenticacao: Bearer token (FR24_API_TOKEN) — crie em
// https://fr24api.flightradar24.com -> Key management.
// Planos pagos por credito; ha sandbox gratuito para testes
// (FR24_BASE_URL=https://fr24api.flightradar24.com/api/sandbox).
//
// Endpoint usado: GET /live/flight-positions/{full|light}?bounds=N,S,W,E
// ============================================================

import type { LiveAircraft } from "./types";

const FR24_BASE = (
  process.env.FR24_BASE_URL ?? "https://fr24api.flightradar24.com/api"
).replace(/\/$/, "");
const MODE = process.env.FR24_POSITIONS_MODE === "light" ? "light" : "full";

// bounds: norte, sul, oeste, leste — janela que cobre o Brasil
const BOUNDS_BR = "6,-34.5,-74,-33";

const ICAO_TO_IATA: Record<string, string> = {
  TAM: "LA",
  LAN: "LA",
  GLO: "G3",
  AZU: "AD",
  PTB: "2Z",
};

export function fr24Configured(): boolean {
  return Boolean(process.env.FR24_API_TOKEN);
}

interface Fr24Raw {
  fr24_id?: string;
  hex?: string;
  flight?: string | null;
  callsign?: string | null;
  lat?: number;
  lon?: number;
  track?: number | null;
  alt?: number | null; // pes
  gspeed?: number | null; // nos
  vspeed?: number | null; // pes/min
  reg?: string | null;
  orig_iata?: string | null;
  dest_iata?: string | null;
}

/** Matriculas brasileiras comecam com PP-, PR-, PS-, PT- ou PU- */
function countryFromReg(reg: string | null | undefined): string {
  if (reg && /^P[PRSTU]/i.test(reg)) return "Brasil";
  return "FR24";
}

function normalize(rows: Fr24Raw[]): LiveAircraft[] {
  const out: LiveAircraft[] = [];
  for (const p of rows) {
    if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
    const callsign = p.callsign?.trim() || null;
    const gspeed = typeof p.gspeed === "number" ? p.gspeed : null;
    const vspeed = typeof p.vspeed === "number" ? p.vspeed : null;
    const alt = typeof p.alt === "number" ? p.alt : null;
    out.push({
      hex: String(p.fr24_id ?? p.hex ?? callsign ?? `${p.lat},${p.lon}`),
      callsign,
      airline: callsign ? (ICAO_TO_IATA[callsign.slice(0, 3)] ?? null) : null,
      country: countryFromReg(p.reg),
      lat: p.lat,
      lon: p.lon,
      altM: alt !== null ? Math.round(alt * 0.3048) : null,
      speedKmh: gspeed !== null ? Math.round(gspeed * 1.852) : null,
      track: typeof p.track === "number" ? p.track : null,
      vsMs: vspeed !== null ? Math.round(vspeed * 0.00508 * 100) / 100 : null,
      onGround: alt === 0,
      flightNumber: p.flight ?? null,
      origIata: p.orig_iata ?? null,
      destIata: p.dest_iata ?? null,
    });
  }
  return out;
}

/** Busca posicoes reais no Brasil via FlightRadar24. Lanca excecao em erro. */
export async function fetchFr24Brazil(): Promise<LiveAircraft[]> {
  const token = process.env.FR24_API_TOKEN;
  if (!token) throw new Error("FR24_API_TOKEN não configurado");

  const res = await fetch(
    `${FR24_BASE}/live/flight-positions/${MODE}?bounds=${BOUNDS_BR}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Version": "v1",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error(`FR24: token inválido (HTTP ${res.status})`);
  }
  if (res.status === 429) {
    throw new Error("FR24: limite de créditos/requisições atingido");
  }
  if (!res.ok) throw new Error(`FR24: HTTP ${res.status}`);

  const json = (await res.json()) as { data?: Fr24Raw[] };
  return normalize(json.data ?? []);
}
