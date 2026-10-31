"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";
import {
  CheckCircle2,
  Clock3,
  Gauge,
  Plane,
  PlaneTakeoff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Kpis } from "@/lib/types";
import { ptInt, ptNum } from "@/lib/format";

function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const controls = animate(value, target, {
      duration: 0.7,
      ease: [0.22, 0.8, 0.3, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function KpiCard({
  label,
  value,
  format = (v: number) => ptInt(Math.round(v)),
  icon: Icon,
  accent,
  sub,
  children,
  pulse = false,
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  icon: LucideIcon;
  accent: string;
  sub?: string;
  children?: React.ReactNode;
  pulse?: boolean;
}) {
  const animated = useAnimatedNumber(value);
  return (
    <div className="panel group relative overflow-hidden px-4 py-4">
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[0.13] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.22]"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 font-mono text-[30px] font-semibold leading-none text-slate-100">
            {format(animated)}
          </p>
        </div>
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border"
          style={{
            color: accent,
            borderColor: `${accent}33`,
            background: `${accent}14`,
          }}
        >
          <Icon size={15} strokeWidth={2.2} className={pulse ? "anim-blink" : ""} />
        </span>
      </div>
      {sub && <p className="mt-2.5 truncate text-[11px] text-slate-500">{sub}</p>}
      {children}
    </div>
  );
}

export default function KpiRow({ kpis }: { kpis: Kpis }) {
  const rateTone =
    kpis.cancellationRate <= 2
      ? "#34d399"
      : kpis.cancellationRate <= 3.5
        ? "#fbbf24"
        : "#fb7185";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Voos hoje"
        value={kpis.totalToday}
        icon={PlaneTakeoff}
        accent="#22d3ee"
        sub={`${kpis.scheduled} programados restantes`}
      />
      <KpiCard
        label="Concluídos"
        value={kpis.completed}
        icon={CheckCircle2}
        accent="#34d399"
        sub={`${ptNum(kpis.onTimeRate)}% dentro do horário`}
      />
      <KpiCard
        label="Em voo agora"
        value={kpis.inFlight}
        icon={Plane}
        accent="#7dd3fc"
        sub={`${kpis.boarding} em embarque`}
        pulse
      />
      <KpiCard
        label="Atrasados"
        value={kpis.delayed}
        icon={Clock3}
        accent="#fbbf24"
        sub={kpis.delayed > 0 ? `média de ${kpis.avgDelay} min` : "sem atrasos relevantes"}
      />
      <KpiCard
        label="Cancelados"
        value={kpis.cancelled}
        icon={XCircle}
        accent="#fb7185"
        sub="voos suprimidos hoje"
      />
      <KpiCard
        label="Taxa de cancelamento"
        value={kpis.cancellationRate}
        format={(v) => `${ptNum(v)}%`}
        icon={Gauge}
        accent={rateTone}
        sub="meta operacional ≤ 3%"
      >
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, (kpis.cancellationRate / 5) * 100)}%`,
              background: `linear-gradient(90deg, ${rateTone}88, ${rateTone})`,
            }}
          />
        </div>
      </KpiCard>
    </div>
  );
}
