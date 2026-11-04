"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { Insight } from "@/lib/types";

const SEVERITY_META: Record<
  Insight["severity"],
  { icon: LucideIcon; color: string; bg: string; border: string; label: string }
> = {
  critical: {
    icon: Flame,
    color: "#fb7185",
    bg: "rgba(251,113,133,0.1)",
    border: "rgba(251,113,133,0.28)",
    label: "crítico",
  },
  warning: {
    icon: AlertTriangle,
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.28)",
    label: "atenção",
  },
  info: {
    icon: Info,
    color: "#7dd3fc",
    bg: "rgba(125,211,252,0.1)",
    border: "rgba(125,211,252,0.24)",
    label: "info",
  },
  success: {
    icon: CheckCircle2,
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
    border: "rgba(52,211,153,0.24)",
    label: "ok",
  },
};

function pressureTone(score: number): { color: string; label: string } {
  if (score >= 70) return { color: "#fb7185", label: "alta" };
  if (score >= 40) return { color: "#fbbf24", label: "moderada" };
  return { color: "#34d399", label: "normal" };
}

export default function InsightsPanel({
  insights,
  pressureScore,
}: {
  insights: Insight[];
  pressureScore: number;
}) {
  const tone = pressureTone(pressureScore);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* indice de pressao operacional */}
      <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Índice de pressão operacional
          </p>
          <span
            className="font-mono text-lg font-semibold"
            style={{ color: tone.color }}
          >
            {pressureScore}
            <span className="ml-1 text-[10px] font-medium uppercase tracking-wider opacity-80">
              {tone.label}
            </span>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pressureScore}%`,
              background: `linear-gradient(90deg, #34d399, #fbbf24 55%, ${tone.color})`,
            }}
          />
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-600">
          Combina filas de aproximação, pressão de pátio, esperas em voo e pico
          diário — quanto maior, maior o risco de propagação de irregularidades.
        </p>
      </div>

      {/* insights */}
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {insights.map((ins) => {
          const meta = SEVERITY_META[ins.severity];
          const Icon = meta.icon;
          return (
            <li
              key={ins.id}
              className="rounded-xl border px-3.5 py-3"
              style={{ borderColor: meta.border, background: meta.bg }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={13} style={{ color: meta.color }} className="shrink-0" />
                  <span className="truncate text-[12.5px] font-semibold text-slate-100">
                    {ins.title}
                  </span>
                </span>
                {ins.metric && (
                  <span
                    className="chip shrink-0 px-2 py-[2px] font-mono text-[10px]"
                    style={{
                      color: meta.color,
                      background: "rgba(4,7,14,0.5)",
                      borderColor: meta.border,
                    }}
                  >
                    {ins.metric}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                {ins.detail}
              </p>
            </li>
          );
        })}
        {insights.length === 0 && (
          <li className="grid flex-1 place-items-center py-8 text-center text-xs text-slate-500">
            Coletando dados reais para gerar insights…
          </li>
        )}
      </ul>
    </div>
  );
}
