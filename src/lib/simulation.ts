// ============================================================
// AeroFly — Motor operacional (simulacao + pipeline de dados)
// Gera a malha de voos, avanca os estados da operacao e
// registra eventos. Espelhado pela pipeline Python em python/.
// ============================================================

import { db } from "@/db";
import {
  airlines,
  airports,
  flights,
  flightEvents,
  pipelineRuns,
} from "@/db/schema";
import {
  AIRLINES,
  AIRPORTS,
  ROUTES,
  CANCELLATION_REASONS,
  getAirline,
} from "./aviation";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

const SP_OFFSET_MS = 3 * 3600_000; // Brasilia = UTC-3 (sem horario de verao)

/** Agora "em relogio de Sao Paulo": leia com metodos getUTC* */
export function nowSp(): Date {
  return new Date(Date.now() - SP_OFFSET_MS);
}

/** Inicio do dia (00:00) em Sao Paulo, deslocado por `offsetDays` */
export function startOfSpDay(offsetDays = 0): Date {
  const s = nowSp();
  return new Date(
    Date.UTC(
      s.getUTCFullYear(),
      s.getUTCMonth(),
      s.getUTCDate() + offsetDays,
      0,
      0,
      0,
    ) + SP_OFFSET_MS,
  );
}

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

function sampleReason(): string {
  const total = CANCELLATION_REASONS.reduce((s, r) => s + r.weight, 0);
  let r = Math.random() * total;
  for (const c of CANCELLATION_REASONS) {
    r -= c.weight;
    if (r <= 0) return c.reason;
  }
  return CANCELLATION_REASONS[0].reason;
}

/** Distribuicao de atrasos (minutos) para voos executados */
function sampleDelay(): number {
  const r = Math.random();
  if (r < 0.72) return rand(0, 12);
  if (r < 0.9) return rand(13, 35);
  if (r < 0.97) return rand(36, 75);
  return rand(76, 140);
}

type NewFlight = typeof flights.$inferInsert;
type NewEvent = typeof flightEvents.$inferInsert;

// ------------------------------------------------------------
// Dados de referencia (companhias e aeroportos)
// ------------------------------------------------------------
export async function ensureReferenceData(): Promise<void> {
  await db
    .insert(airlines)
    .values(
      AIRLINES.map((a) => ({
        code: a.code,
        iata: a.iata,
        name: a.name,
        color: a.color,
        cancelProfile: a.cancelProfile,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(airports)
    .values(AIRPORTS.map((a) => ({ ...a })))
    .onConflictDoNothing();
}

// ------------------------------------------------------------
// Geracao da malha de voos
// ------------------------------------------------------------
function buildFlightRow(route: (typeof ROUTES)[number], dep: Date): NewFlight {
  const airlineCode = pick(route.airlines);
  const arr = new Date(dep.getTime() + (route.blockMin + rand(-4, 12)) * 60000);
  return {
    flightNumber: `${airlineCode}${rand(1000, 3999)}`,
    airlineCode,
    originCode: route.origin,
    destinationCode: route.destination,
    blockMinutes: route.blockMin,
    status: "scheduled",
    delayMinutes: 0,
    scheduledDeparture: dep,
    scheduledArrival: arr,
  };
}

/** Gera voos programados na janela [from, from+hours] */
async function generateWindow(from: Date, hours: number): Promise<number> {
  const rows: NewFlight[] = [];
  for (const route of ROUTES) {
    const n = Math.max(1, Math.round((route.dailyFreq * hours) / 18));
    for (let k = 0; k < n; k++) {
      const dep = new Date(from.getTime() + rand(0, hours * 60) * 60000);
      rows.push(buildFlightRow(route, dep));
    }
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(flights)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: flights.id });
  return inserted.length;
}

/** Gera a malha completa de um dia (05:30 as 23:40 em SP) com status ja resolvido */
async function generateDay(offsetDays: number): Promise<number> {
  const s = nowSp();
  const dayUtc =
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + offsetDays) +
    SP_OFFSET_MS;
  const now = Date.now();
  const rows: NewFlight[] = [];

  for (const route of ROUTES) {
    for (let i = 0; i < route.dailyFreq; i++) {
      const slot = (1420 - 330) / route.dailyFreq; // minutos entre 05:30 e 23:40
      const depMin = 330 + i * slot + rand(0, Math.max(8, slot * 0.35));
      const dep = new Date(dayUtc + depMin * 60000);
      const row = buildFlightRow(route, dep);
      const depMs = dep.getTime();
      const arrMs = row.scheduledArrival.getTime();
      const profile = getAirline(row.airlineCode).cancelProfile;

      if (depMs > now + 35 * 60000) {
        // futuro
      } else if (depMs <= now && arrMs > now) {
        row.status = "departed";
        row.delayMinutes = Math.random() < 0.3 ? rand(5, 45) : rand(0, 8);
        row.actualDeparture = new Date(depMs + row.delayMinutes * 60000);
      } else if (depMs <= now + 35 * 60000 && arrMs > now) {
        row.status = "boarding";
        row.delayMinutes = Math.random() < 0.35 ? rand(4, 25) : 0;
      } else {
        // ja deveria ter pousado
        if (Math.random() * 100 < profile) {
          row.status = "cancelled";
          row.cancellationReason = sampleReason();
          row.delayMinutes = 0;
        } else {
          row.status = "completed";
          row.delayMinutes = sampleDelay();
          row.actualDeparture = new Date(depMs + row.delayMinutes * 60000);
          row.actualArrival = new Date(arrMs + Math.round(row.delayMinutes * 0.85) * 60000);
        }
      }
      rows.push(row);
    }
  }

  const inserted = await db
    .insert(flights)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: flights.id });
  return inserted.length;
}

// ------------------------------------------------------------
// Seed inicial (idempotente)
// ------------------------------------------------------------
export async function ensureSeeded(source = "web"): Promise<boolean> {
  await ensureReferenceData();
  const startToday = startOfSpDay(0);
  const [{ value }] = await db
    .select({ value: count() })
    .from(flights)
    .where(gte(flights.scheduledDeparture, startToday));
  if (value > 0) return false;

  const startedAt = Date.now();
  const inserted = (await generateDay(-1)) + (await generateDay(0));
  await generateWindow(new Date(Date.now() + 6 * 3600_000), 6);

  // Eventos sinteticos recentes para alimentar o feed
  const windowStart = new Date(Date.now() - 3 * 3600_000);
  const recent = await db
    .select()
    .from(flights)
    .where(
      and(
        gte(flights.scheduledDeparture, windowStart),
        inArray(flights.status, ["completed", "cancelled", "departed"]),
      ),
    )
    .orderBy(desc(flights.scheduledDeparture))
    .limit(80);

  const events: NewEvent[] = [];
  for (const f of recent) {
    const routeTxt = `${f.flightNumber} ${f.originCode}→${f.destinationCode}`;
    if (f.status === "completed" && f.actualArrival) {
      events.push({
        flightId: f.id,
        flightNumber: f.flightNumber,
        airlineCode: f.airlineCode,
        originCode: f.originCode,
        destinationCode: f.destinationCode,
        type: "arrival",
        message: `${routeTxt} concluído ${
          f.delayMinutes >= 15
            ? `com ${f.delayMinutes} min de atraso`
            : "dentro do horário"
        }`,
        createdAt: f.actualArrival,
      });
    } else if (f.status === "cancelled") {
      events.push({
        flightId: f.id,
        flightNumber: f.flightNumber,
        airlineCode: f.airlineCode,
        originCode: f.originCode,
        destinationCode: f.destinationCode,
        type: "cancellation",
        message: `${routeTxt} cancelado — ${f.cancellationReason}`,
        createdAt: new Date(f.scheduledDeparture.getTime() - 45 * 60000),
      });
    } else if (f.status === "departed" && f.actualDeparture) {
      events.push({
        flightId: f.id,
        flightNumber: f.flightNumber,
        airlineCode: f.airlineCode,
        originCode: f.originCode,
        destinationCode: f.destinationCode,
        type: "departure",
        message: `${routeTxt} em voo`,
        createdAt: f.actualDeparture,
      });
    }
  }
  events.sort(
    (a, b) =>
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  if (events.length > 0) {
    await db.insert(flightEvents).values(events.slice(0, 45));
  }

  await db.insert(pipelineRuns).values({
    source,
    mode: "seed",
    inserted,
    updated: 0,
    cancelled: 0,
    events: Math.min(events.length, 45),
    durationMs: Date.now() - startedAt,
  });
  return true;
}

// ------------------------------------------------------------
// Tick: avanca o estado da operacao
// ------------------------------------------------------------
export interface TickSummary {
  inserted: number;
  updated: number;
  cancelled: number;
  events: number;
  durationMs: number;
}

export async function runTick(source = "web"): Promise<TickSummary> {
  const startedAt = Date.now();
  const now = new Date();
  const nowMs = now.getTime();
  await ensureReferenceData();

  const events: NewEvent[] = [];
  let updated = 0;
  let cancelled = 0;
  let inserted = 0;

  const routeTxt = (f: { flightNumber: string; originCode: string; destinationCode: string }) =>
    `${f.flightNumber} ${f.originCode}→${f.destinationCode}`;

  const pushEvent = (
    f: { id: number; flightNumber: string; airlineCode: string; originCode: string; destinationCode: string },
    type: NewEvent["type"],
    message: string,
  ) =>
    events.push({
      flightId: f.id,
      flightNumber: f.flightNumber,
      airlineCode: f.airlineCode,
      originCode: f.originCode,
      destinationCode: f.destinationCode,
      type,
      message,
    });

  // 1) Candidatos a embarque/decolagem (janela das proximas ~2h)
  const pending = await db
    .select()
    .from(flights)
    .where(
      and(
        inArray(flights.status, ["scheduled", "boarding"]),
        lte(flights.scheduledDeparture, new Date(nowMs + 120 * 60000)),
      ),
    )
    .limit(400);

  for (const f of pending) {
    const effDep = f.scheduledDeparture.getTime() + f.delayMinutes * 60000;
    if (effDep <= nowMs) {
      await db
        .update(flights)
        .set({
          status: "departed",
          actualDeparture: new Date(effDep),
          updatedAt: now,
        })
        .where(eq(flights.id, f.id));
      updated++;
      pushEvent(
        f,
        "departure",
        `${routeTxt(f)} decolou${
          f.delayMinutes >= 5 ? ` com ${f.delayMinutes} min de atraso` : " no horário"
        }`,
      );
    } else if (f.status === "scheduled" && effDep <= nowMs + 35 * 60000) {
      await db
        .update(flights)
        .set({ status: "boarding", updatedAt: now })
        .where(eq(flights.id, f.id));
      updated++;
      pushEvent(f, "boarding", `Embarque iniciado · ${routeTxt(f)}`);
    }
  }

  // 2) Chegadas
  const airborne = await db
    .select()
    .from(flights)
    .where(eq(flights.status, "departed"))
    .limit(300);

  for (const f of airborne) {
    const depMs = (f.actualDeparture ?? f.scheduledDeparture).getTime();
    if (depMs + (f.blockMinutes + rand(-2, 8)) * 60000 <= nowMs) {
      await db
        .update(flights)
        .set({
          status: "completed",
          actualArrival: now,
          updatedAt: now,
        })
        .where(eq(flights.id, f.id));
      updated++;
      pushEvent(
        f,
        "arrival",
        `${routeTxt(f)} concluído ${
          f.delayMinutes >= 15
            ? `com ${f.delayMinutes} min de atraso`
            : "dentro do horário"
        }`,
      );
    }
  }

  // 3) Loteria de atrasos e cancelamentos sobre voos programados
  if (Math.random() < 0.55 || Math.random() < 0.3) {
    const candidates = await db
      .select()
      .from(flights)
      .where(
        and(
          eq(flights.status, "scheduled"),
          gte(flights.scheduledDeparture, now),
          lte(flights.scheduledDeparture, new Date(nowMs + 10 * 3600_000)),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(6);

    for (const f of candidates.slice(0, 3)) {
      const profile = getAirline(f.airlineCode).cancelProfile;
      const roll = Math.random();
      // cancelamento: probabilidade proporcional ao perfil da companhia
      if (roll < (profile * 2) / 100) {
        const reason = sampleReason();
        await db
          .update(flights)
          .set({
            status: "cancelled",
            cancellationReason: reason,
            updatedAt: now,
          })
          .where(eq(flights.id, f.id));
        cancelled++;
        pushEvent(f, "cancellation", `${routeTxt(f)} cancelado — ${reason}`);
      } else if (roll < 0.3 && f.delayMinutes < 120) {
        const add = rand(10, 50);
        const newDelay = Math.min(150, f.delayMinutes + add);
        await db
          .update(flights)
          .set({ delayMinutes: newDelay, updatedAt: now })
          .where(eq(flights.id, f.id));
        updated++;
        pushEvent(
          f,
          "delay",
          `${routeTxt(f)} reprogramado com atraso de ${newDelay} min`,
        );
      }
    }
  }

  // 4) Garante malha futura (rolagem continua do dia)
  const [{ value: futureCount }] = await db
    .select({ value: count() })
    .from(flights)
    .where(
      and(
        inArray(flights.status, ["scheduled", "boarding"]),
        gte(flights.scheduledDeparture, new Date(nowMs + 2 * 3600_000)),
      ),
    );
  if (futureCount < 30) {
    inserted = await generateWindow(new Date(nowMs + 2 * 3600_000), 6);
  }

  if (events.length > 0) {
    await db.insert(flightEvents).values(events);
  }

  const summary: TickSummary = {
    inserted,
    updated,
    cancelled,
    events: events.length,
    durationMs: Date.now() - startedAt,
  };
  await db.insert(pipelineRuns).values({ source, mode: "tick", ...summary });
  return summary;
}
