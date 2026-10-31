"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AIRLINES, STATUS_META, getAirline } from "@/lib/aviation";
import { fmtTime } from "@/lib/format";
import type { FlightsPage } from "@/lib/types";

const STATUS_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "departed", label: "Em voo" },
  { key: "boarding", label: "Embarcando" },
  { key: "scheduled", label: "Programados" },
  { key: "completed", label: "Concluídos" },
  { key: "cancelled", label: "Cancelados" },
] as const;

function StatusBadge({ status }: { status: keyof typeof STATUS_META | string }) {
  const meta = STATUS_META[status] ?? STATUS_META.scheduled;
  return (
    <span
      className="chip"
      style={{
        color: meta.color,
        background: meta.soft,
        borderColor: `${meta.color}30`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

export default function FlightsTable({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState<string>("all");
  const [airline, setAirline] = useState<string>("all");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FlightsPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          status,
          airline,
          q: qDebounced,
          page: String(page),
        });
        const res = await fetch(`/api/flights?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as FlightsPage;
        if (!cancelled) setData(json);
      } catch {
        /* mantem dados anteriores */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, airline, qDebounced, page, refreshKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* barra de filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar voo, aeroporto ou motivo…"
            className="h-8 w-56 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                status === f.key
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/[0.07] bg-white/[0.03] text-slate-500 hover:text-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={airline}
          onChange={(e) => {
            setAirline(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-lg border border-white/[0.08] bg-[#0a1120] px-2 text-xs text-slate-300 outline-none focus:border-cyan-400/40"
        >
          <option value="all">Todas as companhias</option>
          {AIRLINES.map((a) => (
            <option key={a.code} value={a.code}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* tabela */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full min-w-[860px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-[#0a1120]/95 backdrop-blur">
            <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Voo</th>
              <th className="px-4 py-2.5 font-semibold">Companhia</th>
              <th className="px-4 py-2.5 font-semibold">Rota</th>
              <th className="px-4 py-2.5 font-semibold">Partida</th>
              <th className="px-4 py-2.5 font-semibold">Chegada</th>
              <th className="px-4 py-2.5 font-semibold">Atraso</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Motivo / obs.</th>
            </tr>
          </thead>
          <tbody>
            {(data?.flights ?? []).map((f) => {
              const a = getAirline(f.airlineCode);
              return (
                <tr
                  key={f.id}
                  className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-2.5">
                    <span
                      className="font-mono font-semibold"
                      style={{ color: a.color }}
                    >
                      {f.flightNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{a.name}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {f.originCode}
                    <span className="mx-1 text-slate-600">→</span>
                    {f.destinationCode}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {fmtTime(f.scheduledDeparture)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {fmtTime(f.scheduledArrival)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {f.status === "cancelled" ? (
                      <span className="text-slate-600">—</span>
                    ) : f.delayMinutes >= 15 ? (
                      <span className="text-amber-300">+{f.delayMinutes} min</span>
                    ) : f.delayMinutes > 0 ? (
                      <span className="text-slate-400">+{f.delayMinutes} min</span>
                    ) : (
                      <span className="text-emerald-300/80">no horário</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-slate-500">
                    {f.status === "cancelled"
                      ? (f.cancellationReason ?? "—")
                      : f.status === "departed"
                        ? "em trânsito"
                        : "—"}
                  </td>
                </tr>
              );
            })}
            {!loading && (data?.flights.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  Nenhum voo encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-8 w-full" />
            ))}
          </div>
        )}
      </div>

      {/* paginacao */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-mono">
          {data ? `${data.total} voos encontrados` : "carregando…"}
        </span>
        <span className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="font-mono">
            {data?.page ?? 1} / {data?.pages ?? 1}
          </span>
          <button
            disabled={!data || page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronRight size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}
