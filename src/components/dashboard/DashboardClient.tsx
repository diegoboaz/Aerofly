"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Clock3,
  Lightbulb,
  ListTree,
  Map as MapIcon,
  PieChart as PieIcon,
  Radio,
  SatelliteDish,
  ScrollText,
} from "lucide-react";
import type { DashboardData } from "@/lib/types";
import Header from "./Header";
import { Panel } from "./Panel";
import KpiRow from "./KpiRow";
import BrazilMap from "./BrazilMap";
import StatusDonut from "./StatusDonut";
import HourlyChart from "./HourlyChart";
import AirlinePanel from "./AirlinePanel";
import TopRoutes from "./TopRoutes";
import EventFeed from "./EventFeed";
import RealTrafficTable from "./RealTrafficTable";
import InsightsPanel from "./InsightsPanel";
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      setData((await res.json()) as DashboardData);
    } catch {
      /* mantem dados anteriores */
    } finally {
      setRefreshing(false);
    }
  }, []);

  // carga inicial
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // polling: o servidor aplica cache (180s) para respeitar a cota da fonte;
  // entre coletas o mapa segue animando por interpolacao de trajetoria.
  useEffect(() => {
    const id = setInterval(refresh, live ? 30_000 : 90_000);
    return () => clearInterval(id);
  }, [live, refresh]);

  const pipeline = data?.pipeline;
  const fonteLabel = !data
    ? null
    : data.source === "flightradar24"
      ? "flightradar24"
      : `opensky${data.auth === "anonymous" ? " · anônimo" : " · oauth2"}`;

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* fundo */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-40 left-1/4 h-[420px] w-[720px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[380px] w-[520px] rounded-full bg-sky-600/[0.06] blur-[120px]" />
        <div className="absolute -left-40 bottom-0 h-[320px] w-[480px] rounded-full bg-amber-500/[0.035] blur-[120px]" />
      </div>

      <Header
        data={data}
        live={live}
        onToggleLive={() => setLive((v) => !v)}
        refreshing={refreshing}
      />

      {/* faixa de telemetria */}
      <div className="relative z-10 mx-auto mb-4 max-w-[1760px] px-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 font-mono text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5 text-cyan-300/90">
            <Radio size={11} className={live ? "anim-blink" : ""} />
            TRÁFEGO REAL · BRASIL
          </span>
          <span
            className="flex items-center gap-1.5"
            style={{
              color: !data ? "#94a3b8" : data.stale ? "#fbbf24" : "#34d399",
            }}
          >
            <SatelliteDish size={11} />
            fonte:{" "}
            {data
              ? `${fonteLabel}${data.stale ? " · cache" : ""}`
              : "sincronizando…"}
          </span>
          <span>
            aeronaves agora:{" "}
            <span className="text-slate-300">{ptInt(data?.kpis.trackedNow ?? 0)}</span>
          </span>
          <span>
            snapshots ads-b:{" "}
            <span className="text-slate-300">{ptInt(pipeline?.adsbSnapshots ?? 0)}</span>
          </span>
          <span>
            eventos reais:{" "}
            <span className="text-slate-300">{ptInt(pipeline?.totalEvents ?? 0)}</span>
          </span>
          <span className="hidden xl:inline">
            pipeline: python --mode adsb (histórico) · web (tempo real)
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
              title="Tráfego aéreo real · Brasil (ADS-B)"
              icon={<MapIcon size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-400">
                  <SatelliteDish size={11} className="text-amber-300" />
                  {data.source === "flightradar24" ? "flightradar24" : "opensky"}
                </span>
              }
              className="col-span-12 h-[560px] xl:col-span-7"
              bodyClassName="p-2"
            >
              <BrazilMap
                real={data.aircraft}
                realSource={
                  data.source === "flightradar24" ? "FlightRadar24" : "OpenSky"
                }
                trackedCount={data.kpis.trackedNow}
                airportActivity={data.airportActivity}
                trails={data.trails}
              />
            </Panel>

            <div className="col-span-12 grid grid-rows-2 gap-4 xl:col-span-5">
              <Panel
                title="Fase dos voos agora"
                icon={<PieIcon size={13} />}
                className="h-[270px]"
              >
                <StatusDonut data={data.phases} total={data.kpis.trackedNow} />
              </Panel>
              <Panel
                title="Aeronaves detectadas por hora · BRT"
                icon={<Clock3 size={13} />}
                className="h-[270px]"
              >
                <HourlyChart data={data.hourly} />
              </Panel>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-4">
            <Panel
              title="Insights operacionais · gerados dos dados reais"
              icon={<Lightbulb size={13} />}
              className="col-span-12 h-[460px] lg:col-span-5"
              bodyClassName="p-4"
            >
              <InsightsPanel
                insights={data.insights}
                pressureScore={data.pressureScore}
              />
            </Panel>
            <Panel
              title="Companhias brasileiras · agora"
              icon={<Building2 size={13} />}
              className="col-span-12 h-[460px] md:col-span-7 lg:col-span-4"
            >
              <AirlinePanel airlines={data.airlines} />
            </Panel>
            <Panel
              title="Rotas reais · últimos 90 min"
              icon={<ListTree size={13} />}
              className="col-span-12 h-[460px] md:col-span-5 lg:col-span-3"
            >
              <TopRoutes routes={data.topRoutes} />
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-4">
            <Panel
              title="Eventos reais da operação"
              icon={<Radio size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                  feed ao vivo
                </span>
              }
              className="col-span-12 h-[480px] lg:col-span-4"
            >
              <EventFeed events={data.events} />
            </Panel>
            <Panel
              title="Aeronaves rastreadas em tempo real"
              icon={<ScrollText size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                  {ptInt(data.kpis.trackedNow)} alvos
                </span>
              }
              className="col-span-12 min-h-[480px] lg:col-span-8"
            >
              <RealTrafficTable aircraft={data.aircraft} />
            </Panel>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-slate-600">
            <p>
              AeroFly · 100% dados reais ADS-B (OpenSky / FlightRadar24).
              Cancelamentos e malha programada exigem fonte oficial — roadmap:
              ANAC / AviationStack.
            </p>
            <p className="font-mono">
              roadmap: rotas reais via FR24 full · histórico densidade · alertas
            </p>
          </footer>
        </main>
      )}
    </div>
  );
}
