"use client";

import { useEffect, useMemo, useRef } from "react";
import { BRAZIL_PATH, GEO, projectX, projectY } from "@/lib/brazilGeo";
import { AIRLINES, AIRPORTS, ROUTES } from "@/lib/aviation";
import type { AirportActivity, MapFlight } from "@/lib/types";

const HUBS = new Set([
  "GRU",
  "CGH",
  "BSB",
  "CNF",
  "SDU",
  "GIG",
  "SSA",
  "REC",
  "FOR",
  "POA",
  "MAO",
  "BEL",
]);

interface Pt {
  x: number;
  y: number;
}

function quad(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

function quadAngle(p0: Pt, c: Pt, p1: Pt, t: number): number {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function arcControl(p0: Pt, p1: Pt): Pt {
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy) || 1;
  const k = dist * 0.2;
  return { x: mx + (-dy / dist) * k, y: my + (dx / dist) * k };
}

const airportPt = (code: string): Pt | null => {
  const a = AIRPORTS.find((ap) => ap.code === code);
  return a ? { x: projectX(a.lon), y: projectY(a.lat) } : null;
};

export default function BrazilMap({
  flights,
  activity,
}: {
  flights: MapFlight[];
  activity: AirportActivity[];
}) {
  const planeRefs = useRef(new Map<number, SVGGElement>());
  const arcsRef = useRef<
    { id: number; p0: Pt; c: Pt; p1: Pt; progress: number; speed: number }[]
  >([]);
  const rafRef = useRef<number | null>(null);

  const arcs = useMemo(
    () =>
      flights
        .map((f) => {
          const p0 = airportPt(f.originCode);
          const p1 = airportPt(f.destinationCode);
          if (!p0 || !p1 || (p0.x === p1.x && p0.y === p1.y)) return null;
          const c = arcControl(p0, p1);
          return {
            id: f.id,
            flightNumber: f.flightNumber,
            color: f.airlineColor,
            p0,
            p1,
            c,
            progress: f.progress,
            // velocidade visual acelerada (~90x) para percepcao do fluxo
            speed: 90 / (f.blockMinutes * 60),
            d: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null),
    [flights],
  );

  // anima os avioes por frame (imperativo, sem re-render)
  useEffect(() => {
    arcsRef.current = arcs.map(({ id, p0, c, p1, progress, speed }) => ({
      id,
      p0,
      c,
      p1,
      progress,
      speed,
    }));
  }, [arcs]);

  useEffect(() => {
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      for (const a of arcsRef.current) {
        const el = planeRefs.current.get(a.id);
        if (!el) continue;
        a.progress = a.progress + dt * a.speed;
        const tt = a.progress > 1 ? a.progress % 1 : a.progress;
        const pos = quad(a.p0, a.c, a.p1, tt);
        const ang = quadAngle(a.p0, a.c, a.p1, tt);
        el.setAttribute(
          "transform",
          `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)}) rotate(${ang.toFixed(1)})`,
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const actMap = useMemo(
    () => new Map(activity.map((a) => [a.code, a])),
    [activity],
  );

  const mesh = useMemo(
    () =>
      ROUTES.map((r, i) => {
        const p0 = airportPt(r.origin);
        const p1 = airportPt(r.destination);
        if (!p0 || !p1) return null;
        return (
          <line
            key={i}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke="rgba(125,211,252,0.06)"
            strokeWidth={0.8}
          />
        );
      }),
    [],
  );

  const graticule = useMemo(() => {
    const lines = [];
    for (let lon = -70; lon <= -40; lon += 10) {
      lines.push(
        <line
          key={`lon${lon}`}
          x1={projectX(lon)}
          y1={0}
          x2={projectX(lon)}
          y2={GEO.HEIGHT}
          stroke="rgba(148,163,184,0.05)"
          strokeWidth={1}
        />,
      );
    }
    for (let lat = -30; lat <= 0; lat += 10) {
      lines.push(
        <line
          key={`lat${lat}`}
          x1={0}
          y1={projectY(lat)}
          x2={GEO.WIDTH}
          y2={projectY(lat)}
          stroke="rgba(148,163,184,0.05)"
          strokeWidth={1}
        />,
      );
    }
    return lines;
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="pointer-events-none absolute left-0 top-1 z-10 flex flex-col gap-1.5">
        {AIRLINES.map((a) => (
          <span
            key={a.code}
            className="flex items-center gap-1.5 rounded-md bg-[#04070e]/70 px-2 py-1 text-[10px] font-semibold text-slate-400 backdrop-blur"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: a.color, boxShadow: `0 0 8px ${a.color}` }}
            />
            {a.name.replace(" Linhas Aéreas", "").replace(" Airlines Brasil", "")}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-1 left-0 z-10 rounded-md bg-[#04070e]/70 px-2.5 py-1.5 font-mono text-[10px] text-cyan-200/90 backdrop-blur">
        <span className="anim-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 align-middle" />
        {flights.length} aeronaves em voo agora
      </div>

      <svg
        viewBox={`0 0 ${GEO.WIDTH} ${GEO.HEIGHT}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="mapGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="mapFill" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="rgba(34,211,238,0.10)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
          </radialGradient>
        </defs>

        {graticule}

        <path
          d={BRAZIL_PATH}
          fill="none"
          stroke="rgba(34,211,238,0.18)"
          strokeWidth={6}
          filter="url(#mapGlow)"
        />
        <path
          d={BRAZIL_PATH}
          fill="url(#mapFill)"
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={1.1}
        />

        {mesh}

        {/* aeroportos */}
        {AIRPORTS.map((a) => {
          const p = airportPt(a.code)!;
          const act = actMap.get(a.code);
          const active = act?.active ?? 0;
          const cancelled = act?.cancelledToday ?? 0;
          return (
            <g key={a.code}>
              {active > 0 && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={7}
                  fill="none"
                  stroke="rgba(34,211,238,0.55)"
                  strokeWidth={1.4}
                  className="map-ping"
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={active > 0 ? 3.4 : 2.4}
                fill={active > 0 ? "#22d3ee" : "#64748b"}
                stroke="#04070e"
                strokeWidth={1}
              >
                <title>{`${a.code} · ${a.city} — ${active} voo(s) ativo(s)`}</title>
              </circle>
              {cancelled > 0 && (
                <circle
                  cx={p.x + 6}
                  cy={p.y - 6}
                  r={2.2}
                  fill="#fb7185"
                  stroke="#04070e"
                  strokeWidth={0.8}
                >
                  <title>{`${cancelled} cancelamento(s) hoje em ${a.code}`}</title>
                </circle>
              )}
              {HUBS.has(a.code) && (
                <text
                  x={p.x + 6}
                  y={p.y + 3.5}
                  fontSize={11}
                  fill="#8fa3bd"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={600}
                >
                  {a.code}
                </text>
              )}
            </g>
          );
        })}

        {/* rotas ativas */}
        {arcs.map((a) => (
          <g key={a.id}>
            <path
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeOpacity={0.32}
              strokeWidth={1.2}
            />
            <path
              d={a.d}
              fill="none"
              stroke={a.color}
              strokeWidth={1.6}
              strokeDasharray="1.5 12.5"
              strokeLinecap="round"
              className="anim-dash"
              style={{ filter: `drop-shadow(0 0 4px ${a.color})` }}
            />
          </g>
        ))}

        {/* avioes */}
        {arcs.map((a) => (
          <g
            key={`plane-${a.id}`}
            ref={(el) => {
              if (el) planeRefs.current.set(a.id, el);
              else planeRefs.current.delete(a.id);
            }}
          >
            <path
              d="M6.5 0 L-5 4.2 L-2.4 0 L-5 -4.2 Z"
              fill={a.color}
              style={{ filter: `drop-shadow(0 0 5px ${a.color})` }}
            >
              <title>{a.flightNumber}</title>
            </path>
          </g>
        ))}
      </svg>

      {flights.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs text-slate-500">
          Nenhuma aeronave em voo neste momento — a operação retoma com o
          início da malha.
        </div>
      )}
    </div>
  );
}
