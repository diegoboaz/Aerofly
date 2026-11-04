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
}

/** Rastro real percorrido por uma aeronave (histórico de posições) */
export interface Trail {
  hex: string;
  callsign: string | null;
  airline: string | null;
  points: [number, number][]; // [lat, lon]
}

export interface LiveTrafficData {
  updatedAt: string;
  source: "opensky" | "flightradar24";
  auth: "oauth2" | "anonymous" | "api-key";
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
}
