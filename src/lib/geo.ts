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
function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Estima o destino de uma aeronave: aeroporto monitorado a frente
 * (alinhado com a proa atual) e dentro do alcance plausivel.
 * Retorna null quando nao ha candidato confiavel.
 */
export function estimateDestination(a: {
  lat: number;
  lon: number;
  track: number | null;
  altM: number | null;
  vsMs: number | null;
  onGround: boolean;
}): string | null {
  if (a.onGround || a.track === null) return null;
  let best: { code: string; score: number; dist: number } | null = null;

  for (const ap of AIRPORTS) {
    const dist = haversineKm(a.lat, a.lon, ap.lat, ap.lon);
    if (dist < 12 || dist > 1500) continue;
    const brg = bearingDeg(a.lat, a.lon, ap.lat, ap.lon);
    const diff = angleDiff(a.track, brg);
    // tolerancia angular: mais rigida quanto mais longe o aeroporto
    const tolerance = dist < 120 ? 45 : dist < 400 ? 25 : 14;
    if (diff > tolerance) continue;
    // prioriza alinhamento e proximidade
    const score = diff + dist / 40;
    if (!best || score < best.score) best = { code: ap.code, score, dist };
  }
  if (!best) return null;
  // em cruzeiro alto e longe, a estimativa e fraca — exige bom alinhamento
  const descending = (a.vsMs ?? 0) < -0.8;
  if (!descending && (a.altM ?? 0) > 9000 && best.dist > 500) return null;
  return best.code;
}
