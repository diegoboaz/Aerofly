// Tipos compartilhados entre API e componentes do dashboard

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

export interface Kpis {
  totalToday: number;
  completed: number;
  inFlight: number;
  boarding: number;
  scheduled: number;
  delayed: number;
  cancelled: number;
  cancellationRate: number;
  onTimeRate: number;
  avgDelay: number;
}

export interface AirlineStat {
  code: string;
  name: string;
  color: string;
  total: number;
  completed: number;
  cancelled: number;
  delayed: number;
  inFlight: number;
  cancelRate: number;
  onTimeRate: number;
}

export interface HourlyPoint {
  hour: string;
  total: number;
  completed: number;
  cancelled: number;
  delayed: number;
}

export interface RouteStat {
  route: string;
  origin: string;
  destination: string;
  total: number;
  completed: number;
  cancelled: number;
  cancelRate: number;
}

export interface MapFlight {
  id: number;
  flightNumber: string;
  airlineCode: string;
  airlineColor: string;
  originCode: string;
  destinationCode: string;
  progress: number; // 0..1 do trecho percorrido
  delayMinutes: number;
  blockMinutes: number;
}

export interface AirportActivity {
  code: string;
  active: number; // voos em andamento relacionados ao aeroporto
  cancelledToday: number;
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
  totalFlights: number;
  totalEvents: number;
}

export interface DashboardData {
  generatedAt: string;
  kpis: Kpis;
  statusDistribution: { status: string; label: string; color: string; count: number }[];
  airlines: AirlineStat[];
  hourly: HourlyPoint[];
  topRoutes: RouteStat[];
  mapFlights: MapFlight[];
  airportActivity: AirportActivity[];
  recentFlights: FlightRow[];
  events: EventRow[];
  pipeline: PipelineInfo;
}

export interface FlightsPage {
  flights: FlightRow[];
  total: number;
  page: number;
  pages: number;
}

// ---- Trafego real (ADS-B / OpenSky Network) ----

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
}

export interface LiveTrafficData {
  updatedAt: string;
  source: "opensky";
  auth: "oauth2" | "anonymous";
  count: number;
  airborne: number;
  onGround: number;
  stale: boolean;
  cacheAgeSec: number;
  aircraft: LiveAircraft[];
}
