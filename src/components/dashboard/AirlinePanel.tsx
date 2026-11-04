"use client";

import { Plane } from "lucide-react";
import type { RealAirlineStat } from "@/lib/types";
import { ptInt } from "@/lib/format";

export default function AirlinePanel({ airlines }: { airlines: RealAirlineStat[] }) {
  const max = Math.max(1, ...airlines.map((a) => a.inAirNow));
  const totalAir = airlines.reduce((s, a) => s + a.inAirNow, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-cyan-200/80">
                <Plane size={11} /> {a.inAirNow} em voo
              </span>
            </div>

            <div className="mt-2.5 h-[7px] w-full overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(a.inAirNow / max) * 100}%`,
                  background: `linear-gradient(90deg, ${a.color}55, ${a.color})`,
                }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span>
                <span className="font-mono text-slate-300">{ptInt(a.detectedToday)}</span>{" "}
                aeronaves distintas hoje
              </span>
              <span className="font-mono text-[10px] text-slate-600">
                {totalAir > 0 ? `${Math.round((a.inAirNow / totalAir) * 100)}% do total` : "—"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-[10px] text-slate-600">
        Contagens reais via callsign ADS-B (TAM/LAN→LA, GLO→G3, AZU→AD, PTB→2Z).
        “Hoje” cresce conforme a pipeline acumula snapshots.
      </p>
    </div>
  );
}
