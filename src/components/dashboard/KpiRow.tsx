"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";
import {
  Building2,
  Gauge,
  History,
  Plane,
  PlaneLanding,
  Radar,
  type LucideIcon,
} from "lucide-react";
import type { RealKpis } from "@/lib/types";
import { ptInt } from "@/lib/format";

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
  displayOverride,
  format = (v: number) => ptInt(Math.round(v)),
  icon: Icon,
  accent,
  sub,
  pulse = false,
}: {
  label: string;
  value: number;
  displayOverride?: string;
  format?: (v: number) => string;
  icon: LucideIcon;
  accent: string;
  sub?: string;
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
            {displayOverride ?? format(animated)}
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
    </div>
  );
}

export default function KpiRow({ kpis }: { kpis: RealKpis }) {
  const inAirPct =
    kpis.trackedNow > 0
      ? Math.round((kpis.airborne / kpis.trackedNow) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Rastreadas agora"
        value={kpis.trackedNow}
        icon={Radar}
        accent="#22d3ee"
        sub="sensores ADS-B · Brasil"
        pulse
      />
      <KpiCard
        label="Em voo"
        value={kpis.airborne}
        icon={Plane}
        accent="#34d399"
        sub={`${inAirPct}% do total rastreado`}
      />
      <KpiCard
        label="Em solo"
        value={kpis.onGround}
        icon={PlaneLanding}
        accent="#94a3b8"
        sub="sinal em aeroportos"
      />
      <KpiCard
        label="Voos reais · 90 min"
        value={kpis.recent90min ?? 0}
        displayOverride={kpis.recent90min === null ? "—" : undefined}
        icon={History}
        accent="#a78bfa"
        sub={
          kpis.recent90min === null
            ? "restrita no modo anônimo — use FR24_API_TOKEN"
            : "janela OpenSky /flights/all"
        }
      />
      <KpiCard
        label="Cias. monitoradas"
        value={kpis.monitoredAirborne}
        icon={Building2}
        accent="#fb7185"
        sub="GOL · LATAM · Azul · Voepass em voo"
      />
      <KpiCard
        label="Nível médio de voo"
        value={kpis.medianFlightLevel ?? 0}
        displayOverride={
          kpis.medianFlightLevel ? `FL${kpis.medianFlightLevel}` : "—"
        }
        format={(v) => `FL${Math.round(v)}`}
        icon={Gauge}
        accent="#fbbf24"
        sub="altitude mediana em cruzeiro"
      />
    </div>
  );
}
