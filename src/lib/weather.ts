// ============================================================
// AeroFly — Meteorologia REAL (Open-Meteo)
// https://open-meteo.com/en/docs — gratuito, sem chave de API.
// Uma unica chamada multi-ponto cobre todos os aeroportos
// monitorados: vento, rajadas, chuva, visibilidade, trovoadas
// e CAPE (energia convectiva — potencial de tempestade severa).
// ============================================================

import { AIRPORTS } from "./aviation";
import type { AirportWeather, WeatherData, WeatherSeverity } from "./types";

const BASE = "https://api.open-meteo.com/v1/forecast";

/** Códigos WMO -> descricao em pt-BR + se e tempestade */
const WMO: Record<number, { text: string; storm?: boolean; rain?: boolean }> = {
  0: { text: "Céu limpo" },
  1: { text: "Predomínio de sol" },
  2: { text: "Parcialmente nublado" },
  3: { text: "Encoberto" },
  45: { text: "Nevoeiro" },
  48: { text: "Nevoeiro com geada" },
  51: { text: "Garoa fraca", rain: true },
  53: { text: "Garoa moderada", rain: true },
  55: { text: "Garoa densa", rain: true },
  56: { text: "Garoa congelante", rain: true },
  57: { text: "Garoa congelante densa", rain: true },
  61: { text: "Chuva fraca", rain: true },
  63: { text: "Chuva moderada", rain: true },
  65: { text: "Chuva forte", rain: true },
  66: { text: "Chuva congelante", rain: true },
  67: { text: "Chuva congelante forte", rain: true },
  71: { text: "Neve fraca" },
  73: { text: "Neve moderada" },
  75: { text: "Neve forte" },
  77: { text: "Grãos de neve" },
  80: { text: "Pancadas de chuva", rain: true },
  81: { text: "Pancadas moderadas", rain: true },
  82: { text: "Pancadas violentas", rain: true },
  85: { text: "Pancadas de neve" },
  86: { text: "Pancadas de neve forte" },
  95: { text: "Trovoada", storm: true, rain: true },
  96: { text: "Trovoada com granizo", storm: true, rain: true },
  99: { text: "Trovoada severa com granizo", storm: true, rain: true },
};

const describe = (code: number) => WMO[code]?.text ?? `Código ${code}`;
const isStorm = (code: number) => Boolean(WMO[code]?.storm);

/** Rosa dos ventos a partir do azimute */
export function windCardinal(deg: number): string {
  const dirs = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Classifica o impacto operacional das condicoes.
 * Baseado em limiares usados na aviacao (rajadas, visibilidade,
 * trovoada e energia convectiva).
 */
function classify(w: {
  code: number;
  gustKmh: number;
  windKmh: number;
  visibilityM: number | null;
  precipMm: number;
  cape: number | null;
}): { severity: WeatherSeverity; reasons: string[] } {
  const reasons: string[] = [];
  let severity: WeatherSeverity = "ok";
  const raise = (s: WeatherSeverity) => {
    const order: WeatherSeverity[] = ["ok", "watch", "warning", "severe"];
    if (order.indexOf(s) > order.indexOf(severity)) severity = s;
  };

  if (isStorm(w.code)) {
    raise("severe");
    reasons.push(describe(w.code));
  }
  if (w.gustKmh >= 65) {
    raise("severe");
    reasons.push(`rajadas de ${Math.round(w.gustKmh)} km/h`);
  } else if (w.gustKmh >= 45) {
    raise("warning");
    reasons.push(`rajadas de ${Math.round(w.gustKmh)} km/h`);
  } else if (w.gustKmh >= 30) {
    raise("watch");
    reasons.push(`vento de ${Math.round(w.gustKmh)} km/h em rajada`);
  }
  if (w.visibilityM !== null) {
    if (w.visibilityM < 1500) {
      raise("severe");
      reasons.push(`visibilidade ${(w.visibilityM / 1000).toFixed(1)} km`);
    } else if (w.visibilityM < 3000) {
      raise("warning");
      reasons.push(`visibilidade ${(w.visibilityM / 1000).toFixed(1)} km`);
    } else if (w.visibilityM < 5000) {
      raise("watch");
      reasons.push(`visibilidade reduzida (${(w.visibilityM / 1000).toFixed(1)} km)`);
    }
  }
  if (w.precipMm >= 4) {
    raise("warning");
    reasons.push(`chuva intensa (${w.precipMm.toFixed(1)} mm/h)`);
  } else if (w.precipMm > 0.1) {
    raise("watch");
    reasons.push(`precipitação ${w.precipMm.toFixed(1)} mm/h`);
  }
  // CAPE: energia convectiva — risco de tempestade/microexplosão
  if (w.cape !== null) {
    if (w.cape >= 3000) {
      raise("severe");
      reasons.push(`CAPE ${Math.round(w.cape)} J/kg — risco de tempestade severa`);
    } else if (w.cape >= 2000) {
      raise("warning");
      reasons.push(`CAPE ${Math.round(w.cape)} J/kg — convecção forte`);
    } else if (w.cape >= 1200) {
      raise("watch");
      reasons.push(`CAPE ${Math.round(w.cape)} J/kg`);
    }
  }
  return { severity, reasons };
}

interface OmPoint {
  current?: {
    time: string;
    temperature_2m: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    visibility: number | null;
  };
  hourly?: {
    time: string[];
    precipitation_probability: (number | null)[];
    cape: (number | null)[];
  };
}

const TTL_MS = Number(process.env.WEATHER_TTL_MS ?? 600_000); // 10 min
let cache: { at: number; data: WeatherData } | null = null;

async function fetchWeather(): Promise<WeatherData> {
  const lats = AIRPORTS.map((a) => a.lat).join(",");
  const lons = AIRPORTS.map((a) => a.lon).join(",");
  const qs = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current:
      "temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility",
    hourly: "precipitation_probability,cape",
    forecast_hours: "3",
    timezone: "America/Sao_Paulo",
  });

  const res = await fetch(`${BASE}?${qs}`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
  const json = (await res.json()) as OmPoint[] | OmPoint;
  const points = Array.isArray(json) ? json : [json];

  const airports: AirportWeather[] = [];
  points.forEach((p, i) => {
    const ap = AIRPORTS[i];
    const c = p.current;
    if (!ap || !c) return;
    // pico de CAPE nas proximas horas (tendencia convectiva)
    const capeSeries = (p.hourly?.cape ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    const cape = capeSeries.length ? Math.max(...capeSeries) : null;
    const rainProbSeries = (p.hourly?.precipitation_probability ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    const rainProb = rainProbSeries.length ? Math.max(...rainProbSeries) : null;

    const { severity, reasons } = classify({
      code: c.weather_code,
      gustKmh: c.wind_gusts_10m,
      windKmh: c.wind_speed_10m,
      visibilityM: c.visibility,
      precipMm: c.precipitation,
      cape,
    });

    airports.push({
      code: ap.code,
      city: ap.city,
      lat: ap.lat,
      lon: ap.lon,
      tempC: c.temperature_2m,
      condition: describe(c.weather_code),
      weatherCode: c.weather_code,
      storm: isStorm(c.weather_code),
      precipMm: c.precipitation,
      rainProbability: rainProb,
      cloudCover: c.cloud_cover,
      windKmh: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      windCardinal: windCardinal(c.wind_direction_10m),
      gustKmh: c.wind_gusts_10m,
      visibilityM: c.visibility,
      cape,
      severity,
      reasons,
      observedAt: c.time,
    });
  });

  const rank: Record<WeatherSeverity, number> = {
    severe: 0,
    warning: 1,
    watch: 2,
    ok: 3,
  };
  airports.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    updatedAt: new Date().toISOString(),
    provider: "open-meteo",
    stale: false,
    airports,
    alertCount: airports.filter(
      (a) => a.severity === "severe" || a.severity === "warning",
    ).length,
  };
}

let inFlight: Promise<WeatherData> | null = null;

function revalidate(): Promise<WeatherData> {
  if (!inFlight) {
    inFlight = fetchWeather()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Meteorologia real dos aeroportos (stale-while-revalidate, 10 min) */
export async function getWeather(): Promise<WeatherData> {
  if (cache) {
    const ageMs = Date.now() - cache.at;
    if (ageMs >= TTL_MS) void revalidate().catch(() => undefined);
    return ageMs >= TTL_MS ? { ...cache.data, stale: true } : cache.data;
  }
  return revalidate();
}
