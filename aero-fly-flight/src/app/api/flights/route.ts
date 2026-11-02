import { db } from "@/db";
import { flights } from "@/db/schema";
import { startOfSpDay } from "@/lib/simulation";
import type { FlightsPage } from "@/lib/types";
import { and, count, desc, eq, gte, ilike, or } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
const VALID_STATUS = new Set([
  "scheduled",
  "boarding",
  "departed",
  "completed",
  "cancelled",
]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status") ?? "all";
    const airline = sp.get("airline") ?? "all";
    const q = (sp.get("q") ?? "").trim();
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

    const conditions = [gte(flights.scheduledDeparture, startOfSpDay(-1))];
    if (VALID_STATUS.has(status)) {
      conditions.push(
        eq(
          flights.status,
          status as "scheduled" | "boarding" | "departed" | "completed" | "cancelled",
        ),
      );
    }
    if (airline !== "all") conditions.push(eq(flights.airlineCode, airline));
    if (q) {
      const like = `%${q.replaceAll("→", "").trim()}%`;
      conditions.push(
        or(
          ilike(flights.flightNumber, like),
          ilike(flights.originCode, like),
          ilike(flights.destinationCode, like),
          ilike(flights.cancellationReason, like),
        )!,
      );
    }

    const where = and(...conditions);
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(flights)
      .where(where);

    const rows = await db
      .select()
      .from(flights)
      .where(where)
      .orderBy(desc(flights.scheduledDeparture))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    const payload: FlightsPage = {
      flights: rows.map((f) => ({
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
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
    return Response.json(payload);
  } catch (err) {
    console.error("flights error", err);
    return Response.json({ error: "Falha ao listar voos" }, { status: 500 });
  }
}
