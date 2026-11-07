"use client";

import { CheckCircle2, KeyRound, RadioTower, WifiOff } from "lucide-react";
import type { ProviderHealth } from "@/lib/types";

const STATUS = {
  online: { color: "#34d399", label: "online" },
  partial: { color: "#fbbf24", label: "parcial" },
  offline: { color: "#fb7185", label: "offline" },
  loading: { color: "#7dd3fc", label: "consultando" },
  idle: { color: "#94a3b8", label: "standby" },
  unconfigured: { color: "#64748b", label: "sem chave" },
} as const;

export default function ProviderHealthBar({
  providers,
  active,
  routes,
}: {
  providers: ProviderHealth[];
  active: string;
  routes: number;
}) {
  return (
    <div className="relative z-10 mx-auto mb-4 grid max-w-[1760px] grid-cols-1 gap-2 px-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
      {providers.map((p) => {
        const meta = STATUS[p.status] ?? STATUS.idle;
        const isActive = p.name === active;
        return (
          <div
            key={p.name}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
              isActive
                ? "border-cyan-400/25 bg-cyan-400/[0.06]"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ color: meta.color, background: `${meta.color}14` }}
              >
                {p.status === "offline" ? (
                  <WifiOff size={13} />
                ) : p.status === "unconfigured" ? (
                  <KeyRound size={13} />
                ) : isActive ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <RadioTower size={13} />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-semibold text-slate-300">
                  {p.name}
                  {isActive && (
                    <span className="ml-1.5 text-[8px] uppercase tracking-wider text-cyan-300">
                      ativo
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[9.5px] text-slate-600">
                  {p.status === "unconfigured"
                    ? "chave gratuita disponível"
                    : `${p.successfulRegions}/${p.totalRegions} regiões · ${p.aircraft} aeronaves`}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[9.5px]" style={{ color: meta.color }}>
                {meta.label}
              </p>
              {p.latencyMs !== null && (
                <p className="mt-0.5 font-mono text-[8.5px] text-slate-600">
                  {(p.latencyMs / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
        <div>
          <p className="font-mono text-[11px] font-semibold text-slate-300">
            ADSBDB · rotas
          </p>
          <p className="mt-0.5 text-[9.5px] text-slate-600">
            origem/destino por callsign · cache 24h
          </p>
        </div>
        <span className="font-mono text-sm font-semibold text-violet-300">
          {routes}
        </span>
      </div>
    </div>
  );
}
