"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Download,
  Plane,
  Radio,
  RefreshCw,
} from "lucide-react";
import type { DashboardData } from "@/lib/types";
import { fmtClock, fmtDate, relTime } from "@/lib/format";

export default function Header({
  data,
  live,
  onToggleLive,
  refreshing,
}: {
  data: DashboardData | null;
  live: boolean;
  onToggleLive: () => void;
  refreshing: boolean;
}) {
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastRun = data?.pipeline.lastRun;

  return (
    <header className="relative z-10 mx-auto flex max-w-[1760px] flex-wrap items-center gap-x-5 gap-y-3 px-3 pb-4 pt-5 sm:px-5">
      {/* marca */}
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/25 to-sky-600/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.25)]">
          <Plane size={18} strokeWidth={2.2} className="-rotate-45" />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-none tracking-[0.22em] text-slate-100">
            AERO<span className="glow-text text-cyan-300">FLY</span>
          </h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Radar operacional · Brasil
          </p>
        </div>
      </div>

      <div className="mx-auto hidden items-center gap-4 lg:flex">
        <p className="text-right text-[11px] leading-tight text-slate-500">
          {clock ? fmtDate(clock) : "—"}
          <span className="block font-mono text-base font-semibold text-slate-200">
            {clock ? fmtClock(clock) : "--:--:--"}{" "}
            <span className="text-[10px] font-medium text-slate-500">BRT</span>
          </span>
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2 lg:ml-0">
        {/* status da pipeline */}
        <span
          className="chip border-white/[0.08] bg-white/[0.03] font-mono text-slate-400"
          title="Última execução da pipeline de dados"
        >
          <Activity size={11} className="text-cyan-300" />
          pipeline{" "}
          {lastRun ? (
            <>
              <span className="text-slate-200">{lastRun.source}</span>·{" "}
              {relTime(lastRun.createdAt)}
            </>
          ) : (
            "—"
          )}
          {refreshing && (
            <RefreshCw size={11} className="animate-spin text-cyan-300" />
          )}
        </span>

        {/* toggle tempo real */}
        <button
          onClick={onToggleLive}
          className={`chip cursor-pointer transition-all ${
            live
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-white/[0.08] bg-white/[0.03] text-slate-500"
          }`}
        >
          <Radio size={11} className={live ? "anim-blink" : ""} />
          {live ? "ao vivo" : "pausado"}
        </button>

        {/* exportacao */}
        <a
          href="/api/export"
          className="chip border-cyan-400/30 bg-cyan-400/10 text-cyan-200 transition-colors hover:bg-cyan-400/20"
        >
          <Download size={11} />
          exportar CSV
        </a>
      </div>
    </header>
  );
}
