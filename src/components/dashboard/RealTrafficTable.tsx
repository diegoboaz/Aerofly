"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AIRLINES, REAL_PHASE_META, flightPhase } from "@/lib/aviation";
import type { LiveAircraft } from "@/lib/types";

const PAGE_SIZE = 12;

function PhaseBadge({ phase }: { phase: string }) {
  const meta = REAL_PHASE_META[phase] ?? REAL_PHASE_META.cruise;
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

export default function RealTrafficTable({ aircraft }: { aircraft: LiveAircraft[] }) {
  const [q, setQ] = useState("");
  const [airline, setAirline] = useState("all");
  const [phase, setPhase] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    let rows = aircraft;
    if (query) {
      rows = rows.filter(
        (a) =>
          (a.callsign ?? "").toUpperCase().includes(query) ||
          (a.flightNumber ?? "").toUpperCase().includes(query) ||
          (a.registration ?? "").toUpperCase().includes(query) ||
          (a.aircraftType ?? "").toUpperCase().includes(query) ||
          a.hex.toUpperCase().includes(query),
      );
    }
    if (airline === "none") rows = rows.filter((a) => !a.airline);
    else if (airline !== "all") rows = rows.filter((a) => a.airline === airline);
    if (phase !== "all") rows = rows.filter((a) => flightPhase(a) === phase);
    // cias monitoradas primeiro, depois por altitude
    return [...rows].sort((a, b) => {
      const aw = a.airline ? 1 : 0;
      const bw = b.airline ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return (b.altM ?? 0) - (a.altM ?? 0);
    });
  }, [aircraft, q, airline, phase]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar callsign, matrícula, modelo ou hex…"
            className="h-8 w-56 rounded-lg border border-white/[0.08] bg-white/[0.03] pl-8 pr-3 text-xs text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/40"
          />
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
          <option value="none">Sem companhia identificada</option>
        </select>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: "Todas as fases" },
            { key: "climb", label: "Subindo" },
            { key: "cruise", label: "Cruzeiro" },
            { key: "descent", label: "Descendo" },
            { key: "ground", label: "Em solo" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setPhase(f.key);
                setPage(1);
              }}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                phase === f.key
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/[0.07] bg-white/[0.03] text-slate-500 hover:text-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* tabela */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-[#0a1120]/95 backdrop-blur">
            <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Callsign</th>
              <th className="px-4 py-2.5 font-semibold">Matrícula</th>
              <th className="px-4 py-2.5 font-semibold">Modelo</th>
              <th className="px-4 py-2.5 font-semibold">Companhia</th>
              <th className="px-4 py-2.5 font-semibold">Rota</th>
              <th className="px-4 py-2.5 font-semibold">Nível</th>
              <th className="px-4 py-2.5 font-semibold">Velocidade</th>
              <th className="px-4 py-2.5 font-semibold">Razão vertical</th>
              <th className="px-4 py-2.5 font-semibold">Precisão</th>
              <th className="px-4 py-2.5 font-semibold">Fase</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => {
              const airlineMeta = a.airline
                ? AIRLINES.find((x) => x.code === a.airline)
                : null;
              const fl = a.altM ? Math.round((a.altM * 3.28084) / 100) : null;
              const emergency =
                a.squawk === "7700" || a.squawk === "7600" || a.squawk === "7500";
              return (
                <tr
                  key={a.hex}
                  className={`border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] ${
                    emergency ? "bg-rose-500/[0.08]" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className="font-mono font-semibold"
                      style={{ color: airlineMeta?.color ?? "#fbbf24" }}
                    >
                      {a.callsign ?? a.hex.toUpperCase()}
                    </span>
                    {emergency && (
                      <span
                        className="chip ml-2 px-1.5 py-[1px] font-mono text-[9px]"
                        style={{
                          color: "#fb7185",
                          background: "rgba(251,113,133,0.12)",
                          borderColor: "rgba(251,113,133,0.35)",
                        }}
                        title={`Squawk de emergência ${a.squawk}`}
                      >
                        SQK {a.squawk}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {a.registration ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {a.aircraftType ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {airlineMeta?.name ?? a.country}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {a.origIata && a.destIata ? (
                      <>
                        {a.origIata}
                        <span className="mx-1 text-slate-600">→</span>
                        {a.destIata}
                      </>
                    ) : a.destEstimate ? (
                      <span
                        className="text-amber-300/90"
                        title={`Destino estimado pela trajetória${a.destConfidence ? ` — confiança ${a.destConfidence}%` : ""}`}
                      >
                        → {a.destEstimate}
                        <span className="ml-1 text-[9px] text-slate-600">
                          {a.destConfidence ? `${a.destConfidence}%` : "est."}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {fl ? `FL${fl}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {a.speedKmh ? `${a.speedKmh} km/h` : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {a.vsMs === null ? (
                      <span className="text-slate-600">—</span>
                    ) : a.vsMs > 0.8 ? (
                      <span className="text-sky-300">+{a.vsMs.toFixed(1)} m/s</span>
                    ) : a.vsMs < -0.8 ? (
                      <span className="text-amber-300">{a.vsMs.toFixed(1)} m/s</span>
                    ) : (
                      <span className="text-slate-500">nivelada</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[10px]">
                    {a.posAgeSec !== null && a.posAgeSec !== undefined ? (
                      <span
                        style={{ color: a.posAgeSec <= 15 ? "#34d399" : a.posAgeSec <= 60 ? "#7dd3fc" : "#fbbf24" }}
                        title="Idade do fix ADS-B (quanto menor, mais precisa a posição)"
                      >
                        {a.posAgeSec}s
                        {a.accuracyM ? (
                          <span className="ml-1 text-slate-600">±{a.accuracyM}m</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <PhaseBadge phase={flightPhase(a)} />
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma aeronave com os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* paginacao */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-mono">{filtered.length} aeronaves</span>
        <span className="flex items-center gap-2">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="font-mono">
            {safePage} / {pages}
          </span>
          <button
            disabled={safePage >= pages}
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
