"use client";

import { Plane, TriangleAlert } from "lucide-react";
import type { AirlineStat } from "@/lib/types";
import { ptNum } from "@/lib/format";

function rateTone(rate: number): string {
  if (rate <= 2) return "#34d399";
  if (rate <= 3.5) return "#fbbf24";
  return "#fb7185";
}

export default function AirlinePanel({ airlines }: { airlines: AirlineStat[] }) {
  const max = Math.max(1, ...airlines.map((a) => a.total));

  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto">
      {airlines.map((a) => (
        <li
          key={a.code}
          className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold"
                style={{
                  color: a.color,
                  background: `${a.color}1a`,
                  border: `1px solid ${a.color}40`,
                }}
              >
                {a.code}
              </span>
              <span className="truncate text-[13px] font-semibold text-slate-200">
                {a.name}
              </span>
              {a.cancelRate > 3.5 && (
                <span className="chip border-rose-400/30 bg-rose-400/10 text-rose-300">
                  <TriangleAlert size={11} /> atenção
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-cyan-200/80">
              <Plane size={11} /> {a.inFlight} em voo
            </span>
          </div>

          <div className="mt-2.5 h-[7px] w-full overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(a.total / max) * 100}%`,
                background: `linear-gradient(90deg, ${a.color}55, ${a.color})`,
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>
              <span className="font-mono text-slate-300">{a.total}</span> voos ·{" "}
              <span className="font-mono text-emerald-300/90">{a.completed}</span>{" "}
              concluídos
            </span>
            <span className="flex items-center gap-2">
              <span>
                pontualidade{" "}
                <span className="font-mono text-slate-300">{ptNum(a.onTimeRate, 0)}%</span>
              </span>
              <span
                className="chip px-2 py-[2px] font-mono"
                style={{
                  color: rateTone(a.cancelRate),
                  background: `${rateTone(a.cancelRate)}14`,
                  borderColor: `${rateTone(a.cancelRate)}38`,
                }}
              >
                {ptNum(a.cancelRate)}% canc.
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
