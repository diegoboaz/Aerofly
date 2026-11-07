"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CloudLightning,
  Gauge,
  Info,
  PlaneTakeoff,
  RadioTower,
  Siren,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { AlertRow } from "@/lib/types";
import { relTime } from "@/lib/format";

const SEV: Record<
  string,
  { color: string; bg: string; border: string; label: string; icon: LucideIcon }
> = {
  critical: {
    color: "#fb7185",
    bg: "rgba(251,113,133,0.1)",
    border: "rgba(251,113,133,0.3)",
    label: "crítico",
    icon: Siren,
  },
  warning: {
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.28)",
    label: "atenção",
    icon: TriangleAlert,
  },
  info: {
    color: "#7dd3fc",
    bg: "rgba(125,211,252,0.08)",
    border: "rgba(125,211,252,0.22)",
    label: "info",
    icon: Info,
  },
};

const KIND_ICON: Record<string, LucideIcon> = {
  squawk_emergency: Siren,
  squawk_radio_failure: RadioTower,
  squawk_hijack: Siren,
  wx_storm: CloudLightning,
  wx_wind: Wind,
  wx_visibility: CloudLightning,
  wx_cape: CloudLightning,
  approach_queue: PlaneTakeoff,
  holding: Gauge,
  pressure_high: Gauge,
  source_down: RadioTower,
};

export default function AlertPanel({ alerts }: { alerts: AlertRow[] }) {
  const [onlyCritical, setOnlyCritical] = useState(false);

  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === "critical").length,
    [alerts],
  );
  const shown = useMemo(
    () => (onlyCritical ? alerts.filter((a) => a.severity === "critical") : alerts),
    [alerts, onlyCritical],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => setOnlyCritical((v) => !v)}
          className={`chip cursor-pointer font-mono text-[10px] transition-all ${
            onlyCritical
              ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
              : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300"
          }`}
        >
          {onlyCritical ? "só críticos" : "todos"}
        </button>
        <span className="font-mono text-[10px] text-slate-500">
          {criticalCount > 0 ? (
            <span className="text-rose-300">{criticalCount} crítico(s)</span>
          ) : (
            "sem críticos agora"
          )}
        </span>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {shown.map((a) => {
            const sev = SEV[a.severity] ?? SEV.info;
            const Icon = KIND_ICON[a.kind] ?? sev.icon;
            return (
              <motion.li
                key={a.id}
                layout="position"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl border px-3 py-2.5"
                style={{ borderColor: sev.border, background: sev.bg }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      size={14}
                      style={{ color: sev.color }}
                      className={a.severity === "critical" ? "anim-blink shrink-0" : "shrink-0"}
                    />
                    <span className="truncate text-[12px] font-semibold text-slate-100">
                      {a.title}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] text-slate-600">
                    {relTime(a.createdAt)}
                  </span>
                </div>
                <p className="mt-1 pl-6 text-[11px] leading-relaxed text-slate-400">
                  {a.message}
                </p>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {shown.length === 0 && (
          <li className="grid flex-1 place-items-center py-8 text-center text-xs text-slate-500">
            Nenhum alerta ativo. O motor avalia emergências por squawk,
            meteorologia severa e congestionamento a cada ciclo.
          </li>
        )}
      </ul>
      <p className="mt-2 px-0.5 text-[9.5px] leading-snug text-slate-600">
        Entrega configurável: <code className="text-slate-500">ALERT_WEBHOOK_URL</code>{" "}
        (Slack/Discord) e e-mail via <code className="text-slate-500">RESEND_API_KEY</code>.
        Cooldown por tipo evita repetição.
      </p>
    </div>
  );
}
