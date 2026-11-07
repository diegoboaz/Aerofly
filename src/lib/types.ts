// Tipos compartilhados entre API e componentes do dashboard (dados REAIS)

export interface EventRow {
  id: number;
  flightNumber: string;
  airlineCode: string;
  originCode: string;
  destinationCode: string;
  type: "created" | "boarding" | "departure" | "arrival" | "delay" | "cancellation";
  message: string;
  createdAt: string;
}

// ---- Trafego real (ADS-B / OpenSky / FlightRadar24) ----

export interface LiveAircraft {
  hex: string;
  callsign: string | null;
  airline: string | null;
  country: string;
  lat: number;
  lon: number;
  altM: number | null;
  speedKmh: number | null;
  track: number | null;
  vsMs: number | null;
  onGround: boolean;
  // enriquecimento quando a fonte fornece rota (ex.: FlightRadar24 "full")
  flightNumber?: string | null;
  origIata?: string | null;
  destIata?: string | null;
  /** destino estimado pela trajetoria quando a fonte nao informa a rota */
  destEstimate?: string | null;
  /** confianca (%) da estimativa de destino */
  destConfidence?: number | null;
  /** idade da posicao ADS-B em segundos (precisao do dado) */
  posAgeSec?: number | null;
  /** rumo medio derivado do rastro real (mais estavel que a proa) */
  trailTrack?: number | null;
  /** matricula da aeronave (ex.: PR-GZH) */
  registration?: string | null;
  /** modelo ICAO (ex.: B738 = Boeing 737-800) */
  aircraftType?: string | null;
  /** codigo transponder */
  squawk?: string | null;
  /** raio de contencao da posicao em metros (precisao do fix) */
  accuracyM?: number | null;
}

/** Rastro real percorrido por uma aeronave (histórico de posições) */
export interface Trail {
  hex: string;
  callsign: string | null;
  airline: string | null;
  points: [number, number][]; // [lat, lon]
}

export interface ProviderHealth {
  name: string;
  configured: boolean;
  status:
    | "unconfigured"
    | "idle"
    | "loading"
    | "online"
    | "partial"
    | "offline";
  latencyMs: number | null;
  successfulRegions: number;
  totalRegions: number;
  aircraft: number;
  lastSuccessAt: string | null;
  error: string | null;
}

export interface LiveTrafficData {
  updatedAt: string;
  source:
    | "opensky"
    | "flightradar24"
    | "flyitalyadsb"
    | "adsb.lol"
    | "adsb.fi";
  auth: "oauth2" | "anonymous" | "api-key" | "open";
  count: number;
  airborne: number;
  onGround: number;
  stale: boolean;
  cacheAgeSec: number;
  aircraft: LiveAircraft[];
}

// ---- Voos reais recentes (OpenSky /flights/all) ----

export interface RealRouteFlight {
  callsign: string | null;
  airline: string | null;
  fromIcao: string | null;
  toIcao: string | null;
  firstSeen: number; // epoch s
  lastSeen: number; // epoch s
}

export interface FlightsPage {
  flights: FlightRow[];
  total: number;
  page: number;
  pages: number;
}

/** @deprecated legado da malha simulada — mantido para compat do banco */
export interface FlightRow {
  id: number;
  flightNumber: string;
  airlineCode: string;
  originCode: string;
  destinationCode: string;
  status: "scheduled" | "boarding" | "departed" | "completed" | "cancelled";
  delayMinutes: number;
  cancellationReason: string | null;
  scheduledDeparture: string;
  scheduledArrival: string;
  actualDeparture: string | null;
  actualArrival: string | null;
  blockMinutes: number;
}

// ---- Aggregados REAIS do dashboard ----

export interface RealKpis {
  trackedNow: number;
  airborne: number;
  onGround: number;
  recent90min: number | null; // null = fonte indisponivel
  monitoredAirborne: number;
  medianFlightLevel: number | null;
}

export interface PhaseSlice {
  status: string;
  label: string;
  color: string;
  count: number;
}

export interface RealAirlineStat {
  code: string;
  name: string;
  color: string;
  inAirNow: number;
  detectedToday: number; // icao24 distintos vistos hoje (live_traffic)
}

export interface RealRouteStat {
  route: string;
  origin: string;
  destination: string;
  flights: number; // voos reais na janela recente
}

// ---- Meteorologia real (Open-Meteo) ----

export type WeatherSeverity = "ok" | "watch" | "warning" | "severe";

export interface AirportWeather {
  code: string;
  city: string;
  lat: number;
  lon: number;
  tempC: number;
  condition: string;
  weatherCode: number;
  storm: boolean;
  precipMm: number;
  rainProbability: number | null;
  cloudCover: number;
  windKmh: number;
  windDir: number;
  windCardinal: string;
  gustKmh: number;
  visibilityM: number | null;
  cape: number | null;
  severity: WeatherSeverity;
  reasons: string[];
  observedAt: string;
}

export interface WeatherData {
  updatedAt: string;
  provider: "open-meteo";
  stale: boolean;
  airports: AirportWeather[];
  alertCount: number;
}

// ---- Alertas operacionais ----

export interface AlertRow {
  id: number;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  airport: string | null;
  flightNumber: string | null;
  createdAt: string;
}

// ---- Insights operacionais ----

export interface Insight {
  id: string;
  severity: "success" | "info" | "warning" | "critical";
  title: string;
  detail: string;
  metric?: string;
}

export interface AirportActivityReal {
  code: string;
  approach: number;
  ground: number;
}

export interface PipelineInfo {
  lastRun: {
    source: string;
    mode: string;
    createdAt: string;
    durationMs: number;
    inserted: number;
    updated: number;
    cancelled: number;
  } | null;
  totalRuns: number;
  adsbSnapshots: number; // linhas em live_traffic
  totalEvents: number;
}

export interface DashboardData {
  generatedAt: string;
  source: LiveTrafficData["source"];
  auth: LiveTrafficData["auth"];
  stale: boolean;
  cacheAgeSec: number;
  kpis: RealKpis;
  phases: PhaseSlice[];
  airlines: RealAirlineStat[];
  hourly: { hour: string; aircraft: number }[];
  topRoutes: RealRouteStat[];
  aircraft: LiveAircraft[];
  events: EventRow[];
  pipeline: PipelineInfo;
  recentFlightsAvailable: boolean;
  insights: Insight[];
  pressureScore: number;
  airportActivity: AirportActivityReal[];
  trails: Trail[];
  weather: WeatherData | null;
  /** false quando a fonte ADS-B está fora do ar (UI degrada com aviso) */
  sourceAvailable: boolean;
  alerts: AlertRow[];
  providerHealth: ProviderHealth[];
}
