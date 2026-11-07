"use client";

import {
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSun,
  Cloudy,
  Sun,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AirportWeather, WeatherData, WeatherSeverity } from "@/lib/types";

const SEV: Record<WeatherSeverity, { color: string; bg: string; border: string; label: string }> = {
  severe: {
    color: "#fb7185",
    bg: "rgba(251,113,133,0.1)",
    border: "rgba(251,113,133,0.3)",
    label: "severo",
  },
  warning: {
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.28)",
    label: "atenção",
  },
  watch: {
    color: "#7dd3fc",
    bg: "rgba(125,211,252,0.08)",
    border: "rgba(125,211,252,0.22)",
    label: "observar",
  },
  ok: {
    color: "#34d399",
    bg: "rgba(52,211,153,0.07)",
    border: "rgba(52,211,153,0.18)",
    label: "ok",
  },
};

function weatherIcon(w: AirportWeather): LucideIcon {
  if (w.storm) return Zap;
  const c = w.weatherCode;
  if (c === 45 || c === 48) return CloudFog;
  if (c >= 51 && c <= 57) return CloudDrizzle;
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return CloudRain;
  if (c === 3) return Cloudy;
  if (c === 1 || c === 2) return CloudSun;
  if (c === 0) return Sun;
  return Cloudy;
}

export default function WeatherPanel({ weather }: { weather: WeatherData | null }) {
  if (!weather) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-4 text-center text-[11px] text-slate-500">
        Serviço meteorológico indisponível no momento.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <span className="font-mono text-[10px] text-slate-500">
          open-meteo · {weather.airports.length} aeroportos
          {weather.stale && " · cache"}
        </span>
        <span
          className="chip px-2 py-[2px] font-mono text-[10px]"
          style={{
            color: weather.alertCount > 0 ? "#fbbf24" : "#34d399",
            background:
              weather.alertCount > 0
                ? "rgba(251,191,36,0.1)"
                : "rgba(52,211,153,0.1)",
            borderColor:
              weather.alertCount > 0
                ? "rgba(251,191,36,0.28)"
                : "rgba(52,211,153,0.2)",
          }}
        >
          {weather.alertCount} alerta(s)
        </span>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {weather.airports.map((w) => {
          const sev = SEV[w.severity];
          const Icon = weatherIcon(w);
          return (
            <li
              key={w.code}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: sev.border, background: sev.bg }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={14} style={{ color: sev.color }} className="shrink-0" />
                  <span className="font-mono text-xs font-bold text-slate-100">
                    {w.code}
                  </span>
                  <span className="truncate text-[11px] text-slate-400">
                    {w.condition}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-slate-300">
                  {Math.round(w.tempC)}°C
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Wind size={10} style={{ color: sev.color }} />
                  {Math.round(w.windKmh)}
                  <span className="text-slate-600">/</span>
                  <span style={{ color: w.gustKmh >= 45 ? "#fbbf24" : undefined }}>
                    {Math.round(w.gustKmh)} km/h
                  </span>
                  <span className="text-slate-600">{w.windCardinal}</span>
                </span>
                {w.visibilityM !== null && (
                  <span
                    style={{ color: w.visibilityM < 3000 ? "#fbbf24" : undefined }}
                  >
                    vis {(w.visibilityM / 1000).toFixed(1)} km
                  </span>
                )}
                {w.precipMm > 0 && (
                  <span className="text-sky-300">{w.precipMm.toFixed(1)} mm/h</span>
                )}
                {w.rainProbability !== null && w.rainProbability >= 40 && (
                  <span className="text-sky-300/80">chuva {w.rainProbability}%</span>
                )}
                {w.cape !== null && w.cape >= 1200 && (
                  <span
                    style={{ color: w.cape >= 2000 ? "#fb7185" : "#fbbf24" }}
                    title="CAPE — energia convectiva disponível (potencial de tempestade)"
                  >
                    CAPE {Math.round(w.cape)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-0.5 text-[9.5px] leading-snug text-slate-600">
        Dados reais Open-Meteo. CAPE alto indica potencial de tempestade severa
        (microexplosões, granizo) — risco operacional em pousos e decolagens.
      </p>
    </div>
  );
}
