DO $$ BEGIN CREATE TYPE flight_status AS ENUM ('scheduled','boarding','departed','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE flight_event_type AS ENUM ('created','boarding','departure','arrival','delay','cancellation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS airlines (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  iata text NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  cancel_profile real NOT NULL DEFAULT 1.5
);

CREATE TABLE IF NOT EXISTS airports (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  lat real NOT NULL,
  lon real NOT NULL
);

CREATE TABLE IF NOT EXISTS flights (
  id serial PRIMARY KEY,
  flight_number text NOT NULL,
  airline_code text NOT NULL REFERENCES airlines(code),
  origin_code text NOT NULL REFERENCES airports(code),
  destination_code text NOT NULL REFERENCES airports(code),
  block_minutes integer NOT NULL DEFAULT 90,
  status flight_status NOT NULL DEFAULT 'scheduled',
  delay_minutes integer NOT NULL DEFAULT 0,
  cancellation_reason text,
  scheduled_departure timestamptz NOT NULL,
  scheduled_arrival timestamptz NOT NULL,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS flights_number_dep_unique ON flights (flight_number, scheduled_departure);
CREATE INDEX IF NOT EXISTS flights_status_idx ON flights (status);
CREATE INDEX IF NOT EXISTS flights_dep_idx ON flights (scheduled_departure);
CREATE INDEX IF NOT EXISTS flights_airline_idx ON flights (airline_code);

CREATE TABLE IF NOT EXISTS flight_events (
  id serial PRIMARY KEY,
  flight_id integer,
  flight_number text NOT NULL,
  airline_code text NOT NULL,
  origin_code text NOT NULL,
  destination_code text NOT NULL,
  type flight_event_type NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_events_created_idx ON flight_events (created_at);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id serial PRIMARY KEY,
  source text NOT NULL DEFAULT 'web',
  mode text NOT NULL DEFAULT 'tick',
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  cancelled integer NOT NULL DEFAULT 0,
  events integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_runs_created_idx ON pipeline_runs (created_at);
