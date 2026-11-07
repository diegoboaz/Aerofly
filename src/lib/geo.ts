// Helpers geograficos compartilhados (distancia, rumo, aeroportos)

import { AIRPORTS } from "./aviation";

export function haversineKm(
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

/** Rumo inicial (graus, 0=N) de (lat1,lon1) para (lat2,lon2) */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function nearestAirport(
  lat: number,
  lon: number,
): { code: string; distKm: number } | null {
  let best: { code: string; distKm: number } | null = null;
  for (const ap of AIRPORTS) {
    const d = haversineKm(lat, lon, ap.lat, ap.lon);
    if (!best || d < best.distKm) best = { code: ap.code, distKm: d };
  }
  return best;
}

/** Diferenca angular absoluta (0-180) entre dois rumos */
export function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Dead-reckoning em circulo maximo: projeta a posicao a partir de um
 * ponto, rumo e distancia (km). Usado para compensar a idade do dado
 * ADS-B (posicoes podem ter dezenas de segundos de atraso).
 */
export function destinationPoint(
  lat: number,
  lon: number,
  bearing: number,
  distKm: number,
): { lat: number; lon: number } {
  const R = 6371;
  const δ = distKm / R;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.min(1, Math.max(-1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * sinφ2,
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * Estima o destino de uma aeronave: aeroporto monitorado a frente
 * (alinhado com a proa atual) e dentro do alcance plausivel.
 * Retorna null quando nao ha candidato confiavel.
 */
export function estimateDestination(
  a: {
    lat: number;
    lon: number;
    track: number | null;
    altM: number | null;
    vsMs: number | null;
    onGround: boolean;
  },
  /** rumo medio calculado pelo rastro real (mais estavel que a proa instantanea) */
  trackFromTrail?: number | null,
): { code: string; confidence: number } | null {
  const heading = trackFromTrail ?? a.track;
  if (a.onGround || heading === null) return null;
  let best: { code: string; score: number; dist: number; diff: number } | null = null;

  for (const ap of AIRPORTS) {
    const dist = haversineKm(a.lat, a.lon, ap.lat, ap.lon);
    if (dist < 12 || dist > 1500) continue;
    const brg = bearingDeg(a.lat, a.lon, ap.lat, ap.lon);
    const diff = angleDiff(heading, brg);
    // tolerancia angular: mais rigida quanto mais longe o aeroporto
    const tolerance = dist < 120 ? 45 : dist < 400 ? 25 : 14;
    if (diff > tolerance) continue;
    // prioriza alinhamento e proximidade
    const score = diff + dist / 40;
    if (!best || score < best.score) best = { code: ap.code, score, dist, diff };
  }
  if (!best) return null;

  const descending = (a.vsMs ?? 0) < -0.8;
  // em cruzeiro alto e longe, a estimativa e fraca — exige bom alinhamento
  if (!descending && (a.altM ?? 0) > 9000 && best.dist > 500) return null;

  // confianca: alinhamento (0-55) + proximidade (0-25) + fase (0-20)
  let confidence =
    Math.max(0, 55 - best.diff * 2.2) + Math.max(0, 25 - best.dist / 24);
  if (descending && best.dist < 250) confidence += 20;
  else if (descending) confidence += 10;
  if (trackFromTrail !== null && trackFromTrail !== undefined) confidence += 6;
  confidence = Math.round(Math.min(97, Math.max(15, confidence)));

  return { code: best.code, confidence };
}
