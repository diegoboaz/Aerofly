"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Clock3,
  ListTree,
  Map as MapIcon,
  PieChart as PieIcon,
  Radio,
  SatelliteDish,
  ScrollText,
} from "lucide-react";
import type { DashboardData, LiveTrafficData } from "@/lib/types";
import Header from "./Header";
import { Panel } from "./Panel";
import KpiRow from "./KpiRow";
import BrazilMap from "./BrazilMap";
import StatusDonut from "./StatusDonut";
import HourlyChart from "./HourlyChart";
import AirlinePanel from "./AirlinePanel";
import TopRoutes from "./TopRoutes";
import EventFeed from "./EventFeed";
import FlightsTable from "./FlightsTable";
import { ptInt } from "@/lib/format";

function Skeleton() {
  return (
    <main className="relative mx-auto max-w-[1760px] px-3 pb-6 sm:px-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[118px]" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-12 gap-4">
        <div className="skeleton col-span-12 h-[560px] xl:col-span-7" />
        <div className="col-span-12 grid gap-4 xl:col-span-5">
          <div className="skeleton h-[270px]" />
          <div className="skeleton h-[270px]" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-12 gap-4">
        <div className="skeleton col-span-12 h-[380px] lg:col-span-5" />
        <div className="skeleton col-span-12 h-[380px] md:col-span-6 lg:col-span-3" />
        <div className="skeleton col-span-12 h-[380px] md:col-span-6 lg:col-span-4" />
      </div>
      <div className="skeleton mt-4 h-[420px]" />
    </main>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [realTraffic, setRealTraffic] = useState<LiveTrafficData | null>(null);
  const [realError, setRealError] = useState(false);
  const [showReal, setShowReal] = useState(true);
  const ticking = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as DashboardData);
      setRefreshKey((k) => k + 1);
    } catch {
      /* mantem dados anteriores */
    }
  }, []);

  // carga inicial
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // trafego real ADS-B (OpenSky) — cadencia propria por causa do limite da API
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/live-traffic", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as LiveTrafficData;
        if (mounted) {
          setRealTraffic(json);
          setRealError(false);
        }
      } catch {
        if (mounted) setRealError(true);
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // loop em tempo real: tick do motor + recarga dos dados
  useEffect(() => {
    if (!live) {
      const id = setInterval(refresh, 20000);
      return () => clearInterval(id);
    }
    const cycle = async () => {
      if (ticking.current) return;
      ticking.current = true;
      setRefreshing(true);
      try {
        await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticks: 1 }),
        });
      } catch {
        /* fallback: segue sem tick */
      }
      await refresh();
      setRefreshing(false);
      ticking.current = false;
    };
    const id = setInterval(cycle, 4000);
    return () => clearInterval(id);
  }, [live, refresh]);

  const pipeline = data?.pipeline;

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* fundo */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-40 left-1/4 h-[420px] w-[720px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[380px] w-[520px] rounded-full bg-sky-600/[0.06] blur-[120px]" />
        <div className="absolute -left-40 bottom-0 h-[320px] w-[480px] rounded-full bg-rose-500/[0.04] blur-[120px]" />
      </div>

      <Header
        data={data}
        live={live}
        onToggleLive={() => setLive((v) => !v)}
        refreshing={refreshing}
      />

      {/* faixa de telemetria da pipeline */}
      <div className="relative z-10 mx-auto mb-4 max-w-[1760px] px-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 font-mono text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5 text-cyan-300/90">
            <Radio size={11} className={live ? "anim-blink" : ""} />
            OPERAÇÃO NACIONAL
          </span>
          <span>
            voos rastreados:{" "}
            <span className="text-slate-300">{ptInt(pipeline?.totalFlights ?? 0)}</span>
          </span>
          <span>
            eventos:{" "}
            <span className="text-slate-300">{ptInt(pipeline?.totalEvents ?? 0)}</span>
          </span>
          <span>
            execuções da pipeline:{" "}
            <span className="text-slate-300">{ptInt(pipeline?.totalRuns ?? 0)}</span>
          </span>
          <span className="hidden xl:inline">
            etl: extração → transformação → carga (Python + PostgreSQL)
          </span>
          <span
            className="flex items-center gap-1.5"
            style={{
              color: realError
                ? "#fb7185"
                : realTraffic?.stale
                  ? "#fbbf24"
                  : "#34d399",
            }}
          >
            <SatelliteDish size={11} />
            ads-b real:{" "}
            {realError
              ? "offline"
              : realTraffic
                ? `${ptInt(realTraffic.count)} aeronaves (opensky${realTraffic.auth === "anonymous" ? " · anônimo" : ""}${realTraffic.stale ? " · cache" : ""})`
                : "sincronizando…"}
          </span>
        </div>
      </div>

      {!data ? (
        <Skeleton />
      ) : (
        <main className="relative z-10 mx-auto max-w-[1760px] px-3 pb-6 sm:px-5">
          <div className="rise-in">
            <KpiRow kpis={data.kpis} />
          </div>

          <div className="mt-4 grid grid-cols-12 gap-4">
            <Panel
              title="Rede aérea nacional · tempo real"
              icon={<MapIcon size={13} />}
              right={
                <button
                  onClick={() => setShowReal((v) => !v)}
                  className={`chip cursor-pointer font-mono text-[10px] transition-all ${
                    showReal
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : "border-white/[0.08] bg-white/[0.03] text-slate-500"
                  }`}
                  title="Camada de tráfego real ADS-B (OpenSky Network)"
                >
                  <SatelliteDish size={11} />
                  ads-b {realTraffic ? ptInt(realTraffic.count) : "—"}
                </button>
              }
              className="col-span-12 h-[560px] xl:col-span-7"
              bodyClassName="p-2"
            >
              <BrazilMap
                flights={data.mapFlights}
                activity={data.airportActivity}
                real={realTraffic?.aircraft ?? []}
                showReal={showReal}
              />
            </Panel>

            <div className="col-span-12 grid grid-rows-2 gap-4 xl:col-span-5">
              <Panel
                title="Situação dos voos hoje"
                icon={<PieIcon size={13} />}
                className="h-[270px]"
              >
                <StatusDonut
                  data={data.statusDistribution}
                  total={data.kpis.totalToday}
                />
              </Panel>
              <Panel
                title="Fluxo por hora · BRT"
                icon={<Clock3 size={13} />}
                className="h-[270px]"
              >
                <HourlyChart data={data.hourly} />
              </Panel>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-4">
            <Panel
              title="Desempenho por companhia"
              icon={<Building2 size={13} />}
              className="col-span-12 h-[400px] lg:col-span-5"
            >
              <AirlinePanel airlines={data.airlines} />
            </Panel>
            <Panel
              title="Rotas mais movimentadas"
              icon={<ListTree size={13} />}
              className="col-span-12 h-[400px] md:col-span-6 lg:col-span-3"
            >
              <TopRoutes routes={data.topRoutes} />
            </Panel>
            <Panel
              title="Eventos da operação"
              icon={<Radio size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                  feed ao vivo
                </span>
              }
              className="col-span-12 h-[400px] md:col-span-6 lg:col-span-4"
            >
              <EventFeed events={data.events} />
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              title="Voos monitorados"
              icon={<ScrollText size={13} />}
              className="min-h-[480px]"
            >
              <FlightsTable refreshKey={refreshKey} />
            </Panel>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-slate-600">
            <p>
              AeroFly · dados sintéticos gerados por pipeline automatizada
              (Python/PostgreSQL) para fins de demonstração operacional.
            </p>
            <p className="font-mono">
              roadmap: integração ANAC · alertas de SLA · previsão de atrasos (ML)
            </p>
          </footer>
        </main>
      )}
    </div>
  );
}
