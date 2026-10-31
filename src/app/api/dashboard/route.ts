import { db } from "@/db";
import { flightEvents, flights, pipelineRuns } from "@/db/schema";
import { AIRLINES, STATUS_META } from "@/lib/aviation";
import { ensureSeeded, startOfSpDay } from "@/lib/simulation";
import type {
  DashboardData,
  EventRow,
  FlightRow,
  HourlyPoint,
  MapFlight,
} from "@/lib/types";
import { and, desc, gte, lt, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SP_OFFSET_MS = 3 * 3600_000;
const spHour = (d: Date) => new Date(d.getTime() - SP_OFFSET_MS).getUTCHours();

function toRow(f: typeof flights.$inferSelect): FlightRow {
  return {
    id: f.id,
    flightNumber: f.flightNumber,
    airlineCode: f.airlineCode,
    originCode: f.originCode,
    destinationCode: f.destinationCode,
    status: f.status,
    delayMinutes: f.delayMinutes,
    cancellationReason: f.cancellationReason,
    scheduledDeparture: f.scheduledDeparture.toISOString(),
    scheduledArrival: f.scheduledArrival.toISOString(),
    actualDeparture: f.actualDeparture?.toISOString() ?? null,
    actualArrival: f.actualArrival?.toISOString() ?? null,
    blockMinutes: f.blockMinutes,
  };
}

export async function GET() {
  try {
    await ensureSeeded("web");

    const startToday = startOfSpDay(0);
    const endToday = startOfSpDay(1);
    const nowMs = Date.now();

    const [todayFlights, recentEvents, lastRuns, totals] = await Promise.all([
      db
        .select()
        .from(flights)
        .where(
          and(
            gte(flights.scheduledDeparture, startToday),
            lt(flights.scheduledDeparture, endToday),
          ),
        ),
      db
        .select()
        .from(flightEvents)
        .orderBy(desc(flightEvents.createdAt))
        .limit(45),
      db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.createdAt)).limit(1),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM flights) AS total_flights,
          (SELECT COUNT(*)::int FROM flight_events) AS total_events,
          (SELECT COUNT(*)::int FROM pipeline_runs) AS total_runs
      `),
    ]);

    // ----- KPIs -----
    const totalToday = todayFlights.length;
    const byStatus = (s: string) => todayFlights.filter((f) => f.status === s);
    const completed = byStatus("completed");
    const cancelled = byStatus("cancelled");
    const inFlight = byStatus("departed");
    const boarding = byStatus("boarding");
    const delayed = todayFlights.filter(
      (f) => f.status !== "cancelled" && f.delayMinutes >= 15,
    );
    const cancellationRate = totalToday ? (cancelled.length / totalToday) * 100 : 0;
    const onTimeRate = completed.length
      ? (completed.filter((f) => f.delayMinutes < 15).length / completed.length) * 100
      : 100;
    const avgDelay = delayed.length
      ? Math.round(delayed.reduce((s, f) => s + f.delayMinutes, 0) / delayed.length)
      : 0;

    // ----- Distribuicao por status -----
    const statusDistribution = Object.entries(STATUS_META).map(
      ([status, meta]) => ({
        status,
        label: meta.label,
        color: meta.color,
        count: byStatus(status).length,
      }),
    );

    // ----- Por companhia -----
    const airlines = AIRLINES.map((a) => {
      const mine = todayFlights.filter((f) => f.airlineCode === a.code);
      const myCompleted = mine.filter((f) => f.status === "completed");
      const myCancelled = mine.filter((f) => f.status === "cancelled");
      return {
        code: a.code,
        name: a.name,
        color: a.color,
        total: mine.length,
        completed: myCompleted.length,
        cancelled: myCancelled.length,
        delayed: mine.filter((f) => f.status !== "cancelled" && f.delayMinutes >= 15)
          .length,
        inFlight: mine.filter((f) => f.status === "departed").length,
        cancelRate: mine.length ? (myCancelled.length / mine.length) * 100 : 0,
        onTimeRate: myCompleted.length
          ? (myCompleted.filter((f) => f.delayMinutes < 15).length /
              myCompleted.length) *
            100
          : 100,
      };
    }).sort((a, b) => b.total - a.total);

    // ----- Por hora (fuso SP) -----
    const hours = new Map<number, HourlyPoint>();
    for (let h = 5; h <= 23; h++) {
      hours.set(h, { hour: String(h).padStart(2, "0"), total: 0, completed: 0, cancelled: 0, delayed: 0 });
    }
    for (const f of todayFlights) {
      const h = spHour(f.scheduledDeparture);
      const p = hours.get(h);
      if (!p) continue;
      p.total++;
      if (f.status === "completed") p.completed++;
      if (f.status === "cancelled") p.cancelled++;
      else if (f.delayMinutes >= 15) p.delayed++;
    }
    const hourly = [...hours.values()];

    // ----- Principais rotas -----
    const routeMap = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const f of todayFlights) {
      const key = `${f.originCode}→${f.destinationCode}`;
      const r = routeMap.get(key) ?? { total: 0, completed: 0, cancelled: 0 };
      r.total++;
      if (f.status === "completed") r.completed++;
      if (f.status === "cancelled") r.cancelled++;
      routeMap.set(key, r);
    }
    const topRoutes = [...routeMap.entries()]
      .map(([route, r]) => ({
        route,
        origin: route.split("→")[0],
        destination: route.split("→")[1],
        total: r.total,
        completed: r.completed,
        cancelled: r.cancelled,
        cancelRate: r.total ? (r.cancelled / r.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ----- Voos no mapa (em voo agora) -----
    const mapFlights: MapFlight[] = inFlight
      .map((f) => {
        const dep = (f.actualDeparture ?? f.scheduledDeparture).getTime();
        const progress = Math.min(
          0.98,
          Math.max(0.02, (nowMs - dep) / (f.blockMinutes * 60000)),
        );
        const meta = AIRLINES.find((a) => a.code === f.airlineCode);
        return {
          id: f.id,
          flightNumber: f.flightNumber,
          airlineCode: f.airlineCode,
          airlineColor: meta?.color ?? "#22d3ee",
          originCode: f.originCode,
          destinationCode: f.destinationCode,
          progress,
          delayMinutes: f.delayMinutes,
          blockMinutes: f.blockMinutes,
        };
      })
      .sort((a, b) => a.progress - b.progress)
      .slice(-26);

    // ----- Atividade por aeroporto -----
    const actMap = new Map<string, { active: number; cancelledToday: number }>();
    for (const f of todayFlights) {
      for (const code of [f.originCode, f.destinationCode]) {
        const a = actMap.get(code) ?? { active: 0, cancelledToday: 0 };
        if (f.status === "departed" || f.status === "boarding") a.active++;
        if (f.status === "cancelled") a.cancelledToday++;
        actMap.set(code, a);
      }
    }
    const airportActivity = [...actMap.entries()].map(([code, a]) => ({
      code,
      ...a,
    }));

    // ----- Voos recentes (primeira pagina da tabela) -----
    const recentFlights = todayFlights
      .sort(
        (a, b) => b.scheduledDeparture.getTime() - a.scheduledDeparture.getTime(),
      )
      .slice(0, 14)
      .map(toRow);

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

    const totalsRow = (totals as unknown as { rows: Record<string, number>[] }).rows?.[0] ?? {};

    const data: DashboardData = {
      generatedAt: new Date().toISOString(),
      kpis: {
        totalToday,
        completed: completed.length,
        inFlight: inFlight.length,
        boarding: boarding.length,
        scheduled: byStatus("scheduled").length,
        delayed: delayed.length,
        cancelled: cancelled.length,
        cancellationRate,
        onTimeRate,
        avgDelay,
      },
      statusDistribution,
      airlines,
      hourly,
      topRoutes,
      mapFlights,
      airportActivity,
      recentFlights,
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
        totalRuns: totalsRow.total_runs ?? 0,
        totalFlights: totalsRow.total_flights ?? 0,
        totalEvents: totalsRow.total_events ?? 0,
      },
    };

    return Response.json(data);
  } catch (err) {
    console.error("dashboard error", err);
    return Response.json(
      { error: "Falha ao carregar o dashboard" },
      { status: 500 },
    );
  }
}
