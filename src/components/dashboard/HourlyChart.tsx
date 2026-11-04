"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface HourlyTrafficPoint {
  hour: string;
  aircraft: number;
}

function HourlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1120]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="font-mono font-semibold text-slate-200">{label}h — Brasília</p>
      <p className="mt-1 text-cyan-300">
        {payload[0]?.value ?? 0} aeronaves distintas
      </p>
      <p className="text-[10px] text-slate-500">histórico real (live_traffic)</p>
    </div>
  );
}

export default function HourlyChart({ data }: { data: HourlyTrafficPoint[] }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center gap-4 px-1 text-[10px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-full bg-cyan-400/80" /> Aeronaves
          distintas detectadas/hora
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="hourlyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.07)" />
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              interval={2}
              tick={{ fontSize: 10, fill: "#64748b", fontFamily: "JetBrains Mono" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#475569", fontFamily: "JetBrains Mono" }}
              allowDecimals={false}
            />
            <Tooltip content={<HourlyTooltip />} cursor={{ stroke: "rgba(148,163,184,0.2)" }} />
            <Area
              type="monotone"
              dataKey="aircraft"
              stroke="#22d3ee"
              strokeWidth={1.8}
              fill="url(#hourlyFill)"
              isAnimationActive
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
