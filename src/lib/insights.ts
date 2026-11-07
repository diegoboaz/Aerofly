// ============================================================
// AeroFly — Motor de insights operacionais (dados REAIS)
// Regras derivadas do trafego ADS-B: fila de aproximacao,
// pressao de solo, esperas em voo, pico diario, concentracao
// de mercado e cobertura de identificacao.
// ============================================================

import { AIRPORTS } from "./aviation";
import type { EventRow, LiveAircraft, WeatherData } from "./types";

export type InsightSeverity = "success" | "info" | "warning" | "critical";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  metric?: string;
}

export interface AirportActivity {
  code: string;
  approach: number; // aeronaves em aproximacao (<70 km)
  ground: number; // aeronaves em solo no patio (<8 km)
}

export interface InsightsResult {
  insights: Insight[];
  pressureScore: number; // 0-100
  airportActivity: AirportActivity[];
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestAirport(lat: number, lon: number) {
  let best: { code: string; distKm: number } | null = null;
  for (const ap of AIRPORTS) {
    const d = haversineKm(lat, lon, ap.lat, ap.lon);
    if (!best || d < best.distKm) best = { code: ap.code, distKm: d };
  }
  return best;
}

export function buildInsights(
  aircraft: LiveAircraft[],
  hourly: { hour: string; aircraft: number }[],
  events: EventRow[],
  weather?: WeatherData | null,
): InsightsResult {
  const insights: Insight[] = [];
  const activity = new Map<string, AirportActivity>();
  const bump = (code: string, field: "approach" | "ground") => {
    const a = activity.get(code) ?? { code, approach: 0, ground: 0 };
    a[field]++;
    activity.set(code, a);
  };

  // ---- 1) Fila de aproximacao (descida baixa perto de aeroporto) ----
  // ---- 2) Pressao de solo (aeronaves no patio) ----
  // ---- 3) Esperas (baixa velocidade em altitude media) ----
  let holdings = 0;
  for (const a of aircraft) {
    const near = nearestAirport(a.lat, a.lon);
    if (!near) continue;
    if (a.onGround && near.distKm <= 8) {
      bump(near.code, "ground");
      continue;
    }
    const descending =
      !a.onGround && a.altM !== null && a.altM < 4500 && (a.vsMs ?? 0) < -0.5;
    if (descending && near.distKm <= 70) bump(near.code, "approach");
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

  const airportActivity = [...activity.values()].sort(
    (a, b) => b.approach + b.ground - (a.approach + a.ground),
  );
  const topApproach = airportActivity.find((a) => a.approach >= 3);
  const topGround = airportActivity.find((a) => a.ground >= 4);

  if (topApproach) {
    insights.push({
      id: "approach-queue",
      severity: topApproach.approach >= 6 ? "critical" : "warning",
      title: `Fila de aproximação em ${topApproach.code}`,
      detail:
        "Aeronaves em descida convergindo para o mesmo aeroporto. Avaliar sequenciamento, flow control e alocação de guichês/esteiras para a chegada.",
      metric: `${topApproach.approach} em aproximação`,
    });
  }
  if (topGround) {
    insights.push({
      id: "ground-pressure",
      severity: topGround.ground >= 8 ? "warning" : "info",
      title: `Movimento de solo elevado em ${topGround.code}`,
      detail:
        "Pátio com muitas aeronaves paradas/em taxi. Reforçar turnaround (abastecimento, limpeza, embarque) para proteger os próximos horários.",
      metric: `${topGround.ground} em solo`,
    });
  }
  if (holdings > 0) {
    insights.push({
      id: "holding",
      severity: holdings >= 4 ? "warning" : "info",
      title: "Possíveis esperas em voo",
      detail:
        "Aeronaves em altitude média com velocidade reduzida — padrão compatível com espera ou vetoração longa. Impacto direto em combustível e atrasos.",
      metric: `${holdings} aeronave(s)`,
    });
  }

  // ---- 3b) METEOROLOGIA REAL cruzada com o trafego ----
  if (weather) {
    const adverse = weather.airports.filter(
      (w) => w.severity === "severe" || w.severity === "warning",
    );
    for (const w of adverse.slice(0, 3)) {
      const act = activity.get(w.code);
      const exposed = (act?.approach ?? 0) + (act?.ground ?? 0);
      const driver =
        w.cape !== null && w.cape >= 2000
          ? `CAPE ${Math.round(w.cape)} J/kg`
          : w.gustKmh >= 45
            ? `rajadas ${Math.round(w.gustKmh)} km/h`
            : w.visibilityM !== null && w.visibilityM < 3000
              ? `vis ${(w.visibilityM / 1000).toFixed(1)} km`
              : w.condition;
      insights.push({
        id: `wx-${w.code}`,
        severity: w.severity === "severe" ? "critical" : "warning",
        title: `${w.storm ? "Tempestade" : "Risco meteorológico"} em ${w.code} · ${w.city}`,
        detail:
          `${w.condition}. ${w.reasons.join("; ")}.` +
          (exposed > 0
            ? ` ${exposed} aeronave(s) expostas agora — avaliar espera, arremetida e combustível extra.`
            : " Avaliar impacto nas próximas chegadas e partidas."),
        metric: driver,
      });
    }

    // vento cruzado forte nos hubs (risco em pouso/decolagem)
    const windy = weather.airports
      .filter((w) => w.gustKmh >= 40)
      .sort((a, b) => b.gustKmh - a.gustKmh)[0];
    if (windy && !adverse.some((a) => a.code === windy.code)) {
      insights.push({
        id: "wx-wind",
        severity: "info",
        title: `Vento intenso em ${windy.code}`,
        detail:
          `Rajadas de ${windy.windCardinal} podem exigir correção de deriva e ` +
          "aumentar o tempo entre pousos. Monitorar limites de vento de través.",
        metric: `${Math.round(windy.gustKmh)} km/h · ${windy.windCardinal}`,
      });
    }

    if (adverse.length === 0) {
      insights.push({
        id: "wx-ok",
        severity: "success",
        title: "Meteorologia favorável na malha",
        detail:
          "Nenhum aeroporto monitorado com tempestade, teto baixo ou vento crítico neste momento.",
        metric: `${weather.airports.length} aeroportos avaliados`,
      });
    }
  }

  // ---- 4) Pico diario (historico real acumulado pela pipeline) ----
  const peak = hourly.reduce(
    (best, h) => (h.aircraft > best.aircraft ? h : best),
    { hour: "", aircraft: 0 },
  );
  const nowSpHour = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const currentHr = hourly.find((h) => h.hour === nowSpHour);
  if (peak.aircraft > 0 && currentHr && currentHr.aircraft >= peak.aircraft * 0.85) {
    insights.push({
      id: "daily-peak",
      severity: "info",
      title: "Operando no pico diário de tráfego",
      detail:
        "O volume atual está próximo do máximo observado hoje. Momento crítico para irregulalidades se propagarem — atenção a buffers de tripulação e slots.",
      metric: `${nowSpHour}h · ${currentHr.aircraft} aeronaves`,
    });
  } else if (peak.aircraft === 0) {
    insights.push({
      id: "history-building",
      severity: "info",
      title: "Histórico intradiário em construção",
      detail:
        "Com a pipeline ADS-B rodando (python --mode daemon), o perfil de tráfego por hora permite identificar os picos operacionais do dia.",
    });
  }

  // ---- 5) Concentracao por companhia ----
  const byAirline = new Map<string, number>();
  let airborneKnown = 0;
  for (const a of aircraft) {
    if (a.onGround || !a.airline) continue;
    airborneKnown++;
    byAirline.set(a.airline, (byAirline.get(a.airline) ?? 0) + 1);
  }
  const leader = [...byAirline.entries()].sort((a, b) => b[1] - a[1])[0];
  if (leader && airborneKnown >= 8) {
    const share = Math.round((leader[1] / airborneKnown) * 100);
    insights.push({
      id: "market-share",
      severity: share >= 45 ? "info" : "success",
      title: `${leader[0]} lidera o tráfego monitorado`,
      detail:
        share >= 45
          ? "Alta concentração: irregularidades dessa malha têm efeito sistêmico no tráfego nacional. Prioridade em monitoramento dessa operação."
          : "Distribuição equilibrada entre companhias neste momento.",
      metric: `${share}% das aeronaves identificadas`,
    });
  }

  // ---- 6) Cobertura de identificacao (qualidade do sinal) ----
  if (aircraft.length > 0) {
    const identified = aircraft.filter((a) => a.callsign).length;
    const pct = Math.round((identified / aircraft.length) * 100);
    insights.push({
      id: "ident-coverage",
      severity: pct >= 80 ? "success" : "info",
      title: "Qualidade de identificação do tráfego",
      detail:
        "Percentual de aeronaves transmitindo callsign (voo identificado). Baixa cobertura limita análises por companhia/rota.",
      metric: `${pct}% com callsign`,
    });
  }

  // ---- 7) Movimentos reais na ultima hora (eventos derivados) ----
  const lastHour = Date.now() - 3600_000;
  const movements = events.filter(
    (e) =>
      (e.type === "arrival" || e.type === "departure") &&
      new Date(e.createdAt).getTime() > lastHour,
  ).length;
  if (movements > 0) {
    insights.push({
      id: "movements",
      severity: "success",
      title: "Movimentos reais detectados (60 min)",
      detail:
        "Pousos e decolagens derivados das transições ADS-B. Acompanha o throughput real da operação.",
      metric: `${movements} movimento(s)`,
    });
  }

  // ---- Indice de Pressao Operacional (0-100) ----
  // Pondera congestionamento, esperas, pico diario e METEOROLOGIA real.
  const approachTotal = airportActivity.reduce((s, a) => s + a.approach, 0);
  const groundTotal = airportActivity.reduce((s, a) => s + a.ground, 0);
  const wxPenalty = weather
    ? Math.min(
        20,
        weather.airports.reduce(
          (s, w) =>
            s + (w.severity === "severe" ? 8 : w.severity === "warning" ? 4 : 0),
          0,
        ),
      )
    : 0;
  const pressureScore = Math.min(
    100,
    Math.round(
      Math.min(approachTotal / 8, 1) * 34 +
        Math.min(groundTotal / 12, 1) * 20 +
        Math.min(holdings / 6, 1) * 20 +
        (currentHr && peak.aircraft > 0 && currentHr.aircraft >= peak.aircraft * 0.9
          ? 6
          : 0) +
        wxPenalty,
    ),
  );

  insights.sort((a, b) => {
    const w = { critical: 0, warning: 1, info: 2, success: 3 };
    return w[a.severity] - w[b.severity];
  });

  return { insights, pressureScore, airportActivity };
}
