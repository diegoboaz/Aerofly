// ============================================================
// AeroFly — dominio da aviacao brasileira
// Dados de referencia usados pelo motor de simulacao e pela
// pipeline Python (espelhados em python/pipeline.py)
// ============================================================

export interface AirlineMeta {
  code: string; // codigo interno usado nas chaves
  iata: string;
  name: string;
  color: string;
  // probabilidade base de cancelamento (%), baseada em perfis operacionais
  cancelProfile: number;
}

export const AIRLINES: AirlineMeta[] = [
  { code: "G3", iata: "G3", name: "GOL Linhas Aéreas", color: "#ff8a1e", cancelProfile: 2.6 },
  { code: "LA", iata: "LA", name: "LATAM Airlines Brasil", color: "#ff4d6d", cancelProfile: 2.0 },
  { code: "AD", iata: "AD", name: "Azul Linhas Aéreas", color: "#2ea8ff", cancelProfile: 1.4 },
  { code: "2Z", iata: "2Z", name: "Voepass", color: "#3ddc97", cancelProfile: 3.2 },
];

export interface AirportMeta {
  code: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export const AIRPORTS: AirportMeta[] = [
  { code: "GRU", name: "Aeroporto Internacional de Guarulhos", city: "São Paulo", state: "SP", lat: -23.4356, lon: -46.4731 },
  { code: "CGH", name: "Aeroporto de Congonhas", city: "São Paulo", state: "SP", lat: -23.6261, lon: -46.6564 },
  { code: "SDU", name: "Aeroporto Santos Dumont", city: "Rio de Janeiro", state: "RJ", lat: -22.9105, lon: -43.1631 },
  { code: "GIG", name: "Aeroporto Internacional do Galeão", city: "Rio de Janeiro", state: "RJ", lat: -22.809, lon: -43.2506 },
  { code: "BSB", name: "Aeroporto Internacional de Brasília", city: "Brasília", state: "DF", lat: -15.8697, lon: -47.9172 },
  { code: "CNF", name: "Aeroporto Internacional de Confins", city: "Belo Horizonte", state: "MG", lat: -19.6244, lon: -43.9719 },
  { code: "VIX", name: "Aeroporto Eurico de Aguiar Salles", city: "Vitória", state: "ES", lat: -20.2581, lon: -40.2864 },
  { code: "POA", name: "Aeroporto Salgado Filho", city: "Porto Alegre", state: "RS", lat: -29.9944, lon: -51.1714 },
  { code: "CWB", name: "Aeroporto Afonso Pena", city: "Curitiba", state: "PR", lat: -25.5285, lon: -49.1758 },
  { code: "FLN", name: "Aeroporto Hercílio Luz", city: "Florianópolis", state: "SC", lat: -27.6703, lon: -48.5525 },
  { code: "SSA", name: "Aeroporto Internacional de Salvador", city: "Salvador", state: "BA", lat: -12.9086, lon: -38.3225 },
  { code: "REC", name: "Aeroporto Internacional do Recife", city: "Recife", state: "PE", lat: -8.1265, lon: -34.9236 },
  { code: "FOR", name: "Aeroporto Pinto Martins", city: "Fortaleza", state: "CE", lat: -3.7763, lon: -38.5326 },
  { code: "MAO", name: "Aeroporto Internacional de Manaus", city: "Manaus", state: "AM", lat: -3.0386, lon: -60.0497 },
  { code: "BEL", name: "Aeroporto Internacional de Belém", city: "Belém", state: "PA", lat: -1.3792, lon: -48.4763 },
  { code: "GYN", name: "Aeroporto Santa Genoveva", city: "Goiânia", state: "GO", lat: -16.632, lon: -49.2207 },
];

export interface RouteMeta {
  origin: string;
  destination: string;
  blockMin: number; // tempo de voo em minutos
  dailyFreq: number; // frequencia diaria aproximada
  airlines: string[]; // companhias que operam a rota
}

// Malha aerea simplificada de rotas domesticas brasileiras
export const ROUTES: RouteMeta[] = [
  { origin: "GRU", destination: "SDU", blockMin: 55, dailyFreq: 8, airlines: ["LA", "G3", "AD"] },
  { origin: "SDU", destination: "GRU", blockMin: 60, dailyFreq: 8, airlines: ["LA", "G3", "AD"] },
  { origin: "CGH", destination: "SDU", blockMin: 50, dailyFreq: 6, airlines: ["LA", "G3"] },
  { origin: "SDU", destination: "CGH", blockMin: 50, dailyFreq: 6, airlines: ["LA", "G3"] },
  { origin: "GRU", destination: "BSB", blockMin: 105, dailyFreq: 7, airlines: ["LA", "G3", "AD"] },
  { origin: "BSB", destination: "GRU", blockMin: 100, dailyFreq: 7, airlines: ["LA", "G3", "AD"] },
  { origin: "CGH", destination: "BSB", blockMin: 100, dailyFreq: 5, airlines: ["LA", "G3"] },
  { origin: "GRU", destination: "CNF", blockMin: 85, dailyFreq: 6, airlines: ["LA", "G3", "AD"] },
  { origin: "CNF", destination: "GRU", blockMin: 80, dailyFreq: 6, airlines: ["LA", "G3", "AD"] },
  { origin: "CNF", destination: "GIG", blockMin: 70, dailyFreq: 4, airlines: ["G3", "AD"] },
  { origin: "CNF", destination: "SDU", blockMin: 65, dailyFreq: 4, airlines: ["LA", "AD"] },
  { origin: "GRU", destination: "POA", blockMin: 105, dailyFreq: 5, airlines: ["LA", "G3", "AD"] },
  { origin: "POA", destination: "GRU", blockMin: 110, dailyFreq: 5, airlines: ["LA", "G3", "AD"] },
  { origin: "CWB", destination: "POA", blockMin: 75, dailyFreq: 3, airlines: ["AD"] },
  { origin: "GRU", destination: "CWB", blockMin: 70, dailyFreq: 6, airlines: ["LA", "G3", "AD"] },
  { origin: "CWB", destination: "CGH", blockMin: 65, dailyFreq: 4, airlines: ["LA", "G3"] },
  { origin: "GRU", destination: "SSA", blockMin: 150, dailyFreq: 4, airlines: ["LA", "G3", "AD"] },
  { origin: "SSA", destination: "GRU", blockMin: 155, dailyFreq: 4, airlines: ["LA", "G3"] },
  { origin: "BSB", destination: "SSA", blockMin: 115, dailyFreq: 3, airlines: ["LA", "AD"] },
  { origin: "GRU", destination: "REC", blockMin: 180, dailyFreq: 4, airlines: ["LA", "G3", "AD"] },
  { origin: "REC", destination: "GRU", blockMin: 185, dailyFreq: 4, airlines: ["LA", "G3"] },
  { origin: "SSA", destination: "REC", blockMin: 85, dailyFreq: 3, airlines: ["AD"] },
  { origin: "GRU", destination: "FOR", blockMin: 195, dailyFreq: 4, airlines: ["LA", "G3", "AD"] },
  { origin: "FOR", destination: "GRU", blockMin: 200, dailyFreq: 4, airlines: ["LA", "G3"] },
  { origin: "REC", destination: "FOR", blockMin: 75, dailyFreq: 2, airlines: ["G3"] },
  { origin: "GRU", destination: "GIG", blockMin: 65, dailyFreq: 6, airlines: ["LA", "G3", "AD"] },
  { origin: "GIG", destination: "BSB", blockMin: 115, dailyFreq: 4, airlines: ["LA", "G3"] },
  { origin: "SDU", destination: "BSB", blockMin: 110, dailyFreq: 3, airlines: ["LA", "AD"] },
  { origin: "GRU", destination: "MAO", blockMin: 250, dailyFreq: 2, airlines: ["LA", "AD"] },
  { origin: "GRU", destination: "BEL", blockMin: 220, dailyFreq: 2, airlines: ["LA", "AD"] },
  { origin: "BSB", destination: "MAO", blockMin: 195, dailyFreq: 2, airlines: ["LA", "G3"] },
  { origin: "GRU", destination: "VIX", blockMin: 80, dailyFreq: 3, airlines: ["AD"] },
  { origin: "VIX", destination: "CGH", blockMin: 85, dailyFreq: 3, airlines: ["AD"] },
  { origin: "GRU", destination: "FLN", blockMin: 85, dailyFreq: 3, airlines: ["G3", "AD"] },
  { origin: "GRU", destination: "GYN", blockMin: 105, dailyFreq: 3, airlines: ["G3"] },
  { origin: "BSB", destination: "GYN", blockMin: 45, dailyFreq: 3, airlines: ["2Z"] },
  { origin: "GYN", destination: "CGH", blockMin: 110, dailyFreq: 2, airlines: ["2Z"] },
  { origin: "CNF", destination: "BSB", blockMin: 85, dailyFreq: 3, airlines: ["LA", "G3"] },
  { origin: "GIG", destination: "POA", blockMin: 130, dailyFreq: 3, airlines: ["AD"] },
  { origin: "FOR", destination: "SSA", blockMin: 105, dailyFreq: 2, airlines: ["AD"] },
  { origin: "POA", destination: "SDU", blockMin: 150, dailyFreq: 2, airlines: ["AD"] },
  { origin: "BEL", destination: "BSB", blockMin: 175, dailyFreq: 2, airlines: ["LA"] },
];

export const CANCELLATION_REASONS: { reason: string; weight: number }[] = [
  { reason: "Mau tempo no aeroporto de destino", weight: 28 },
  { reason: "Problema técnico na aeronave", weight: 22 },
  { reason: "Indisponibilidade de tripulação", weight: 15 },
  { reason: "Congestionamento aeroportuário", weight: 15 },
  { reason: "Manutenção não programada", weight: 10 },
  { reason: "Fator operacional da companhia", weight: 10 },
];

export const STATUS_META: Record<
  string,
  { label: string; color: string; soft: string }
> = {
  scheduled: { label: "Programado", color: "#94a3b8", soft: "rgba(148,163,184,0.14)" },
  boarding: { label: "Embarcando", color: "#7dd3fc", soft: "rgba(125,211,252,0.14)" },
  departed: { label: "Em voo", color: "#22d3ee", soft: "rgba(34,211,238,0.14)" },
  completed: { label: "Concluído", color: "#34d399", soft: "rgba(52,211,153,0.14)" },
  cancelled: { label: "Cancelado", color: "#fb7185", soft: "rgba(251,113,133,0.14)" },
};

export function getAirline(code: string): AirlineMeta {
  return AIRLINES.find((a) => a.code === code) ?? AIRLINES[0];
}

export function getAirport(code: string): AirportMeta | undefined {
  return AIRPORTS.find((a) => a.code === code);
}
