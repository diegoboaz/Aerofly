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
  getRecentRealFlights,
  getTrails,
} from "@/lib/liveTraffic";
import { buildInsights } from "@/lib/insights";
import { estimateDestination } from "@/lib/geo";
import { startOfSpDay } from "@/lib/time";
import type { DashboardData, EventRow, RealRouteStat } from "@/lib/types";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [traffic, recent, trails, recentEvents, lastRuns, agg] = await Promise.all([
      getLiveTraffic(),
      getRecentRealFlights(),
      getTrails(75),
      db.select().from(flightEvents).orderBy(desc(flightEvents.createdAt)).limit(45),
      db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.createdAt)).limit(1),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM live_traffic) AS snapshots,
          (SELECT COUNT(*)::int FROM flight_events) AS total_events,
          (SELECT COUNT(*)::int FROM pipeline_runs) AS total_runs
      `),
    ]);

    const startToday = startOfSpDay(0);

    // ----- fases reais de voo (razao vertical + solo) -----
    const phaseCount: Record<string, number> = {
      climb: 0,
      cruise: 0,
      descent: 0,
      ground: 0,
    };
    for (const a of traffic.aircraft) phaseCount[flightPhase(a)]++;
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
      inAirNow: traffic.aircraft.filter((x) => x.airline === a.code && !x.onGround)
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
    for (const f of recent.flights) {
      bump(
        f.fromIcao ? (ICAO_TO_IATA[f.fromIcao] ?? null) : null,
        f.toIcao ? (ICAO_TO_IATA[f.toIcao] ?? null) : null,
      );
    }
    for (const a of traffic.aircraft) {
      if (a.origIata && a.destIata) bump(a.origIata, a.destIata);
    }
    const topRoutes = [...routeMap.values()]
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 6);

    // ----- KPIs reais -----
    const airborneAltM = traffic.aircraft
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

    // ----- insights operacionais (regras sobre dados reais) -----
    const { insights, pressureScore, airportActivity } = buildInsights(
      traffic.aircraft,
      hourly,
      events,
    );

    const data: DashboardData = {
      generatedAt: new Date().toISOString(),
      source: traffic.source,
      auth: traffic.auth,
      stale: traffic.stale,
      cacheAgeSec: traffic.cacheAgeSec,
      kpis: {
        trackedNow: traffic.count,
        airborne: traffic.airborne,
        onGround: traffic.onGround,
        recent90min: recent.available ? recent.flights.length : null,
        monitoredAirborne: airlines.reduce((s, a) => s + a.inAirNow, 0),
        medianFlightLevel: medianAltM
          ? Math.round((medianAltM * 3.28084) / 100)
          : null,
      },
      phases,
      airlines,
      hourly,
      topRoutes,
      aircraft: traffic.aircraft.map((a) => ({
        ...a,
        // destino real do FR24 tem prioridade; senao, estima pela trajetoria
        destEstimate: a.destIata
          ? null
          : estimateDestination({
              lat: a.lat,
              lon: a.lon,
              track: a.track,
              altM: a.altM,
              vsMs: a.vsMs,
              onGround: a.onGround,
            }),
      })),
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
      recentFlightsAvailable: recent.available,
      insights,
      pressureScore,
      airportActivity,
      trails,
    };

    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("dashboard error", err);
    return Response.json(
      { error: "Falha ao carregar o dashboard" },
      { status: 500 },
    );
  }
}
