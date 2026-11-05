#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 AeroFly — Pipeline de dados REAIS (ADS-B) → PostgreSQL
================================================================
 Ingestão contínua de tráfego aéreo real sobre o Brasil:

   EXTRACT   -> posições ao vivo (FlightRadar24 se FR24_API_TOKEN
                estiver definida; fallback automático: OpenSky)
   TRANSFORM -> normalização (unidades, fase, cia por callsign),
                deduplicação e derivação de EVENTOS reais
                (aeronave detectada / decolagem / pouso)
   LOAD      -> snapshots em live_traffic + eventos em
                flight_events + telemetria em pipeline_runs

 Uso:
   python python/pipeline.py --mode adsb                    # 1 snapshot real
   python python/pipeline.py --mode daemon --interval 45    # contínuo

 Conexão: variável de ambiente DATABASE_URL
 Fontes:  FR24_API_TOKEN (opcional) / OPENSKY_CLIENT_ID+SECRET (opcional)
================================================================
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aerofly.pipeline")

# ----------------------------------------------------------------
# Fontes de dados reais
# ----------------------------------------------------------------
OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all"
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/"
    "protocol/openid-connect/token"
)
BBOX_BR = (-34.5, -74.0, 6.0, -33.0)  # lamin, lomin, lamax, lomax

FR24_BASE = os.environ.get("FR24_BASE_URL", "https://fr24api.flightradar24.com/api").rstrip("/")
FR24_MODE = "light" if os.environ.get("FR24_POSITIONS_MODE") == "light" else "full"
FR24_BOUNDS_BR = "6,-34.5,-74,-33"  # norte, sul, oeste, leste

# Prefixo ICAO do callsign -> código IATA das companhias monitoradas
ICAO_TO_IATA = {"TAM": "LA", "LAN": "LA", "GLO": "G3", "AZU": "AD", "PTB": "2Z"}

_opensky_token: dict = {"token": None, "expires_at": 0.0}
_prev_snapshot: dict = {}  # icao24 -> on_ground (para derivar eventos)
_baseline_done = False


# =================================================================
# EXTRACT
# =================================================================
def get_opensky_token() -> str | None:
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


def fetch_opensky_states() -> list[dict]:
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
                "orig_iata": None,
                "dest_iata": None,
                "source": "opensky",
            }
        )
    return rows


def fetch_fr24_states() -> list[dict]:
    token = os.environ.get("FR24_API_TOKEN")
    if not token:
        raise RuntimeError("FR24_API_TOKEN não configurada")
    req = urllib.request.Request(
        f"{FR24_BASE}/live/flight-positions/{FR24_MODE}?bounds={FR24_BOUNDS_BR}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept-Version": "v1",
            "Accept": "application/json",
            "User-Agent": "aerofly-pipeline/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    rows = []
    for p in payload.get("data") or []:
        lat, lon = p.get("lat"), p.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        callsign = (p.get("callsign") or "").strip() or None
        airline = ICAO_TO_IATA.get(callsign[:3]) if callsign else None
        gspeed = p.get("gspeed")  # nós
        vspeed = p.get("vspeed")  # pés/min
        alt = p.get("alt")  # pés
        reg = p.get("reg") or None
        rows.append(
            {
                "icao24": str(p.get("fr24_id") or p.get("hex") or callsign or ""),
                "callsign": callsign,
                "airline_code": airline,
                "origin_country": "Brasil"
                if reg and reg[:2] in ("PP", "PR", "PS", "PT", "PU")
                else "FR24",
                "lat": lat,
                "lon": lon,
                "baro_altitude": round(alt * 0.3048) if isinstance(alt, (int, float)) else None,
                "speed_kmh": round(gspeed * 1.852, 1) if isinstance(gspeed, (int, float)) else None,
                "track": p.get("track"),
                "vertical_rate": round(vspeed * 0.00508, 2)
                if isinstance(vspeed, (int, float))
                else None,
                "on_ground": alt == 0,
                "orig_iata": p.get("orig_iata"),
                "dest_iata": p.get("dest_iata"),
                "source": "flightradar24",
            }
        )
    return rows


def fetch_real_states() -> tuple[list[dict], str]:
    """Cadeia de provedores: FR24 (se configurado) -> OpenSky."""
    if os.environ.get("FR24_API_TOKEN"):
        try:
            rows = fetch_fr24_states()
            return rows, "flightradar24"
        except Exception as exc:  # noqa: BLE001 — fallback resiliente
            log.warning("flightradar24 falhou (%s) — usando OpenSky", exc)
    return fetch_opensky_states(), "opensky"


# =================================================================
# TRANSFORM — eventos reais derivados das transições do ADS-B
# =================================================================
def derive_events(rows: list[dict]) -> list[tuple]:
    """Compara o snapshot atual com o anterior e gera eventos reais."""
    global _baseline_done
    current = {r["icao24"]: r["on_ground"] for r in rows}
    events = []

    for r in rows:
        cs = r["callsign"] or r["icao24"].upper()
        airline = r["airline_code"] or (r["callsign"][:3] if r["callsign"] else "ADS-B")
        prev = _prev_snapshot.get(r["icao24"])
        fl = f"FL{round(r['baro_altitude'] * 3.28084 / 100)}" if r["baro_altitude"] else None
        base = (r["icao24"], cs, airline, r["orig_iata"] or "BR", r["dest_iata"] or "BR")
        extra = f" · {fl}" if fl else ""
        extra += f" · {r['speed_kmh']:.0f} km/h" if r["speed_kmh"] else ""

        if not _baseline_done:
            # primeira coleta: registra apenas companhias monitoradas em voo
            if r["airline_code"] and not r["on_ground"] and (r["baro_altitude"] or 0) > 2000:
                events.append((*base, "created", f"{cs} detectado sobre o Brasil{extra}"))
        elif prev is None and not r["on_ground"] and (r["baro_altitude"] or 0) > 600:
            events.append((*base, "created", f"{cs} detectado sobre o espaço aéreo brasileiro{extra}"))
        elif prev is False and r["on_ground"]:
            events.append((*base, "arrival", f"Pouso detectado · {cs} agora em solo"))
        elif prev is True and not r["on_ground"]:
            events.append((*base, "departure", f"Decolagem detectada · {cs} em subida{extra}"))

    _prev_snapshot.clear()
    _prev_snapshot.update(current)
    _baseline_done = True

    # pousos/decolagens primeiro; limita volume por ciclo
    events.sort(key=lambda e: 1 if e[5] == "created" else 0)
    return events[:30]


# =================================================================
# LOAD
# =================================================================
def run_adsb(conn) -> None:
    started = time.monotonic()
    rows, source = fetch_real_states()
    if not rows:
        log.warning("nenhuma aeronave retornada pela fonte %s", source)
        return

    events = derive_events(rows)
    monitored = sum(1 for r in rows if r["airline_code"])

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO live_traffic (
                icao24, callsign, airline_code, origin_country, lat, lon,
                baro_altitude, speed_kmh, track, vertical_rate, on_ground,
                source, orig_iata, dest_iata
            ) VALUES (
                %(icao24)s, %(callsign)s, %(airline_code)s, %(origin_country)s, %(lat)s, %(lon)s,
                %(baro_altitude)s, %(speed_kmh)s, %(track)s, %(vertical_rate)s, %(on_ground)s,
                %(source)s, %(orig_iata)s, %(dest_iata)s
            )
            """,
            rows,
            page_size=250,
        )
        if events:
            psycopg2.extras.execute_batch(
                cur,
                """
                INSERT INTO flight_events (
                    flight_id, flight_number, airline_code, origin_code,
                    destination_code, type, message
                ) VALUES (NULL, %s, %s, %s, %s, %s, %s)
                """,
                [e[1:] for e in events],
                page_size=100,
            )
        cur.execute(
            "INSERT INTO pipeline_runs (source, mode, inserted, updated, cancelled, events, duration_ms) "
            "VALUES ('python', %s, %s, 0, 0, %s, %s)",
            (f"adsb-{source}", len(rows), len(events), int((time.monotonic() - started) * 1000)),
        )
    conn.commit()
    log.info(
        "adsb ok [%s]: %d posições reais (%d monitoradas), %d eventos reais",
        source,
        len(rows),
        monitored,
        len(events),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AeroFly — pipeline de dados REAIS (ADS-B) sobre o Brasil"
    )
    parser.add_argument("--mode", choices=["adsb", "daemon"], default="adsb")
    parser.add_argument("--interval", type=float, default=45.0, help="segundos entre ciclos")
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.error("defina a variável de ambiente DATABASE_URL")
        sys.exit(1)

    conn = psycopg2.connect(dsn)
    try:
        if args.mode == "adsb":
            run_adsb(conn)
        else:
            log.info("daemon ADS-B iniciado (intervalo %.0fs) — Ctrl+C para sair", args.interval)
            while True:
                try:
                    run_adsb(conn)
                except (urllib.error.URLError, TimeoutError) as exc:
                    conn.rollback()
                    log.warning("fonte temporariamente indisponível: %s", exc)
                except Exception as exc:  # noqa: BLE001 — pipeline resiliente
                    conn.rollback()
                    log.exception("falha no ciclo: %s", exc)
                time.sleep(args.interval)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
