import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const flightEventTypeEnum = pgEnum("flight_event_type", [
  "created",
  "boarding",
  "departure",
  "arrival",
  "delay",
  "cancellation",
]);

export const airlines = pgTable("airlines", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  iata: text("iata").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  // Perfil base de cancelamento (%) usado pelo motor de simulacao / pipeline
  cancelProfile: real("cancel_profile").notNull().default(1.5),
});

export const airports = pgTable("airports", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
});

export const flightEvents = pgTable(
  "flight_events",
  {
    id: serial("id").primaryKey(),
    flightId: integer("flight_id"),
    flightNumber: text("flight_number").notNull(),
    airlineCode: text("airline_code").notNull(),
    originCode: text("origin_code").notNull(),
    destinationCode: text("destination_code").notNull(),
    type: flightEventTypeEnum("type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("flight_events_created_idx").on(t.createdAt)],
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull().default("web"), // "python" | "web"
    mode: text("mode").notNull().default("tick"), // "seed" | "tick"
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    cancelled: integer("cancelled").notNull().default(0),
    events: integer("events").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pipeline_runs_created_idx").on(t.createdAt)],
);

/**
 * Snapshots de trafego REAL (ADS-B / OpenSky Network).
 * Alimentada pela pipeline Python (modo adsb / daemon --adsb).
 */
export const liveTraffic = pgTable(
  "live_traffic",
  {
    id: serial("id").primaryKey(),
    icao24: text("icao24").notNull(),
    callsign: text("callsign"),
    airlineCode: text("airline_code"),
    originCountry: text("origin_country"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    baroAltitude: real("baro_altitude"),
    speedKmh: real("speed_kmh"),
    track: real("track"),
    verticalRate: real("vertical_rate"),
    onGround: boolean("on_ground").notNull().default(false),
    source: text("source").notNull().default("opensky"), // opensky | flightradar24
    origIata: text("orig_iata"),
    destIata: text("dest_iata"),
    seenAt: timestamp("seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("live_traffic_seen_idx").on(t.seenAt)],
);

export type Airline = typeof airlines.$inferSelect;
export type Airport = typeof airports.$inferSelect;
export type FlightEvent = typeof flightEvents.$inferSelect;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type LiveTrafficRow = typeof liveTraffic.$inferSelect;
