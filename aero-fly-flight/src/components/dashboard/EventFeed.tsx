"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Clock3,
  PlaneTakeoff,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { EventRow } from "@/lib/types";
import { getAirline } from "@/lib/aviation";
import { relTime } from "@/lib/format";

const TYPE_META: Record<EventRow["type"], { icon: LucideIcon; color: string; bg: string }> = {
  departure: { icon: PlaneTakeoff, color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
  arrival: { icon: CheckCircle2, color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  cancellation: { icon: XCircle, color: "#fb7185", bg: "rgba(251,113,133,0.1)" },
  delay: { icon: Clock3, color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  boarding: { icon: Users, color: "#7dd3fc", bg: "rgba(125,211,252,0.1)" },
  created: { icon: PlaneTakeoff, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
};

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "cancellation", label: "Cancelamentos" },
  { key: "delay", label: "Atrasos" },
  { key: "departure", label: "Partidas" },
  { key: "arrival", label: "Chegadas" },
] as const;

export default function EventFeed({ events }: { events: EventRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const filtered = useMemo(
    () =>
      (filter === "all" ? events : events.filter((e) => e.type === filter)).slice(0, 30),
    [events, filter],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                active
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/[0.07] bg-white/[0.03] text-slate-500 hover:text-slate-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        <AnimatePresence initial={false} mode="popLayout">
          {filtered.map((e) => {
            const meta = TYPE_META[e.type];
            const Icon = meta.icon;
            const airlineColor = getAirline(e.airlineCode).color;
            return (
              <motion.li
                key={e.id}
                layout="position"
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-start gap-2.5 rounded-lg border border-transparent px-2 py-2 hover:border-white/[0.06] hover:bg-white/[0.03]"
              >
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
                  style={{ color: meta.color, background: meta.bg }}
                >
                  <Icon size={12} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-300">{e.message}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
                    <span
                      className="font-bold"
                      style={{ color: airlineColor }}
                    >
                      {e.airlineCode}
                    </span>
                    {e.originCode}→{e.destinationCode}
                    <span className="text-slate-600">·</span>
                    {relTime(e.createdAt)}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <li className="grid flex-1 place-items-center py-10 text-xs text-slate-500">
            Nenhum evento nesta categoria.
          </li>
        )}
      </ul>
    </div>
  );
}
