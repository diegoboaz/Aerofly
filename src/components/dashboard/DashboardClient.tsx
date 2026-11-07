"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Clock3,
  CloudSunRain,
  Lightbulb,
  ListTree,
  Map as MapIcon,
  PieChart as PieIcon,
  Radio,
  SatelliteDish,
  ScrollText,
  Siren,
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
import WeatherPanel from "./WeatherPanel";
import AlertPanel from "./AlertPanel";
import ProviderHealthBar from "./ProviderHealthBar";
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
  const [toasts, setToasts] = useState<
    { id: number; severity: string; title: string; message: string }[]
  >([]);
  const seenAlerts = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  // toasts de alertas novos (nao mostra os da primeira carga)
  useEffect(() => {
    if (!data) return;
    const incoming = data.alerts ?? [];
    if (firstLoad.current) {
      incoming.forEach((a) => seenAlerts.current.add(a.id));
      firstLoad.current = false;
      return;
    }
    const fresh = incoming.filter(
      (a) => !seenAlerts.current.has(a.id) && a.severity !== "info",
    );
    incoming.forEach((a) => seenAlerts.current.add(a.id));
    if (fresh.length > 0) {
      setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 3));
      for (const f of fresh) {
        setTimeout(
          () => setToasts((t) => t.filter((x) => x.id !== f.id)),
          9_000,
        );
      }
    }
  }, [data]);

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

  // polling: o servidor aplica cache para respeitar a cota da fonte; entre
  // coletas o mapa segue animando por interpolacao de trajetoria.
  // Pausa quando a aba esta oculta (economiza CPU, rede e cota de API).
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };
    const id = setInterval(tick, live ? 30_000 : 90_000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, refresh]);

  const pipeline = data?.pipeline;
  const fonteLabel = !data
    ? null
    : data.source === "flightradar24"
      ? "flightradar24"
      : data.source === "opensky"
        ? `opensky${data.auth === "anonymous" ? " · anônimo" : " · oauth2"}`
        : `${data.source} · aberto`;
  const sourceName = !data
    ? "ADS-B"
    : data.source === "flightradar24"
      ? "FlightRadar24"
      : data.source === "opensky"
        ? "OpenSky"
        : data.source;

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {data && !data.sourceAvailable && (
        <div className="relative z-20 mx-auto max-w-[1760px] px-3 pt-3 sm:px-5">
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-2.5 text-[11px] text-amber-200">
            <strong className="font-semibold">Fonte ADS-B indisponível</strong> —
            cota anônima do OpenSky esgotada ou rede instável. Meteorologia,
            histórico e eventos seguem reais. Configure{" "}
            <code className="font-mono text-amber-300">OPENSKY_CLIENT_ID</code> /{" "}
            <code className="font-mono text-amber-300">FR24_API_TOKEN</code> para
            operação contínua.
          </div>
        </div>
      )}
      {/* fundo */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-40 left-1/4 h-[420px] w-[720px] rounded-full bg-cyan-500/[0.07] blur-[120px]" />
        <div className="absolute -right-40 top-1/3 h-[380px] w-[520px] rounded-full bg-sky-600/[0.06] blur-[120px]" />
        <div className="absolute -left-40 bottom-0 h-[320px] w-[480px] rounded-full bg-amber-500/[0.035] blur-[120px]" />
      </div>

      {/* toasts de alertas em tempo real */}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[330px] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="pointer-events-auto rounded-xl border p-3 backdrop-blur"
              style={{
                borderColor:
                  t.severity === "critical"
                    ? "rgba(251,113,133,0.4)"
                    : "rgba(251,191,36,0.35)",
                background: "rgba(7,12,23,0.96)",
                boxShadow:
                  t.severity === "critical"
                    ? "0 8px 40px -8px rgba(251,113,133,0.4)"
                    : "0 8px 40px -8px rgba(251,191,36,0.3)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <Siren
                  size={16}
                  className={
                    t.severity === "critical"
                      ? "anim-blink mt-0.5 shrink-0 text-rose-400"
                      : "mt-0.5 shrink-0 text-amber-300"
                  }
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">
                    {t.title}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-slate-400">
                    {t.message}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
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
            {!data
              ? "sincronizando…"
              : !data.sourceAvailable
                ? "ADS-B indisponível — aguardando cota/rede"
                : `${fonteLabel}${data.stale ? " · cache" : ""}`}
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
          <span
            className="flex items-center gap-1.5"
            style={{
              color: !data?.weather
                ? "#94a3b8"
                : data.weather.alertCount > 0
                  ? "#fbbf24"
                  : "#34d399",
            }}
          >
            <CloudSunRain size={11} />
            clima:{" "}
            {data?.weather
              ? `open-meteo · ${data.weather.alertCount} alerta(s)`
              : "indisponível"}
          </span>
          <span className="hidden xl:inline">
            pipeline: python --mode adsb (histórico) · web (tempo real)
          </span>
        </div>
      </div>

      {data && (
        <ProviderHealthBar
          providers={data.providerHealth}
          active={data.source}
          routes={data.aircraft.filter((a) => a.origIata && a.destIata).length}
        />
      )}

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
                  {data.source}
                  {data.aircraft[0]?.posAgeSec != null
                    ? ` · fix ${data.aircraft[0].posAgeSec}s`
                    : ""}
                </span>
              }
              className="col-span-12 h-[620px] xl:col-span-7"
              bodyClassName="p-2"
            >
              <BrazilMap
                real={data.aircraft}
                realSource={sourceName}
                trackedCount={data.kpis.trackedNow}
                airportActivity={data.airportActivity}
                trails={data.trails}
                weather={data.weather?.airports ?? []}
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
                title="Companhias brasileiras · agora"
                icon={<Building2 size={13} />}
                className="h-[270px]"
              >
                <AirlinePanel airlines={data.airlines} />
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
              title="Alertas operacionais"
              icon={<Siren size={13} />}
              right={
                data.alerts.filter((a) => a.severity === "critical").length >
                0 ? (
                  <span className="chip border-rose-400/30 bg-rose-400/10 font-mono text-[10px] text-rose-300">
                    {data.alerts.filter((a) => a.severity === "critical").length}{" "}
                    crítico(s)
                  </span>
                ) : undefined
              }
              className="col-span-12 h-[460px] md:col-span-7 lg:col-span-4"
              bodyClassName="p-4"
            >
              <AlertPanel alerts={data.alerts} />
            </Panel>
            <Panel
              title="Eventos reais da operação"
              icon={<Radio size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                  feed ao vivo
                </span>
              }
              className="col-span-12 h-[460px] md:col-span-5 lg:col-span-3"
            >
              <EventFeed events={data.events} />
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-4">
            <Panel
              title="Meteorologia real nos aeroportos"
              icon={<CloudSunRain size={13} />}
              right={
                data.weather && data.weather.alertCount > 0 ? (
                  <span className="chip border-amber-400/30 bg-amber-400/10 font-mono text-[10px] text-amber-300">
                    {data.weather.alertCount} alerta(s)
                  </span>
                ) : undefined
              }
              className="col-span-12 h-[400px] lg:col-span-5"
            >
              <WeatherPanel weather={data.weather} />
            </Panel>
            <Panel
              title="Rotas reais · últimos 90 min"
              icon={<ListTree size={13} />}
              className="col-span-12 h-[400px] lg:col-span-3"
            >
              <TopRoutes routes={data.topRoutes} />
            </Panel>
            <Panel
              title="Aeronaves detectadas por hora · BRT"
              icon={<Clock3 size={13} />}
              className="col-span-12 h-[400px] lg:col-span-4"
            >
              <HourlyChart data={data.hourly} />
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              title="Aeronaves rastreadas em tempo real"
              icon={<ScrollText size={13} />}
              right={
                <span className="chip border-white/[0.07] bg-white/[0.03] font-mono text-[10px] text-slate-500">
                  {ptInt(data.kpis.trackedNow)} alvos
                </span>
              }
              className="min-h-[480px]"
            >
              <RealTrafficTable aircraft={data.aircraft} />
            </Panel>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-slate-600">
            <p>
              AeroFly · dados reais ADS-B (FlyItalyADSB / adsb.lol / adsb.fi /
              OpenSky / FlightRadar24) + rotas ADSBDB + clima Open-Meteo.
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
