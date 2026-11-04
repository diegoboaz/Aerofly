"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRAZIL_PATH, GEO, projectX, projectY } from "@/lib/brazilGeo";
import { AIRLINES, AIRPORTS, getAirline } from "@/lib/aviation";
import type { AirportActivityReal, LiveAircraft, Trail } from "@/lib/types";

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
  "SLZ",
]);

const MAX_REAL_RENDER = 700;

interface RealNode {
  hex: string;
  lat: number;
  lon: number;
  track: number;
  speedMs: number;
  onGround: boolean;
}

const airportPt = (code: string) => {
  const a = AIRPORTS.find((ap) => ap.code === code);
  return a ? { x: projectX(a.lon), y: projectY(a.lat) } : null;
};

/** curva suave (quadratica) entre dois pontos para desenhar a rota */
function arcPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
): string {
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy) || 1;
  const k = dist * 0.16;
  const cx = mx + (-dy / dist) * k;
  const cy = my + (dx / dist) * k;
  return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
}

export default function BrazilMap({
  real,
  realSource = "OpenSky",
  trackedCount,
  airportActivity = [],
  trails = [],
}: {
  real: LiveAircraft[];
  realSource?: string;
  trackedCount?: number;
  airportActivity?: AirportActivityReal[];
  trails?: Trail[];
}) {
  const realRefs = useRef(new Map<string, SVGGElement>());
  const fleetRef = useRef<RealNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showTrails, setShowTrails] = useState(true);

  const realFleet = useMemo(() => real.slice(0, MAX_REAL_RENDER), [real]);

  const selectedAc = useMemo(
    () => realFleet.find((a) => a.hex === selected) ?? null,
    [realFleet, selected],
  );

  useEffect(() => {
    fleetRef.current = realFleet.map((a) => ({
      hex: a.hex,
      lat: a.lat,
      lon: a.lon,
      track: a.track ?? 0,
      speedMs: (a.speedKmh ?? 0) / 3.6,
      onGround: a.onGround,
    }));
  }, [realFleet]);

  // anima a frota real por frame (interpola pela velocidade/proa entre polls)
  useEffect(() => {
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      for (const ac of fleetRef.current) {
        const el = realRefs.current.get(ac.hex);
        if (!el) continue;
        if (!ac.onGround && ac.speedMs > 5) {
          const rad = (ac.track * Math.PI) / 180;
          ac.lat += (ac.speedMs * Math.cos(rad) * dt) / 111320;
          ac.lon +=
            (ac.speedMs * Math.sin(rad) * dt) /
            (111320 * Math.max(0.2, Math.cos((ac.lat * Math.PI) / 180)));
        }
        el.setAttribute(
          "transform",
          `translate(${projectX(ac.lon).toFixed(2)} ${projectY(ac.lat).toFixed(2)}) rotate(${ac.track.toFixed(0)})`,
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // rastros reais percorridos (polilinhas)
  const trailPaths = useMemo(
    () =>
      trails.map((t) => ({
        hex: t.hex,
        color: t.airline ? getAirline(t.airline).color : "#64748b",
        d: t.points
          .map(
            ([lat, lon], i) =>
              `${i === 0 ? "M" : "L"}${projectX(lon).toFixed(1)} ${projectY(lat).toFixed(1)}`,
          )
          .join(" "),
      })),
    [trails],
  );

  const selectedTrail = useMemo(
    () => (selected ? trailPaths.find((t) => t.hex === selected) : null),
    [trailPaths, selected],
  );

  // rota do voo selecionado (origem/destino reais ou destino estimado)
  const selectedRoute = useMemo(() => {
    if (!selectedAc) return null;
    const destCode = selectedAc.destIata ?? selectedAc.destEstimate ?? null;
    const origCode = selectedAc.origIata ?? null;
    const acPt = {
      x: projectX(selectedAc.lon),
      y: projectY(selectedAc.lat),
    };
    const origPt = origCode ? airportPt(origCode) : null;
    const destPt = destCode ? airportPt(destCode) : null;
    return {
      origCode,
      destCode,
      estimated: !selectedAc.destIata && Boolean(selectedAc.destEstimate),
      flownPath: origPt ? arcPath(origPt, acPt) : null,
      aheadPath: destPt ? arcPath(acPt, destPt) : null,
    };
  }, [selectedAc]);

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

  const airborneReal = useMemo(
    () => realFleet.filter((a) => !a.onGround).length,
    [realFleet],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {/* legenda */}
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
        <span className="flex items-center gap-1.5 rounded-md bg-[#04070e]/70 px-2 py-1 text-[10px] font-semibold text-slate-400 backdrop-blur">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#fbbf24", boxShadow: "0 0 8px #fbbf24" }}
          />
          Outras aeronaves · {realSource}
        </span>
      </div>

      {/* controles */}
      <div className="absolute right-0 top-1 z-10 flex flex-col items-end gap-1.5">
        <button
          onClick={() => setShowTrails((v) => !v)}
          className={`chip cursor-pointer font-mono text-[10px] transition-all ${
            showTrails
              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
              : "border-white/[0.08] bg-[#04070e]/70 text-slate-500"
          }`}
          title="Rastros reais percorridos (histórico ADS-B)"
        >
          rastros {trails.length > 0 ? `· ${trails.length}` : ""}
        </button>
        {selectedAc && (
          <button
            onClick={() => setSelected(null)}
            className="chip cursor-pointer border-white/[0.08] bg-[#04070e]/70 font-mono text-[10px] text-slate-400"
          >
            limpar seleção
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-1 left-0 z-10 flex flex-col gap-1">
        <span className="rounded-md bg-[#04070e]/70 px-2.5 py-1.5 font-mono text-[10px] text-amber-200/90 backdrop-blur">
          <span className="anim-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" />
          {airborneReal} aeronaves reais em voo
          {trackedCount !== undefined && trackedCount > airborneReal
            ? ` · ${trackedCount} rastreadas`
            : ""}
        </span>
        {!selectedAc && (
          <span className="rounded-md bg-[#04070e]/70 px-2.5 py-1.5 font-mono text-[10px] text-slate-500 backdrop-blur">
            clique em uma aeronave para ver a rota
          </span>
        )}
      </div>

      {/* card do voo selecionado */}
      {selectedAc && selectedRoute && (
        <div className="absolute bottom-1 right-0 z-10 w-[232px] rounded-xl border border-white/[0.09] bg-[#070c17]/95 p-3 backdrop-blur">
          <p
            className="font-mono text-sm font-bold"
            style={{
              color: selectedAc.airline
                ? getAirline(selectedAc.airline).color
                : "#fbbf24",
            }}
          >
            {selectedAc.callsign ?? selectedAc.hex.toUpperCase()}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {selectedAc.airline
              ? getAirline(selectedAc.airline).name
              : selectedAc.country}
          </p>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-200">
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5">
              {selectedRoute.origCode ?? "•••"}
            </span>
            <span className="text-cyan-400">→</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5">
              {selectedRoute.destCode ?? "•••"}
            </span>
          </div>
          {selectedRoute.estimated && (
            <p className="mt-1 text-[9.5px] leading-snug text-amber-300/80">
              destino estimado pela trajetória (sem rota na fonte)
            </p>
          )}
          {!selectedRoute.destCode && (
            <p className="mt-1 text-[9.5px] leading-snug text-slate-600">
              rota não publicada pela fonte — use FR24_API_TOKEN para rotas
              oficiais
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-400">
            <span>
              {selectedAc.altM
                ? `FL${Math.round((selectedAc.altM * 3.28084) / 100)}`
                : "—"}
            </span>
            <span>{selectedAc.speedKmh ? `${selectedAc.speedKmh} km/h` : "—"}</span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${GEO.WIDTH} ${GEO.HEIGHT}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        onClick={() => setSelected(null)}
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

        {/* rastros reais percorridos */}
        {showTrails &&
          trailPaths.map((t) => (
            <path
              key={`trail-${t.hex}`}
              d={t.d}
              fill="none"
              stroke={t.color}
              strokeWidth={selected === t.hex ? 2 : 1}
              strokeOpacity={selected ? (selected === t.hex ? 0.95 : 0.12) : 0.42}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* rota do voo selecionado */}
        {selectedRoute?.flownPath && (
          <path
            d={selectedRoute.flownPath}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={1.6}
            strokeOpacity={0.7}
          />
        )}
        {selectedRoute?.aheadPath && (
          <path
            d={selectedRoute.aheadPath}
            fill="none"
            stroke={selectedRoute.estimated ? "#fbbf24" : "#22d3ee"}
            strokeWidth={1.8}
            strokeDasharray="6 6"
            strokeLinecap="round"
            className="anim-dash"
            style={{
              filter: `drop-shadow(0 0 5px ${selectedRoute.estimated ? "#fbbf24" : "#22d3ee"})`,
            }}
          />
        )}
        {selectedTrail && (
          <path
            d={selectedTrail.d}
            fill="none"
            stroke={selectedTrail.color}
            strokeWidth={2.4}
            strokeOpacity={0.95}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 4px ${selectedTrail.color})` }}
          />
        )}

        {/* aeroportos + atividade real */}
        {AIRPORTS.map((a) => {
          const p = { x: projectX(a.lon), y: projectY(a.lat) };
          const act = airportActivity.find((x) => x.code === a.code);
          const busy = (act?.approach ?? 0) + (act?.ground ?? 0);
          const isRouteEnd =
            selectedRoute?.origCode === a.code ||
            selectedRoute?.destCode === a.code;
          return (
            <g key={a.code}>
              {busy >= 4 && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={7}
                  fill="none"
                  stroke="rgba(251,191,36,0.55)"
                  strokeWidth={1.4}
                  className="map-ping"
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isRouteEnd ? 4.6 : busy > 0 ? 3.2 : 2.4}
                fill={
                  isRouteEnd
                    ? "#22d3ee"
                    : busy >= 4
                      ? "#fbbf24"
                      : busy > 0
                        ? "#22d3ee"
                        : "#64748b"
                }
                stroke="#04070e"
                strokeWidth={1}
              >
                <title>{`${a.code} · ${a.city}${
                  act
                    ? ` — ${act.approach} em aproximação · ${act.ground} em solo`
                    : ""
                }`}</title>
              </circle>
              {(HUBS.has(a.code) || isRouteEnd) && (
                <text
                  x={p.x + 6}
                  y={p.y + 3.5}
                  fontSize={11}
                  fill={isRouteEnd ? "#e2f6ff" : "#8fa3bd"}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={600}
                >
                  {a.code}
                </text>
              )}
              {busy > 0 && (
                <text
                  x={p.x + 6}
                  y={p.y + 14}
                  fontSize={9}
                  fill="#fbbf24"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={700}
                >
                  {`${act!.approach > 0 ? `↓${act!.approach}` : ""}${
                    act!.ground > 0 ? ` ■${act!.ground}` : ""
                  }`}
                </text>
              )}
            </g>
          );
        })}

        {/* trafego REAL (ADS-B) */}
        {realFleet.map((a) => {
          const color = a.airline
            ? getAirline(a.airline).color
            : a.onGround
              ? "#64748b"
              : "#fbbf24";
          const fl = a.altM ? Math.round((a.altM * 3.28084) / 100) : null;
          const route =
            a.origIata && a.destIata
              ? `${a.origIata}→${a.destIata}`
              : a.destEstimate
                ? `→ ${a.destEstimate} (est.)`
                : null;
          const label = [
            a.callsign ?? a.hex.toUpperCase(),
            a.airline ? getAirline(a.airline).name : a.country,
            route,
            fl ? `FL${fl}` : null,
            a.speedKmh ? `${a.speedKmh} km/h` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const isSel = selected === a.hex;
          return (
            <g
              key={`real-${a.hex}`}
              ref={(el) => {
                if (el) realRefs.current.set(a.hex, el);
                else realRefs.current.delete(a.hex);
              }}
              opacity={selected && !isSel ? 0.3 : a.onGround ? 0.45 : 0.85}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(isSel ? null : a.hex);
              }}
              style={{ cursor: "pointer" }}
            >
              {isSel && (
                <circle r={9} fill="none" stroke={color} strokeWidth={1.2} opacity={0.9} />
              )}
              <path
                d={isSel ? "M7 0 L-5 4.4 L-2 0 L-5 -4.4 Z" : "M5.5 0 L-4 3.4 L-1.6 0 L-4 -3.4 Z"}
                fill={color}
                stroke="rgba(4,7,14,0.8)"
                strokeWidth={0.4}
                style={isSel ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}
              >
                <title>{label}</title>
              </path>
            </g>
          );
        })}
      </svg>

      {real.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs text-slate-500">
          Sincronizando tráfego real (ADS-B)…
        </div>
      )}
    </div>
  );
}
