// ============================================================
// AeroFly — Enriquecimento de rotas REAIS via ADSBDB
// https://api.adsbdb.com/v0/callsign/{callsign}
// Gratuito, sem chave. Cache persistente de 24h em PostgreSQL.
//
// A busca e limitada/concurrente para respeitar o serviço. Em cada ciclo,
// chamadas nao conhecidas sao resolvidas; as seguintes usam o banco.
// ============================================================

import { db } from "@/db";
import { routeCache } from "@/db/schema";
import { inArray, lt, sql } from "drizzle-orm";
import type { LiveAircraft } from "./types";

const BASE = "https://api.adsbdb.com/v0/callsign";
const TTL_MS = 24 * 3600_000;
const MAX_LOOKUPS_PER_CYCLE = 40;
const CONCURRENCY = 6;

interface RouteInfo {
  callsign: string;
  airlineName: string | null;
  originIata: string | null;
  originIcao: string | null;
  originName: string | null;
  destinationIata: string | null;
  destinationIcao: string | null;
  destinationName: string | null;
}

const mem = new Map<string, { at: number; route: RouteInfo | null }>();
let inFlight = new Map<string, Promise<RouteInfo | null>>();

interface AdsbDbResponse {
  response?: {
    flightroute?: {
      airline?: { name?: string } | null;
      origin?: {
        iata_code?: string;
        icao_code?: string;
        name?: string;
      } | null;
      destination?: {
        iata_code?: string;
        icao_code?: string;
        name?: string;
      } | null;
    } | null;
  };
}

async function lookup(callsign: string): Promise<RouteInfo | null> {
  const existing = inFlight.get(callsign);
  if (existing) return existing;

  const task = (async () => {
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(callsign)}`, {
        headers: { Accept: "application/json", "User-Agent": "aerofly/1.0" },
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`ADSBDB HTTP ${res.status}`);
      const json = (await res.json()) as AdsbDbResponse;
      const r = json.response?.flightroute;
      if (!r?.origin || !r?.destination) return null;
      return {
        callsign,
        airlineName: r.airline?.name ?? null,
        originIata: r.origin.iata_code || null,
        originIcao: r.origin.icao_code || null,
        originName: r.origin.name || null,
        destinationIata: r.destination.iata_code || null,
        destinationIcao: r.destination.icao_code || null,
        destinationName: r.destination.name || null,
      };
    } catch (err) {
      console.warn(`[routes] ${callsign}:`, err instanceof Error ? err.message : err);
      return null;
    } finally {
      inFlight.delete(callsign);
    }
  })();
  inFlight.set(callsign, task);
  return task;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function monitored(callsign: string): boolean {
  return /^(GLO|TAM|LAN|AZU|PTB)[A-Z0-9]+$/.test(callsign);
}

/** Enriquece as aeronaves e retorna a mesma lista com origem/destino reais. */
export async function enrichRoutes(
  aircraft: LiveAircraft[],
): Promise<LiveAircraft[]> {
  const callsigns = [
    ...new Set(
      aircraft
        .map((a) => a.callsign?.trim().toUpperCase())
        .filter((v): v is string => Boolean(v && monitored(v))),
    ),
  ];
  if (callsigns.length === 0) return aircraft;

  // 1) memoria
  const now = Date.now();
  const resolved = new Map<string, RouteInfo>();
  const dbNeeded: string[] = [];
  for (const cs of callsigns) {
    const c = mem.get(cs);
    if (c && now - c.at < TTL_MS) {
      if (c.route) resolved.set(cs, c.route);
    } else {
      dbNeeded.push(cs);
    }
  }

  // 2) PostgreSQL
  if (dbNeeded.length > 0) {
    try {
      const rows = await db
        .select()
        .from(routeCache)
        .where(inArray(routeCache.callsign, dbNeeded));
      for (const r of rows) {
        const route: RouteInfo = {
          callsign: r.callsign,
          airlineName: r.airlineName,
          originIata: r.originIata,
          originIcao: r.originIcao,
          originName: r.originName,
          destinationIata: r.destinationIata,
          destinationIcao: r.destinationIcao,
          destinationName: r.destinationName,
        };
        const fresh = now - r.updatedAt.getTime() < TTL_MS;
        if (fresh) {
          resolved.set(r.callsign, route);
          mem.set(r.callsign, { at: r.updatedAt.getTime(), route });
        }
      }
    } catch (err) {
      console.warn("[routes] cache DB indisponível:", err);
    }
  }

  // 3) ADSBDB — prioriza as cias monitoradas no ar, limite por ciclo
  const missing = callsigns
    .filter((cs) => !resolved.has(cs))
    .slice(0, MAX_LOOKUPS_PER_CYCLE);
  if (missing.length > 0) {
    const fetched = await mapLimit(missing, CONCURRENCY, async (cs) => ({
      cs,
      route: await lookup(cs),
    }));
    const valid = fetched.filter(
      (x): x is { cs: string; route: RouteInfo } => x.route !== null,
    );
    for (const x of fetched) mem.set(x.cs, { at: now, route: x.route });
    for (const x of valid) resolved.set(x.cs, x.route);

    if (valid.length > 0) {
      try {
        await db
          .insert(routeCache)
          .values(
            valid.map(({ route: r }) => ({
              callsign: r.callsign,
              airlineName: r.airlineName,
              originIata: r.originIata,
              originIcao: r.originIcao,
              originName: r.originName,
              destinationIata: r.destinationIata,
              destinationIcao: r.destinationIcao,
              destinationName: r.destinationName,
              updatedAt: new Date(),
            })),
          )
          .onConflictDoUpdate({
            target: routeCache.callsign,
            set: {
              airlineName: sql`excluded.airline_name`,
              originIata: sql`excluded.origin_iata`,
              originIcao: sql`excluded.origin_icao`,
              originName: sql`excluded.origin_name`,
              destinationIata: sql`excluded.destination_iata`,
              destinationIcao: sql`excluded.destination_icao`,
              destinationName: sql`excluded.destination_name`,
              source: sql`excluded.source`,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        // fallback seguro: remove expirados para permitir insert futuro
        try {
          await db.delete(routeCache).where(lt(routeCache.updatedAt, new Date(now - TTL_MS)));
        } catch {
          /* sem impacto no dashboard */
        }
        console.warn("[routes] falha ao persistir cache:", err);
      }
    }
  }

  return aircraft.map((a) => {
    const cs = a.callsign?.trim().toUpperCase();
    const r = cs ? resolved.get(cs) : undefined;
    return r
      ? {
          ...a,
          origIata: r.originIata,
          destIata: r.destinationIata,
          flightNumber: a.flightNumber ?? cs,
        }
      : a;
  });
}
