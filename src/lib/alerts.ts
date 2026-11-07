// ============================================================
// AeroFly — Motor de ALERTAS OPERACIONAIS REAIS
//
// Avalia regras sobre os dados reais coletados e dispara
// alertas com deduplicacao e cooldown:
//   · Emergencias por squawk: 7700 (geral), 7600 (falha de
//     comunicacao), 7500 (sequestro) — direto do ADS-B
//   · Meteorologia severa por aeroporto (tempestade, rajadas,
//     visibilidade, CAPE)
//   · Congestionamento: fila de aproximacao e esperas em voo
//   · Indice de pressao operacional elevado
//
// Entrega (configuravel por env):
//   ALERT_WEBHOOK_URL        — webhook generico (Slack/Discord/own)
//   ALERT_WEBHOOK_FORMAT     — slack | discord | json (padrao: slack)
//   RESEND_API_KEY           — envio de e-mail via Resend
//   ALERT_EMAIL_TO           — destinatario(s), separados por vírgula
//   ALERT_MIN_SEVERITY       — info | warning | critical (padrao: warning)
// ============================================================

import { db } from "@/db";
import { alerts } from "@/db/schema";
import { desc, gte } from "drizzle-orm";
import { getLiveTraffic } from "./liveTraffic";
import { getWeather } from "./weather";
import { nearestAirport } from "./geo";
import type { LiveAircraft, WeatherSeverity } from "./types";

type Severity = "info" | "warning" | "critical";

const SEV_ORDER: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/** Cooldown (s) por tipo — evita spam do mesmo evento */
const COOLDOWN_S: Record<string, number> = {
  squawk_emergency: 600,
  squawk_radio_failure: 900,
  squawk_hijack: 900,
  wx_storm: 1200,
  wx_wind: 1200,
  wx_visibility: 1200,
  wx_cape: 1800,
  approach_queue: 600,
  holding: 900,
  pressure_high: 1800,
  source_down: 1800,
};

interface PendingAlert {
  kind: string;
  severity: Severity;
  dedupKey: string;
  title: string;
  message: string;
  airport: string | null;
  flightNumber: string | null;
  context: Record<string, unknown>;
}

let lastEval = 0;
const MIN_INTERVAL_MS = 30_000;

const flOf = (a: LiveAircraft) =>
  a.altM ? `FL${Math.round((a.altM * 3.28084) / 100)}` : "—";

// ----------------------------------------------------------------
// Regras
// ----------------------------------------------------------------
function squawkAlerts(aircraft: LiveAircraft[]): PendingAlert[] {
  const out: PendingAlert[] = [];
  for (const a of aircraft) {
    const sq = a.squawk;
    if (sq !== "7700" && sq !== "7600" && sq !== "7500") continue;
    const near = nearestAirport(a.lat, a.lon);
    const cs = a.callsign ?? a.hex.toUpperCase();
    const where = near ? `próximo a ${near.code} (${Math.round(near.distKm)} km)` : "sobre o Brasil";
    const spec =
      sq === "7700"
        ? { kind: "squawk_emergency", label: "EMERGÊNCIA GERAL", sev: "critical" as Severity }
        : sq === "7600"
          ? { kind: "squawk_radio_failure", label: "FALHA DE COMUNICAÇÃO", sev: "critical" as Severity }
          : { kind: "squawk_hijack", label: "SEQUESTRO / UNLAWFUL INTERFERENCE", sev: "critical" as Severity };
    out.push({
      kind: spec.kind,
      severity: spec.sev,
      dedupKey: `${sq}-${a.hex}`,
      title: `${spec.label} · ${cs}`,
      message:
        `Aeronave ${cs}${a.registration ? ` (${a.registration})` : ""} transmitindo ` +
        `squawk ${sq} — ${where}, ${flOf(a)}, ` +
        `${a.speedKmh ?? "—"} km/h. Acionar protocolo de emergência imediatamente.`,
      airport: near?.code ?? null,
      flightNumber: cs,
      context: {
        squawk: sq,
        callsign: cs,
        hex: a.hex,
        registration: a.registration,
        aircraftType: a.aircraftType,
        lat: a.lat,
        lon: a.lon,
        altM: a.altM,
        speedKmh: a.speedKmh,
        nearestAirport: near?.code,
        distKm: near?.distKm,
      },
    });
  }
  return out;
}

function weatherAlerts(
  airports: { code: string; city: string; condition: string; storm: boolean; gustKmh: number; visibilityM: number | null; cape: number | null; severity: WeatherSeverity; windCardinal: string }[],
): PendingAlert[] {
  const out: PendingAlert[] = [];
  for (const w of airports) {
    if (w.storm || w.severity === "severe") {
      out.push({
        kind: "wx_storm",
        severity: "critical",
        dedupKey: w.code,
        title: `Meteorologia severa em ${w.code} · ${w.city}`,
        message:
          `${w.condition}. Rajadas de ${Math.round(w.gustKmh)} km/h (${w.windCardinal}), ` +
          `${w.visibilityM !== null ? `visibilidade ${(w.visibilityM / 1000).toFixed(1)} km, ` : ""}` +
          `CAPE ${w.cape ? Math.round(w.cape) : "—"} J/kg. ` +
          "Avaliar esperas, arremetidas e combustível alternativo.",
        airport: w.code,
        flightNumber: null,
        context: { ...w },
      });
    } else if (w.gustKmh >= 65) {
      out.push({
        kind: "wx_wind",
        severity: "critical",
        dedupKey: w.code,
        title: `Rajadas extremas em ${w.code}`,
        message:
          `Rajadas de ${Math.round(w.gustKmh)} km/h (${w.windCardinal}) — ` +
          "possível excedência de limites de vento de través. Verificar pousos e decolagens.",
        airport: w.code,
        flightNumber: null,
        context: { gustKmh: w.gustKmh },
      });
    } else if (w.visibilityM !== null && w.visibilityM < 1500) {
      out.push({
        kind: "wx_visibility",
        severity: "critical",
        dedupKey: w.code,
        title: `Visibilidade mínima em ${w.code}`,
        message:
          `Visibilidade de ${(w.visibilityM / 1000).toFixed(1)} km (${w.condition}). ` +
          "Condições de aproximação por instrumento; expectativa de gap de taxa.",
        airport: w.code,
        flightNumber: null,
        context: { visibilityM: w.visibilityM },
      });
    } else if (w.cape !== null && w.cape >= 3000) {
      out.push({
        kind: "wx_cape",
        severity: "warning",
        dedupKey: w.code,
        title: `Potencial convectivo extremo em ${w.code}`,
        message:
          `CAPE de ${Math.round(w.cape)} J/kg — risco alto de tempestade severa ` +
          "(microexplosão e granizo) nas próximas horas.",
        airport: w.code,
        flightNumber: null,
        context: { cape: w.cape },
      });
    }
  }
  return out;
}

function congestionAlerts(aircraft: LiveAircraft[]): PendingAlert[] {
  const out: PendingAlert[] = [];
  const approach = new Map<string, number>();
  let holdings = 0;
  for (const a of aircraft) {
    const near = nearestAirport(a.lat, a.lon);
    if (!near) continue;
    const descending =
      !a.onGround && a.altM !== null && a.altM < 4500 && (a.vsMs ?? 0) < -0.5;
    if (descending && near.distKm <= 70) {
      approach.set(near.code, (approach.get(near.code) ?? 0) + 1);
    }
    if (
      !a.onGround &&
      a.altM !== null &&
      a.altM > 1200 &&
      a.altM < 9000 &&
      (a.speedKmh ?? 999) < 380 &&
      (a.vsMs ?? 0) > -6
    ) {
      holdings++;
    }
  }
  const worst = [...approach.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 5) {
    out.push({
      kind: "approach_queue",
      severity: worst[1] >= 8 ? "critical" : "warning",
      dedupKey: worst[0],
      title: `Fila de aproximação crítica em ${worst[0]}`,
      message:
        `${worst[1]} aeronaves em descida convergindo para ${worst[0]}. ` +
        "Considerar flow control, sequenciamento alternativo e reforço de guichês.",
      airport: worst[0],
      flightNumber: null,
      context: { airport: worst[0], count: worst[1] },
    });
  }
  if (holdings >= 5) {
    out.push({
      kind: "holding",
      severity: holdings >= 10 ? "critical" : "warning",
      dedupKey: "br",
      title: `${holdings} aeronaves em possível espera sobre o Brasil`,
      message:
        "Padrão compatível com esperas/vectoramento em altitude média — " +
        "impacto em combustível e propagação de atrasos.",
      airport: null,
      flightNumber: null,
      context: { count: holdings },
    });
  }
  return out;
}

// ----------------------------------------------------------------
// Entrega
// ----------------------------------------------------------------
function minSeverity(): Severity {
  const v = (process.env.ALERT_MIN_SEVERITY ?? "warning").toLowerCase();
  return v === "info" || v === "critical" ? (v as Severity) : "warning";
}

const stamp = () =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function formatMessage(a: {
  severity: string;
  title: string;
  message: string;
  airport: string | null;
}): string {
  const tag = a.severity === "critical" ? "🚨 CRÍTICO" : a.severity === "warning" ? "⚠️ ATENÇÃO" : "ℹ️ INFO";
  return `[AeroFly] ${tag} — ${a.title}${a.airport ? ` (${a.airport})` : ""}\n${a.message}\n${stamp()} BRT`;
}

async function deliver(
  inserted: (typeof alerts.$inferSelect)[],
): Promise<void> {
  const threshold = minSeverity();
  const toSend = inserted.filter(
    (a) => SEV_ORDER[a.severity as Severity] >= SEV_ORDER[threshold],
  );
  if (toSend.length === 0) return;

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;

  for (const a of toSend) {
    const text = formatMessage(a);
    if (webhookUrl) {
      const fmt = (process.env.ALERT_WEBHOOK_FORMAT ?? "slack").toLowerCase();
      const body =
        fmt === "discord"
          ? { content: text }
          : fmt === "json"
            ? a
            : { text };
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8_000),
        });
      } catch (err) {
        console.warn("[alerts] webhook falhou:", err);
      }
    }
    if (resendKey && emailTo) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.ALERT_EMAIL_FROM ?? "AeroFly <onboarding@resend.dev>",
            to: emailTo.split(",").map((s) => s.trim()),
            subject: `[AeroFly ${a.severity.toUpperCase()}] ${a.title}`,
            text,
          }),
          signal: AbortSignal.timeout(8_000),
        });
      } catch (err) {
        console.warn("[alerts] e-mail falhou:", err);
      }
    }
  }
}

// ----------------------------------------------------------------
// Orquestracao
// ----------------------------------------------------------------
export async function evaluateAlerts(): Promise<void> {
  if (Date.now() - lastEval < MIN_INTERVAL_MS) return;
  lastEval = Date.now();

  try {
    const [traffic, weather] = await Promise.all([
      getLiveTraffic().catch(() => null),
      getWeather().catch(() => null),
    ]);

    const pending: PendingAlert[] = [];

    // emergencias (maior prioridade) — mesmo sem trafego, tenta clima
    if (traffic) {
      pending.push(...squawkAlerts(traffic.aircraft));
      pending.push(...congestionAlerts(traffic.aircraft));
    }
    if (weather) pending.push(...weatherAlerts(weather.airports));

    if (traffic === null) {
      pending.push({
        kind: "source_down",
        severity: "info",
        dedupKey: "adsb",
        title: "Fonte ADS-B indisponível",
        message:
          "Nenhuma fonte ADS-B respondeu. O dashboard opera com o último " +
          "snapshot persistido até a normalização.",
        airport: null,
        flightNumber: null,
        context: {},
      });
    }
    if (pending.length === 0) return;

    // dedup por cooldown: consulta janela suficiente (30 min cobre o maior cooldown)
    const since = new Date(Date.now() - 30 * 60_000);
    const recent = await db
      .select({ kind: alerts.kind, dedupKey: alerts.dedupKey, createdAt: alerts.createdAt })
      .from(alerts)
      .where(gte(alerts.createdAt, since));
    const seen = new Map<string, number>();
    for (const r of recent) seen.set(`${r.kind}|${r.dedupKey}`, r.createdAt.getTime());

    const nowMs = Date.now();
    const fresh = pending.filter((a) => {
      const at = seen.get(`${a.kind}|${a.dedupKey}`);
      if (at === undefined) return true;
      const cooldown = (COOLDOWN_S[a.kind] ?? 600) * 1000;
      return nowMs - at > cooldown;
    });
    if (fresh.length === 0) return;

    const inserted = await db
      .insert(alerts)
      .values(fresh)
      .returning();
    await deliver(inserted);
    console.log(
      `[alerts] ${inserted.length} novo(s): ${inserted.map((a) => a.kind).join(", ")}`,
    );
  } catch (err) {
    console.warn("[alerts] falha na avaliação:", err);
  }
}

/** Últimos alertas para o feed do dashboard */
export async function getRecentAlerts(limit = 20) {
  return db
    .select()
    .from(alerts)
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}
