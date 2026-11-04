"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { PhaseSlice } from "@/lib/types";
import { ptNum } from "@/lib/format";

export default function StatusDonut({
  data,
  total,
}: {
  data: PhaseSlice[];
  total: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center gap-2">
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={56}
              outerRadius={78}
              paddingAngle={3}
              cornerRadius={5}
              stroke="rgba(4,7,14,0.9)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={700}
            >
              {data.map((d) => (
                <Cell key={d.status} fill={d.color} fillOpacity={0.9} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-2xl font-semibold leading-none text-slate-100">
              {total}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              aeronaves
            </p>
          </div>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {data.map((d) => {
          const pct = total ? (d.count / total) * 100 : 0;
          return (
            <li key={d.status} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-400">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: d.color, boxShadow: `0 0 6px ${d.color}` }}
                  />
                  <span className="truncate">{d.label}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-300">
                  {d.count}
                  <span className="ml-1.5 text-slate-500">{ptNum(pct, 0)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: d.color, opacity: 0.75 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
