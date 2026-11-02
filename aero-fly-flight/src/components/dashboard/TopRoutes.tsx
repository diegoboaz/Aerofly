"use client";

import { MoveRight } from "lucide-react";
import type { RouteStat } from "@/lib/types";
import { ptNum } from "@/lib/format";

export default function TopRoutes({ routes }: { routes: RouteStat[] }) {
  const max = Math.max(1, ...routes.map((r) => r.total));

  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-between gap-2.5 overflow-y-auto">
      {routes.map((r) => {
        const w = (r.total / max) * 100;
        const cancelW = r.total ? (r.cancelled / r.total) * w : 0;
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
                <span className="font-mono text-slate-300">{r.total}</span> voos
              </span>
            </div>
            <div className="relative mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500/50 to-emerald-400/80 transition-all duration-700"
                style={{ width: `${w}%` }}
              />
              {cancelW > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-rose-400"
                  style={{ width: `${cancelW}%` }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>
                <span className="font-mono text-emerald-300/90">{r.completed}</span>{" "}
                concluídos
              </span>
              <span>
                cancelamento{" "}
                <span
                  className="font-mono"
                  style={{ color: r.cancelRate > 3.5 ? "#fb7185" : "#94a3b8" }}
                >
                  {ptNum(r.cancelRate)}%
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
