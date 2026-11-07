import { db } from "@/db";
import { flightEvents, pipelineRuns } from "@/db/schema";
import {
  AIRLINES,
  ICAO_TO_IATA,
  REAL_PHASE_META,
  flightPhase,
} from "@/lib/aviation";
import {
  getLiveTraffic,
  getRouteDerivedStats,
  getTrails,
  getAdsbProviderHealth,
} from "@/lib/liveTraffic";
import { buildInsights } from "@/lib/insights";
import { bearingDeg, destinationPoint, estimateDestination } from "@/lib/geo";
import { getWeather } from "@/lib/weather";
import { enrichRoutes } from "@/lib/routes";
import { evaluateAlerts, getRecentAlerts } from "@/lib/alerts";
import { jsonResponse } from "@/lib/http";
import { startOfSpDay } from "@/lib/time";
import type { DashboardData, EventRow, RealRouteStat } from "@/lib/types";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // motor de alertas em background (never bloqueia a resposta)
    void evaluateAlerts().catch(() => undefined);

    const [traffic, derived, trails, weather, recentEvents, lastRuns, agg, recentAlerts] =
      await Promise.all([
        // degrada com elegancia: se a fonte ADS-B cair por completo, o
        // dashboard continua servindo clima, histórico e eventos.
      getLiveTraffic().catch((err) => {
        console.warn("[dashboard] fonte ADS-B indisponível:", err);
        return null;
      }),
      getRouteDerivedStats(),
      getTrails(75),
      getWeather().catch(() => null),
      db.select().from(flightEvents).orderBy(desc(flightEvents.createdAt)).limit(45),
      db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.createdAt)).limit(1),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM live_traffic) AS snapshots,
          (SELECT COUNT(*)::int FROM flight_events) AS total_events,
          (SELECT COUNT(*)::int FROM pipeline_runs) AS total_runs
      `),
      getRecentAlerts(20),
    ]);

    const sourceAvailable = traffic !== null;
    const live = traffic ?? {
      updatedAt: new Date().toISOString(),
      source: "opensky" as const,
      auth: "anonymous" as const,
      count: 0,
      airborne: 0,
      onGround: 0,
      stale: true,
      cacheAgeSec: 0,
      aircraft: [],
    };

    const startToday = startOfSpDay(0);

    // Rotas reais por callsign (ADSBDB, cache 24h). Isso substitui a
    // dependencia do /flights/all limitado do OpenSky.
    const routedAircraft = await enrichRoutes(live.aircraft);

    // ----- fases reais de voo (razao vertical + solo) -----
    const phaseCount: Record<string, number> = {
      climb: 0,
      cruise: 0,
      descent: 0,
      ground: 0,
    };
    for (const a of routedAircraft) phaseCount[flightPhase(a)]++;
    const phases = Object.entries(REAL_PHASE_META).map(([status, meta]) => ({
      status,
      label: meta.label,
      color: meta.color,
      count: phaseCount[status] ?? 0,
    }));

    // ----- companhias monitoradas (real) -----
    const detectedTodayRows = (
      await db.execute(sql`
        SELECT airline_code AS code, COUNT(DISTINCT icao24)::int AS n
        FROM live_traffic
        WHERE seen_at >= ${startToday} AND airline_code IS NOT NULL
        GROUP BY airline_code
      `)
    ).rows as unknown as { code: string; n: number }[];
    const detectedToday = new Map(detectedTodayRows.map((r) => [r.code, r.n]));

    const airlines = AIRLINES.map((a) => ({
      code: a.code,
      name: a.name,
      color: a.color,
      inAirNow: routedAircraft.filter((x) => x.airline === a.code && !x.onGround)
        .length,
      detectedToday: detectedToday.get(a.code) ?? 0,
    })).sort((x, y) => y.inAirNow - x.inAirNow);

    // ----- aeronaves distintas por hora (historico real do dia) -----
    const hourlyRows = (
      await db.execute(sql`
        SELECT to_char(seen_at AT TIME ZONE 'America/Sao_Paulo', 'HH24') AS hh,
               COUNT(DISTINCT icao24)::int AS n
        FROM live_traffic
        WHERE seen_at >= ${startToday}
        GROUP BY hh
      `)
    ).rows as unknown as { hh: string; n: number }[];
    const hourlyMap = new Map(hourlyRows.map((r) => [r.hh, r.n]));
    const hourly = Array.from({ length: 19 }, (_, i) => {
      const hh = String(i + 5).padStart(2, "0");
      return { hour: hh, aircraft: hourlyMap.get(hh) ?? 0 };
    });

    // ----- rotas reais (voos recentes OpenSky + rotas IATA do FR24) -----
    const routeMap = new Map<string, RealRouteStat>();
    const bump = (origin: string | null, destination: string | null) => {
      if (!origin || !destination || origin === destination) return;
      const key = `${origin}→${destination}`;
      const r = routeMap.get(key) ?? {
        route: key,
        origin,
        destination,
        flights: 0,
      };
      r.flights++;
      routeMap.set(key, r);
    };
    // rotas derivadas do NOSSO historico real (90 min) + rotas IATA do FR24
    for (const r of derived.routes) {
      for (let i = 0; i < r.count; i++) bump(r.from, r.to);
    }
    for (const a of routedAircraft) {
      if (a.origIata && a.destIata) bump(a.origIata, a.destIata);
    }
    const topRoutes = [...routeMap.values()]
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 6);

    // ----- KPIs reais -----
    const airborneAltM = routedAircraft
      .filter((a) => !a.onGround && a.altM !== null)
      .map((a) => a.altM!)
      .sort((x, y) => x - y);
    const medianAltM = airborneAltM.length
      ? airborneAltM[Math.floor(airborneAltM.length / 2)]
      : null;

    const events: EventRow[] = recentEvents.map((e) => ({
      id: e.id,
      flightNumber: e.flightNumber,
      airlineCode: e.airlineCode,
      originCode: e.originCode,
      destinationCode: e.destinationCode,
      type: e.type,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    }));

    const totals = (agg.rows as Record<string, number>[])[0] ?? {};

    // ----- precisao: dead-reckoning + rumo do rastro + confianca -----
    const trailTrackByHex = new Map<string, number>();
    for (const t of trails) {
      if (t.points.length < 2) continue;
      // usa os ultimos pontos do rastro: rumo medio mais estavel que a proa
      const seg = t.points.slice(-4);
      const [lat1, lon1] = seg[0];
      const [lat2, lon2] = seg[seg.length - 1];
      if (lat1 !== lat2 || lon1 !== lon2) {
        trailTrackByHex.set(t.hex, bearingDeg(lat1, lon1, lat2, lon2));
      }
    }

    const preciseAircraft = routedAircraft.map((a) => {
      const trailTrack = trailTrackByHex.get(a.hex) ?? null;
      // compensa a idade do fix ADS-B projetando a posicao no circulo maximo
      let lat = a.lat;
      let lon = a.lon;
      const age = a.posAgeSec ?? null;
      if (
        !a.onGround &&
        age !== null &&
        age > 5 &&
        age < 900 &&
        a.speedKmh &&
        a.track !== null
      ) {
        const km = (a.speedKmh / 3600) * age;
        const p = destinationPoint(a.lat, a.lon, a.track, km);
        lat = p.lat;
        lon = p.lon;
      }
      const est = a.destIata
        ? null
        : estimateDestination(
            { lat, lon, track: a.track, altM: a.altM, vsMs: a.vsMs, onGround: a.onGround },
            trailTrack,
          );
      return {
        ...a,
        // ~11 m de precisao: suficiente para o mapa e reduz o JSON
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
        track: a.track === null ? null : Math.round(a.track * 10) / 10,
        trailTrack: trailTrack === null ? null : Math.round(trailTrack),
        destEstimate: est?.code ?? null,
        destConfidence: est?.confidence ?? null,
      };
    });

    // ----- insights operacionais (regras sobre dados reais + clima) -----
    const { insights, pressureScore, airportActivity } = buildInsights(
      preciseAircraft,
      hourly,
      events,
      weather,
    );

    const openHealth = getAdsbProviderHealth();
    const fr24Configured = Boolean(process.env.FR24_API_TOKEN);
    const providerHealth = [
      {
        name: "flightradar24",
        configured: fr24Configured,
        status: (live.source === "flightradar24"
          ? "online"
          : fr24Configured
            ? "idle"
            : "unconfigured") as
          | "online"
          | "idle"
          | "unconfigured",
        latencyMs: null,
        successfulRegions: live.source === "flightradar24" ? 1 : 0,
        totalRegions: 1,
        aircraft: live.source === "flightradar24" ? live.count : 0,
        lastSuccessAt:
          live.source === "flightradar24" ? live.updatedAt : null,
        error: null,
      },
      ...openHealth,
    ];

    const data: DashboardData = {
      generatedAt: new Date().toISOString(),
      source: live.source,
      auth: live.auth,
      stale: live.stale,
      cacheAgeSec: live.cacheAgeSec,
      kpis: {
        trackedNow: live.count,
        airborne: live.airborne,
        onGround: live.onGround,
        recent90min: derived.activeAircraft > 0 ? derived.activeAircraft : null,
        monitoredAirborne: airlines.reduce((s, a) => s + a.inAirNow, 0),
        medianFlightLevel: medianAltM
          ? Math.round((medianAltM * 3.28084) / 100)
          : null,
      },
      phases,
      airlines,
      hourly,
      topRoutes,
      aircraft: preciseAircraft,
      events,
      pipeline: {
        lastRun: lastRuns[0]
          ? {
              source: lastRuns[0].source,
              mode: lastRuns[0].mode,
              createdAt: lastRuns[0].createdAt.toISOString(),
              durationMs: lastRuns[0].durationMs,
              inserted: lastRuns[0].inserted,
              updated: lastRuns[0].updated,
              cancelled: lastRuns[0].cancelled,
            }
          : null,
        totalRuns: totals.total_runs ?? 0,
        adsbSnapshots: totals.snapshots ?? 0,
        totalEvents: totals.total_events ?? 0,
      },
      recentFlightsAvailable: derived.activeAircraft > 0,
      insights,
      pressureScore,
      airportActivity,
      trails,
      weather,
      sourceAvailable,
      alerts: recentAlerts.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity as "info" | "warning" | "critical",
        title: a.title,
        message: a.message,
        airport: a.airport,
        flightNumber: a.flightNumber,
        createdAt: a.createdAt.toISOString(),
      })),
      providerHealth,
    };

    return jsonResponse(data, req);
  } catch (err) {
    console.error("dashboard error", err);
    return Response.json(
      { error: "Falha ao carregar o dashboard" },
      { status: 500 },
    );
  }
}
