#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 AeroFly — Pipeline de dados operacionais (ETL)
================================================================
 Automatiza o fluxo de dados da operação aérea brasileira:

   EXTRACT   -> gera/consolida a malha de voos (fonte sintética;
                ponto de integração futura com ANAC / APIs de voo)
   TRANSFORM -> resolve status, atrasos e cancelamentos
   LOAD      -> persiste voos, eventos e execuções no PostgreSQL

 Uso:
   python python/pipeline.py --mode seed          # carga inicial
   python python/pipeline.py --mode tick          # 1 ciclo operacional
   python python/pipeline.py --mode tick --ticks 10 --interval 5
   python python/pipeline.py --mode adsb          # ingere tráfego REAL (OpenSky)
   python python/pipeline.py --mode daemon --interval 30          # contínuo
   python python/pipeline.py --mode daemon --interval 30 --adsb   # contínuo + ADS-B

 Requisitos: ver python/requirements.txt
 Conexão: variável de ambiente DATABASE_URL
 Dados reais (opcional): OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET
================================================================
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aerofly.pipeline")

SP_TZ = timezone(timedelta(hours=-3))  # Brasília = UTC-3

# ----------------------------------------------------------------
# Dados de referência (espelho de src/lib/aviation.ts)
# ----------------------------------------------------------------
AIRLINES = [
    ("G3", "G3", "GOL Linhas Aéreas", "#ff8a1e", 2.6),
    ("LA", "LA", "LATAM Airlines Brasil", "#ff4d6d", 2.0),
    ("AD", "AD", "Azul Linhas Aéreas", "#2ea8ff", 1.4),
    ("2Z", "2Z", "Voepass", "#3ddc97", 3.2),
]

AIRPORTS = [
    ("GRU", "Aeroporto Internacional de Guarulhos", "São Paulo", "SP", -23.4356, -46.4731),
    ("CGH", "Aeroporto de Congonhas", "São Paulo", "SP", -23.6261, -46.6564),
    ("SDU", "Aeroporto Santos Dumont", "Rio de Janeiro", "RJ", -22.9105, -43.1631),
    ("GIG", "Aeroporto Internacional do Galeão", "Rio de Janeiro", "RJ", -22.8090, -43.2506),
    ("BSB", "Aeroporto Internacional de Brasília", "Brasília", "DF", -15.8697, -47.9172),
    ("CNF", "Aeroporto Internacional de Confins", "Belo Horizonte", "MG", -19.6244, -43.9719),
    ("VIX", "Aeroporto Eurico de Aguiar Salles", "Vitória", "ES", -20.2581, -40.2864),
    ("POA", "Aeroporto Salgado Filho", "Porto Alegre", "RS", -29.9944, -51.1714),
    ("CWB", "Aeroporto Afonso Pena", "Curitiba", "PR", -25.5285, -49.1758),
    ("FLN", "Aeroporto Hercílio Luz", "Florianópolis", "SC", -27.6703, -48.5525),
    ("SSA", "Aeroporto Internacional de Salvador", "Salvador", "BA", -12.9086, -38.3225),
    ("REC", "Aeroporto Internacional do Recife", "Recife", "PE", -8.1265, -34.9236),
    ("FOR", "Aeroporto Pinto Martins", "Fortaleza", "CE", -3.7763, -38.5326),
    ("MAO", "Aeroporto Internacional de Manaus", "Manaus", "AM", -3.0386, -60.0497),
    ("BEL", "Aeroporto Internacional de Belém", "Belém", "PA", -1.3792, -48.4763),
    ("GYN", "Aeroporto Santa Genoveva", "Goiânia", "GO", -16.6320, -49.2207),
    ("SLZ", "Aeroporto Internacional Marechal Cunha Machado", "São Luís", "MA", -2.5854, -44.2341),
]

# (origem, destino, tempo de voo em min, frequência diária, companhias)
ROUTES = [
    ("GRU", "SDU", 55, 8, ("LA", "G3", "AD")),
    ("SDU", "GRU", 60, 8, ("LA", "G3", "AD")),
    ("CGH", "SDU", 50, 6, ("LA", "G3")),
    ("SDU", "CGH", 50, 6, ("LA", "G3")),
    ("GRU", "BSB", 105, 7, ("LA", "G3", "AD")),
    ("BSB", "GRU", 100, 7, ("LA", "G3", "AD")),
    ("CGH", "BSB", 100, 5, ("LA", "G3")),
    ("GRU", "CNF", 85, 6, ("LA", "G3", "AD")),
    ("CNF", "GRU", 80, 6, ("LA", "G3", "AD")),
    ("CNF", "GIG", 70, 4, ("G3", "AD")),
    ("CNF", "SDU", 65, 4, ("LA", "AD")),
    ("GRU", "POA", 105, 5, ("LA", "G3", "AD")),
    ("POA", "GRU", 110, 5, ("LA", "G3", "AD")),
    ("CWB", "POA", 75, 3, ("AD",)),
    ("GRU", "CWB", 70, 6, ("LA", "G3", "AD")),
    ("CWB", "CGH", 65, 4, ("LA", "G3")),
    ("GRU", "SSA", 150, 4, ("LA", "G3", "AD")),
    ("SSA", "GRU", 155, 4, ("LA", "G3")),
    ("BSB", "SSA", 115, 3, ("LA", "AD")),
    ("GRU", "REC", 180, 4, ("LA", "G3", "AD")),
    ("REC", "GRU", 185, 4, ("LA", "G3")),
    ("SSA", "REC", 85, 3, ("AD",)),
    ("GRU", "FOR", 195, 4, ("LA", "G3", "AD")),
    ("FOR", "GRU", 200, 4, ("LA", "G3")),
    ("REC", "FOR", 75, 2, ("G3",)),
    ("GRU", "GIG", 65, 6, ("LA", "G3", "AD")),
    ("GIG", "BSB", 115, 4, ("LA", "G3")),
    ("SDU", "BSB", 110, 3, ("LA", "AD")),
    ("GRU", "MAO", 250, 2, ("LA", "AD")),
    ("GRU", "BEL", 220, 2, ("LA", "AD")),
    ("BSB", "MAO", 195, 2, ("LA", "G3")),
    ("GRU", "VIX", 80, 3, ("AD",)),
    ("VIX", "CGH", 85, 3, ("AD",)),
    ("GRU", "FLN", 85, 3, ("G3", "AD")),
    ("GRU", "GYN", 105, 3, ("G3",)),
    ("BSB", "GYN", 45, 3, ("2Z",)),
    ("GYN", "CGH", 110, 2, ("2Z",)),
    ("CNF", "BSB", 85, 3, ("LA", "G3")),
    ("GIG", "POA", 130, 3, ("AD",)),
    ("FOR", "SSA", 105, 2, ("AD",)),
    ("POA", "SDU", 150, 2, ("AD",)),
    ("BEL", "BSB", 175, 2, ("LA",)),
    # São Luís (SLZ)
    ("GRU", "SLZ", 200, 3, ("LA", "G3")),
    ("SLZ", "GRU", 205, 3, ("LA", "G3")),
    ("BSB", "SLZ", 145, 2, ("LA", "G3")),
    ("SLZ", "BSB", 150, 2, ("LA", "G3")),
    ("BEL", "SLZ", 75, 2, ("AD", "LA")),
    ("SLZ", "BEL", 80, 2, ("AD", "LA")),
    ("FOR", "SLZ", 75, 2, ("G3",)),
    ("SSA", "SLZ", 95, 2, ("AD",)),
    ("REC", "SLZ", 110, 1, ("AD",)),
    ("GIG", "SLZ", 190, 1, ("LA",)),
]

CANCELLATION_REASONS = [
    ("Mau tempo no aeroporto de destino", 28),
    ("Problema técnico na aeronave", 22),
    ("Indisponibilidade de tripulação", 15),
    ("Congestionamento aeroportuário", 15),
    ("Manutenção não programada", 10),
    ("Fator operacional da companhia", 10),
]

CANCEL_PROFILE = {code: profile for code, _, _, _, profile in AIRLINES}

# ----------------------------------------------------------------
# Dados REAIS — OpenSky Network (ADS-B)
# ----------------------------------------------------------------
OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/"
    "protocol/openid-connect/token"
)
# Janela que cobre o território brasileiro (lamin, lomin, lamax, lomax)
BBOX_BR = (-34.5, -74.0, 6.0, -33.0)

# Prefixo ICAO do callsign -> código IATA monitorado
ICAO_TO_IATA = {"TAM": "LA", "LAN": "LA", "GLO": "G3", "AZU": "AD", "PTB": "2Z"}

_opensky_token: dict = {"token": None, "expires_at": 0.0}


@dataclass
class Counters:
    inserted: int = 0
    updated: int = 0
    cancelled: int = 0
    events: list = field(default_factory=list)


def sample_reason() -> str:
    reasons, weights = zip(*CANCELLATION_REASONS)
    return random.choices(reasons, weights=weights, k=1)[0]


def sample_delay() -> int:
    r = random.random()
    if r < 0.72:
        return random.randint(0, 12)
    if r < 0.90:
        return random.randint(13, 35)
    if r < 0.97:
        return random.randint(36, 75)
    return random.randint(76, 140)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# =================================================================
# EXTRACT — geração da malha (ponto de integração com fontes reais)
# =================================================================
def base_flight(origin, dest, block, companies, dep) -> dict:
    """Registro bruto de voo com os campos operacionais zerados."""
    company = random.choice(companies)
    return {
        "flight_number": f"{company}{random.randint(1000, 3999)}",
        "airline_code": company,
        "origin_code": origin,
        "destination_code": dest,
        "block_minutes": block,
        "scheduled_departure": dep,
        "scheduled_arrival": dep + timedelta(minutes=block + random.randint(-4, 12)),
        "status": "scheduled",
        "delay_minutes": 0,
        "cancellation_reason": None,
        "actual_departure": None,
        "actual_arrival": None,
    }


def extract_day_schedule(day: datetime) -> list[dict]:
    """Monta a grade de voos de um dia (05:30–23:40, horário de SP)."""
    rows = []
    day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    for origin, dest, block, freq, companies in ROUTES:
        slot = (1420 - 330) / freq  # minutos entre 05:30 e 23:40
        for i in range(freq):
            dep_min = 330 + i * slot + random.randint(0, max(8, int(slot * 0.35)))
            dep = day_start + timedelta(minutes=dep_min)
            rows.append(base_flight(origin, dest, block, companies, dep))
    return rows


def extract_window(start: datetime, hours: int) -> list[dict]:
    """Gera voos programados em uma janela rolante (rolagem contínua)."""
    rows = []
    for origin, dest, block, freq, companies in ROUTES:
        n = max(1, round(freq * hours / 18))
        for _ in range(n):
            dep = start + timedelta(minutes=random.randint(0, hours * 60))
            rows.append(base_flight(origin, dest, block, companies, dep))
    return rows


# =================================================================
# TRANSFORM — resolução de status, atrasos e cancelamentos
# =================================================================
def resolve_status(row: dict, now: datetime) -> dict:
    """Aplica o estado operacional de acordo com o relógio."""
    dep, arr = row["scheduled_departure"], row["scheduled_arrival"]
    profile = CANCEL_PROFILE.get(row["airline_code"], 2.0)
    row.update(status="scheduled", delay_minutes=0, cancellation_reason=None,
               actual_departure=None, actual_arrival=None)

    if dep > now + timedelta(minutes=35):
        pass  # futuro
    elif dep <= now and arr > now:
        row["status"] = "departed"
        row["delay_minutes"] = random.randint(5, 45) if random.random() < 0.3 else random.randint(0, 8)
        row["actual_departure"] = dep + timedelta(minutes=row["delay_minutes"])
    elif dep <= now + timedelta(minutes=35) and arr > now:
        row["status"] = "boarding"
        row["delay_minutes"] = random.randint(4, 25) if random.random() < 0.35 else 0
    else:
        if random.random() * 100 < profile:
            row["status"] = "cancelled"
            row["cancellation_reason"] = sample_reason()
        else:
            row["status"] = "completed"
            row["delay_minutes"] = sample_delay()
            row["actual_departure"] = dep + timedelta(minutes=row["delay_minutes"])
            row["actual_arrival"] = arr + timedelta(minutes=round(row["delay_minutes"] * 0.85))
    return row


# =================================================================
# LOAD — persistência no PostgreSQL
# =================================================================
INSERT_FLIGHT = """
    INSERT INTO flights (
        flight_number, airline_code, origin_code, destination_code,
        block_minutes, status, delay_minutes, cancellation_reason,
        scheduled_departure, scheduled_arrival,
        actual_departure, actual_arrival
    ) VALUES (
        %(flight_number)s, %(airline_code)s, %(origin_code)s, %(destination_code)s,
        %(block_minutes)s, %(status)s, %(delay_minutes)s, %(cancellation_reason)s,
        %(scheduled_departure)s, %(scheduled_arrival)s,
        %(actual_departure)s, %(actual_arrival)s
    )
    ON CONFLICT DO NOTHING
"""

INSERT_EVENT = """
    INSERT INTO flight_events (
        flight_id, flight_number, airline_code, origin_code,
        destination_code, type, message
    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
"""


def ensure_reference_data(cur) -> None:
    for code, iata, name, color, profile in AIRLINES:
        cur.execute(
            "INSERT INTO airlines (code, iata, name, color, cancel_profile) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (code) DO NOTHING",
            (code, iata, name, color, profile),
        )
    cur.executemany(
        "INSERT INTO airports (code, name, city, state, lat, lon) "
        "VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (code) DO NOTHING",
        AIRPORTS,
    )


def insert_flights(cur, rows: list[dict]) -> int:
    if not rows:
        return 0
    psycopg2.extras.execute_batch(cur, INSERT_FLIGHT, rows, page_size=200)
    return len(rows)


def record_run(cur, mode: str, counters: Counters, duration_ms: int) -> None:
    cur.execute(
        "INSERT INTO pipeline_runs (source, mode, inserted, updated, cancelled, events, duration_ms) "
        "VALUES ('python', %s, %s, %s, %s, %s, %s)",
        (mode, counters.inserted, counters.updated, counters.cancelled,
         len(counters.events), duration_ms),
    )


# -----------------------------------------------------------------
# Modo SEED — carga inicial idempotente
# -----------------------------------------------------------------
def run_seed(conn) -> None:
    started = time.monotonic()
    counters = Counters()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        ensure_reference_data(cur)
        cur.execute(
            "SELECT COUNT(*) AS n FROM flights WHERE scheduled_departure >= %s",
            (now_utc().astimezone(SP_TZ).replace(hour=0, minute=0, second=0, microsecond=0),),
        )
        if cur.fetchone()["n"] > 0:
            log.info("seed ignorado: já existem voos para hoje")
            return

        today = now_utc().astimezone(SP_TZ)
        for days_back in (1, 0):
            day = today - timedelta(days=days_back)
            rows = [resolve_status(r, now_utc()) for r in extract_day_schedule(day)]
            counters.inserted += insert_flights(cur, rows)
            log.info("malha %s: %d voos", day.date(), len(rows))

        window = extract_window(now_utc() + timedelta(hours=6), 6)
        counters.inserted += insert_flights(cur, window)

        # eventos sintéticos das últimas horas p/ alimentar o feed
        cur.execute(
            "SELECT * FROM flights WHERE scheduled_departure >= %s "
            "AND status IN ('completed','cancelled','departed') "
            "ORDER BY scheduled_departure DESC LIMIT 80",
            (now_utc() - timedelta(hours=3),),
        )
        for f in cur.fetchall():
            route = f"{f['flight_number']} {f['origin_code']}→{f['destination_code']}"
            if f["status"] == "completed":
                msg = f"{route} concluído " + (
                    f"com {f['delay_minutes']} min de atraso"
                    if f["delay_minutes"] >= 15 else "dentro do horário"
                )
                counters.events.append((f["id"], f["flight_number"], f["airline_code"],
                                        f["origin_code"], f["destination_code"], "arrival", msg))
            elif f["status"] == "cancelled":
                counters.events.append((f["id"], f["flight_number"], f["airline_code"],
                                        f["origin_code"], f["destination_code"], "cancellation",
                                        f"{route} cancelado — {f['cancellation_reason']}"))
        psycopg2.extras.execute_batch(cur, INSERT_EVENT, counters.events[:45], page_size=100)
        record_run(cur, "seed", counters, int((time.monotonic() - started) * 1000))
    conn.commit()
    log.info("seed concluído: +%d voos, %d eventos", counters.inserted, len(counters.events))


# -----------------------------------------------------------------
# Modo TICK — avança a operação (embarque, decolagem, pouso, ocorrências)
# -----------------------------------------------------------------
def run_tick(conn) -> None:
    started = time.monotonic()
    counters = Counters()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        ensure_reference_data(cur)

        def emit(f, etype, msg):
            counters.events.append((f["id"], f["flight_number"], f["airline_code"],
                                    f["origin_code"], f["destination_code"], etype, msg))

        # 1) embarque (35 min antes da partida efetiva)
        cur.execute(
            """
            UPDATE flights SET status='boarding', updated_at=now()
            WHERE status='scheduled'
              AND scheduled_departure + make_interval(mins => delay_minutes) > now()
              AND scheduled_departure + make_interval(mins => delay_minutes) <= now() + interval '35 minutes'
            RETURNING *
            """
        )
        for f in cur.fetchall():
            counters.updated += 1
            emit(f, "boarding", f"Embarque iniciado · {f['flight_number']} {f['origin_code']}→{f['destination_code']}")

        # 2) decolagens devidas
        cur.execute(
            """
            UPDATE flights
            SET status='departed',
                actual_departure = scheduled_departure + make_interval(mins => delay_minutes),
                updated_at = now()
            WHERE status IN ('scheduled','boarding')
              AND scheduled_departure + make_interval(mins => delay_minutes) <= now()
            RETURNING *
            """
        )
        for f in cur.fetchall():
            counters.updated += 1
            extra = (f" com {f['delay_minutes']} min de atraso" if f["delay_minutes"] >= 5 else " no horário")
            emit(f, "departure", f"{f['flight_number']} {f['origin_code']}→{f['destination_code']} decolou{extra}")

        # 3) pousos (partida efetiva + tempo de bloco)
        cur.execute(
            """
            UPDATE flights SET status='completed', actual_arrival=now(), updated_at=now()
            WHERE status='departed'
              AND COALESCE(actual_departure, scheduled_departure) + make_interval(mins => block_minutes + 6) <= now()
            RETURNING *
            """
        )
        for f in cur.fetchall():
            counters.updated += 1
            extra = (f"com {f['delay_minutes']} min de atraso" if f["delay_minutes"] >= 15 else "dentro do horário")
            emit(f, "arrival", f"{f['flight_number']} {f['origin_code']}→{f['destination_code']} concluído {extra}")

        # 4) ocorrências: atrasos e cancelamentos sobre voos programados
        cur.execute(
            """
            SELECT * FROM flights
            WHERE status='scheduled'
              AND scheduled_departure BETWEEN now() AND now() + interval '10 hours'
            ORDER BY random() LIMIT 6
            """
        )
        for f in cur.fetchall()[:3]:
            profile = CANCEL_PROFILE.get(f["airline_code"], 2.0)
            roll = random.random()
            route = f"{f['flight_number']} {f['origin_code']}→{f['destination_code']}"
            if roll < profile * 2 / 100:
                reason = sample_reason()
                cur.execute(
                    "UPDATE flights SET status='cancelled', cancellation_reason=%s, updated_at=now() WHERE id=%s",
                    (reason, f["id"]),
                )
                counters.cancelled += 1
                emit(f, "cancellation", f"{route} cancelado — {reason}")
            elif roll < 0.30 and f["delay_minutes"] < 120:
                new_delay = min(150, f["delay_minutes"] + random.randint(10, 50))
                cur.execute(
                    "UPDATE flights SET delay_minutes=%s, updated_at=now() WHERE id=%s",
                    (new_delay, f["id"]),
                )
                counters.updated += 1
                emit(f, "delay", f"{route} reprogramado com atraso de {new_delay} min")

        # 5) garante malha futura (pipeline contínua)
        cur.execute(
            "SELECT COUNT(*) AS n FROM flights WHERE status IN ('scheduled','boarding') "
            "AND scheduled_departure >= now() + interval '2 hours'"
        )
        if cur.fetchone()["n"] < 30:
            rows = extract_window(now_utc() + timedelta(hours=2), 6)
            counters.inserted += insert_flights(cur, rows)
            log.info("malha futura reforçada: +%d voos", len(rows))

        if counters.events:
            psycopg2.extras.execute_batch(cur, INSERT_EVENT, counters.events, page_size=100)
        record_run(cur, "tick", counters, int((time.monotonic() - started) * 1000))
    conn.commit()
    log.info(
        "tick ok: %d atualizados, %d cancelados, +%d voos, %d eventos",
        counters.updated, counters.cancelled, counters.inserted, len(counters.events),
    )


# =================================================================
# ADS-B — ingestão de tráfego REAL (OpenSky Network)
# =================================================================
def get_opensky_token() -> str | None:
    """OAuth2 client credentials (opcional). Sem credenciais: acesso anônimo."""
    client_id = os.environ.get("OPENSKY_CLIENT_ID")
    client_secret = os.environ.get("OPENSKY_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    if _opensky_token["token"] and _opensky_token["expires_at"] > time.time() + 60:
        return _opensky_token["token"]
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode()
    req = urllib.request.Request(
        OPENSKY_TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    _opensky_token["token"] = payload["access_token"]
    _opensky_token["expires_at"] = time.time() + payload.get("expires_in", 1800)
    log.info("opensky: token OAuth2 renovado")
    return _opensky_token["token"]


def fetch_adsb_states() -> list[dict]:
    """Vetores de estado reais de aeronaves sobre o Brasil (OpenSky)."""
    qs = urllib.parse.urlencode(
        {"lamin": BBOX_BR[0], "lomin": BBOX_BR[1], "lamax": BBOX_BR[2], "lomax": BBOX_BR[3]}
    )
    headers = {"User-Agent": "aerofly-pipeline/1.0"}
    token = get_opensky_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{OPENSKY_STATES_URL}?{qs}", headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    rows = []
    for s in payload.get("states") or []:
        lon, lat = s[5], s[6]
        if lat is None or lon is None:
            continue
        callsign = s[1].strip() if isinstance(s[1], str) and s[1].strip() else None
        airline = ICAO_TO_IATA.get(callsign[:3]) if callsign else None
        speed = s[9] if isinstance(s[9], (int, float)) else None
        rows.append(
            {
                "icao24": s[0],
                "callsign": callsign,
                "airline_code": airline,
                "origin_country": s[2],
                "lat": lat,
                "lon": lon,
                "baro_altitude": s[7],
                "speed_kmh": round(speed * 3.6, 1) if speed is not None else None,
                "track": s[10],
                "vertical_rate": s[11],
                "on_ground": bool(s[8]),
            }
        )
    return rows


def run_adsb(conn) -> None:
    """Snapshot de tráfego real -> tabela live_traffic."""
    started = time.monotonic()
    rows = fetch_adsb_states()
    counters = Counters(inserted=len(rows))
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO live_traffic (
                icao24, callsign, airline_code, origin_country, lat, lon,
                baro_altitude, speed_kmh, track, vertical_rate, on_ground
            ) VALUES (
                %(icao24)s, %(callsign)s, %(airline_code)s, %(origin_country)s, %(lat)s, %(lon)s,
                %(baro_altitude)s, %(speed_kmh)s, %(track)s, %(vertical_rate)s, %(on_ground)s
            )
            """,
            rows,
            page_size=250,
        )
        record_run(cur, "adsb", counters, int((time.monotonic() - started) * 1000))
    conn.commit()
    br = sum(1 for r in rows if r["airline_code"])
    log.info("adsb ok: %d aeronaves reais (%d de companhias monitoradas)", len(rows), br)


def main() -> None:
    parser = argparse.ArgumentParser(description="AeroFly — pipeline de dados operacionais")
    parser.add_argument("--mode", choices=["seed", "tick", "adsb", "daemon"], default="tick")
    parser.add_argument("--ticks", type=int, default=1, help="nº de ciclos no modo tick")
    parser.add_argument("--interval", type=float, default=30.0, help="segundos entre ciclos")
    parser.add_argument(
        "--adsb",
        action="store_true",
        help="no modo daemon, também ingere tráfego real (OpenSky) a cada ciclo",
    )
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("defina a variável de ambiente DATABASE_URL")
        sys.exit(1)

    conn = psycopg2.connect(dsn)
    try:
        if args.mode == "seed":
            run_seed(conn)
        elif args.mode == "adsb":
            run_adsb(conn)
        elif args.mode == "tick":
            for i in range(args.ticks):
                run_tick(conn)
                if i < args.ticks - 1:
                    time.sleep(args.interval)
        else:  # daemon
            log.info(
                "modo daemon iniciado (intervalo %.0fs%s) — Ctrl+C para sair",
                args.interval,
                " + ADS-B" if args.adsb else "",
            )
            while True:
                try:
                    run_tick(conn)
                except Exception as exc:  # noqa: BLE001 — pipeline resiliente
                    conn.rollback()
                    log.exception("falha no tick: %s", exc)
                if args.adsb:
                    try:
                        run_adsb(conn)
                    except Exception as exc:  # noqa: BLE001
                        conn.rollback()
                        log.exception("falha na ingestão ADS-B: %s", exc)
                time.sleep(args.interval)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
