"use client";

import { MoveRight } from "lucide-react";
import type { RealRouteStat } from "@/lib/types";

export default function TopRoutes({ routes }: { routes: RealRouteStat[] }) {
  const max = Math.max(1, ...routes.map((r) => r.flights));

  if (routes.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-4 text-center text-[11px] leading-relaxed text-slate-500">
        Aguardando rotas reais — disponíveis via FlightRadar24 “full”
        (FR24_API_TOKEN) ou OpenSky /flights/all.
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-between gap-2.5 overflow-y-auto">
      {routes.map((r) => {
        const w = (r.flights / max) * 100;
        return (
          <li key={r.route}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-200">
                <span className="rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5">
                  {r.origin}
                </span>
                <MoveRight size={13} className="text-cyan-400" />
                <span className="rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5">
                  {r.destination}
                </span>
              </span>
              <span className="text-[10px] text-slate-500">
                <span className="font-mono text-slate-300">{r.flights}</span>{" "}
                {r.flights === 1 ? "voo" : "voos"}
              </span>
            </div>
            <div className="relative mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500/50 to-cyan-400/80 transition-all duration-700"
                style={{ width: `${w}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
