"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Layers,
  LocateFixed,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { BRAZIL_PATH, GEO, projectX, projectY } from "@/lib/brazilGeo";
import { AIRLINES, AIRPORTS, getAirline } from "@/lib/aviation";
import type {
  AirportActivityReal,
  AirportWeather,
  LiveAircraft,
  Trail,
} from "@/lib/types";

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

const WX_COLOR: Record<string, string> = {
  severe: "#fb7185",
  warning: "#fbbf24",
  watch: "#7dd3fc",
  ok: "#34d399",
};

const MIN_SCALE = 0.6;
const MAX_SCALE = 14;
const HIT_RADIUS = 11;

interface Node {
  hex: string;
  lat: number;
  lon: number;
  track: number;
  speedMs: number;
  onGround: boolean;
  color: string;
  dim: boolean;
  // posicao projetada em tela (atualizada a cada frame)
  sx: number;
  sy: number;
}

interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export default function BrazilMap({
  real,
  realSource = "ADS-B",
  trackedCount,
  airportActivity = [],
  trails = [],
  weather = [],
}: {
  real: LiveAircraft[];
  realSource?: string;
  trackedCount?: number;
  airportActivity?: AirportActivityReal[];
  trails?: Trail[];
  weather?: AirportWeather[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<Viewport>({ scale: 1, tx: 0, ty: 0 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const fleetRef = useRef<Node[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const fittedRef = useRef(false);
  const brazilPathRef = useRef<Path2D | null>(null);

  const [hover, setHover] = useState<string | null>(null);
  const [hoverAirport, setHoverAirport] = useState<string | null>(null);
  const hoverAirportRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [filter, setFilter] = useState<string>("all");
  const [layers, setLayers] = useState({
    trails: true,
    weather: true,
    labels: true,
    ground: true,
    density: false,
  });

  // ---------- dados derivados (projetados uma vez) ----------
  const fleet = useMemo(() => {
    return real
      .filter((a) => (layers.ground ? true : !a.onGround))
      .filter((a) => (filter === "all" ? true : a.airline === filter))
      .map<Node>((a) => ({
        hex: a.hex,
        lat: a.lat,
        lon: a.lon,
        track: a.track ?? 0,
        speedMs: (a.speedKmh ?? 0) / 3.6,
        onGround: a.onGround,
        color: a.airline
          ? getAirline(a.airline).color
          : a.onGround
            ? "#64748b"
            : "#fbbf24",
        dim: false,
        sx: 0,
        sy: 0,
      }));
  }, [real, filter, layers.ground]);

  const acByHex = useMemo(() => {
    const m = new Map<string, LiveAircraft>();
    for (const a of real) m.set(a.hex, a);
    return m;
  }, [real]);

  useEffect(() => {
    // dados novos sempre substituem a posicao interpolada do frame anterior
    fleetRef.current = fleet;
  }, [fleet]);

  // limpa selecao se a aeronave sumiu
  useEffect(() => {
    if (selected && !acByHex.has(selected)) {
      setSelected(null);
      setFollow(false);
    }
  }, [acByHex, selected]);

  const trailGeom = useMemo(
    () =>
      trails.map((t) => {
        const pts: number[] = [];
        for (const [lat, lon] of t.points) {
          pts.push(projectX(lon), projectY(lat));
        }
        return {
          hex: t.hex,
          color: t.airline ? getAirline(t.airline).color : "#64748b",
          pts,
          airline: t.airline,
        };
      }),
    [trails],
  );

  const airportGeom = useMemo(
    () =>
      AIRPORTS.map((a) => ({
        code: a.code,
        city: a.city,
        x: projectX(a.lon),
        y: projectY(a.lat),
        hub: HUBS.has(a.code),
      })),
    [],
  );

  const wxGeom = useMemo(
    () =>
      weather.map((w) => ({
        ...w,
        x: projectX(w.lon),
        y: projectY(w.lat),
      })),
    [weather],
  );

  const activityByCode = useMemo(
    () => new Map(airportActivity.map((a) => [a.code, a])),
    [airportActivity],
  );

  // ---------- viewport ----------
  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const scale = Math.min(w / GEO.WIDTH, h / GEO.HEIGHT) * 0.98;
    viewRef.current = {
      scale,
      tx: (w - GEO.WIDTH * scale) / 2,
      ty: (h - GEO.HEIGHT * scale) / 2,
    };
    setZoomLabel(1);
  }, []);

  const focusRegion = useCallback(
    (lon: number, lat: number, zoom: number) => {
      const { w, h } = sizeRef.current;
      if (!w || !h) return;
      const base = Math.min(w / GEO.WIDTH, h / GEO.HEIGHT) * 0.98;
      const scale = base * zoom;
      viewRef.current = {
        scale,
        tx: w / 2 - projectX(lon) * scale,
        ty: h / 2 - projectY(lat) * scale,
      };
      setFollow(false);
      setZoomLabel(zoom);
    },
    [],
  );

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const v = viewRef.current;
      const { w, h } = sizeRef.current;
      const px = cx ?? w / 2;
      const py = cy ?? h / 2;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.4, v.scale * factor));
      const k = next / v.scale;
      viewRef.current = {
        scale: next,
        tx: px - (px - v.tx) * k,
        ty: py - (py - v.ty) * k,
      };
      const base = Math.min(w / GEO.WIDTH, h / GEO.HEIGHT) * 0.98;
      setZoomLabel(next / base);
    },
    [],
  );

  // ---------- resize ----------
  useEffect(() => {
    const el = wrapRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      if (!fittedRef.current) {
        fit();
        fittedRef.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // ---------- loop de render ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    if (!brazilPathRef.current) brazilPathRef.current = new Path2D(BRAZIL_PATH);

    let raf = 0;
    let last = performance.now();
    let hoverHex: string | null = null;

    const render = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const { w, h, dpr } = sizeRef.current;
      const v = viewRef.current;
      if (!w || !h) {
        raf = requestAnimationFrame(render);
        return;
      }

      const sel = selected;
      const nodes = fleetRef.current;

      // --- dead-reckoning + projecao ---
      for (const n of nodes) {
        if (!n.onGround && n.speedMs > 5) {
          const rad = (n.track * Math.PI) / 180;
          n.lat += (n.speedMs * Math.cos(rad) * dt) / 111320;
          n.lon +=
            (n.speedMs * Math.sin(rad) * dt) /
            (111320 * Math.max(0.2, Math.cos((n.lat * Math.PI) / 180)));
        }
        n.sx = projectX(n.lon) * v.scale + v.tx;
        n.sy = projectY(n.lat) * v.scale + v.ty;
      }

      // --- follow ---
      if (sel && follow) {
        const n = nodes.find((x) => x.hex === sel);
        if (n) {
          v.tx += w / 2 - n.sx;
          v.ty += h / 2 - n.sy;
          for (const x of nodes) {
            x.sx = projectX(x.lon) * v.scale + v.tx;
            x.sy = projectY(x.lat) * v.scale + v.ty;
          }
        }
      }

      // --- hit testing (hover) ---
      const p = pointerRef.current;
      let nextHover: string | null = null;
      if (p && !dragRef.current) {
        let bestD = HIT_RADIUS * HIT_RADIUS;
        for (const n of nodes) {
          const dx = n.sx - p.x;
          const dy = n.sy - p.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            nextHover = n.hex;
          }
        }
      }
      if (nextHover !== hoverHex) {
        hoverHex = nextHover;
        setHover(nextHover);
      }

      // hit testing de aeroportos (somente quando nao esta sobre aeronave)
      let nextAirport: string | null = null;
      if (p && !nextHover && !dragRef.current) {
        let best = 13 * 13;
        for (const ap of airportGeom) {
          const ax = ap.x * v.scale + v.tx;
          const ay = ap.y * v.scale + v.ty;
          const dx = ax - p.x;
          const dy = ay - p.y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            nextAirport = ap.code;
          }
        }
      }
      if (nextAirport !== hoverAirportRef.current) {
        hoverAirportRef.current = nextAirport;
        setHoverAirport(nextAirport);
      }

      // --- desenho ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const sx = (x: number) => x * v.scale + v.tx;
      const sy = (y: number) => y * v.scale + v.ty;

      // graticule
      ctx.strokeStyle = "rgba(148,163,184,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -70; lon <= -40; lon += 10) {
        const x = sx(projectX(lon));
        ctx.moveTo(x, sy(0));
        ctx.lineTo(x, sy(GEO.HEIGHT));
      }
      for (let lat = -30; lat <= 0; lat += 10) {
        const y = sy(projectY(lat));
        ctx.moveTo(sx(0), y);
        ctx.lineTo(sx(GEO.WIDTH), y);
      }
      ctx.stroke();

      // contorno do Brasil
      ctx.save();
      ctx.translate(v.tx, v.ty);
      ctx.scale(v.scale, v.scale);
      const path = brazilPathRef.current!;
      ctx.fillStyle = "rgba(34,211,238,0.05)";
      ctx.fill(path);
      ctx.strokeStyle = "rgba(34,211,238,0.22)";
      ctx.lineWidth = 5 / v.scale;
      ctx.stroke(path);
      ctx.strokeStyle = "rgba(148,163,184,0.45)";
      ctx.lineWidth = 1.1 / v.scale;
      ctx.stroke(path);
      ctx.restore();

      // camada de densidade (grade de concentracao de trafego)
      if (layers.density) {
        const grid = new Map<string, { x: number; y: number; n: number }>();
        const cell = 42;
        for (const n of nodes) {
          if (n.onGround) continue;
          if (n.sx < 0 || n.sy < 0 || n.sx > w || n.sy > h) continue;
          const gx = Math.floor(n.sx / cell);
          const gy = Math.floor(n.sy / cell);
          const key = `${gx}:${gy}`;
          const g = grid.get(key) ?? {
            x: gx * cell + cell / 2,
            y: gy * cell + cell / 2,
            n: 0,
          };
          g.n++;
          grid.set(key, g);
        }
        for (const g of grid.values()) {
          const radius = 10 + Math.sqrt(g.n) * 6;
          const gradient = ctx.createRadialGradient(
            g.x,
            g.y,
            1,
            g.x,
            g.y,
            radius,
          );
          gradient.addColorStop(0, `rgba(251,113,133,${Math.min(0.45, 0.12 + g.n * 0.07)})`);
          gradient.addColorStop(0.55, "rgba(251,191,36,0.12)");
          gradient.addColorStop(1, "rgba(251,191,36,0)");
          ctx.beginPath();
          ctx.arc(g.x, g.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
          if (g.n >= 4) {
            ctx.font = "700 9px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.fillText(String(g.n), g.x, g.y + 3);
            ctx.textAlign = "start";
          }
        }
      }

      // rastros reais
      if (layers.trails) {
        for (const t of trailGeom) {
          if (filter !== "all" && t.airline !== filter) continue;
          const isSel = sel === t.hex;
          ctx.strokeStyle = t.color;
          ctx.globalAlpha = sel ? (isSel ? 0.95 : 0.1) : 0.4;
          ctx.lineWidth = isSel ? 2.4 : 1.1;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          for (let i = 0; i < t.pts.length; i += 2) {
            const x = sx(t.pts[i]);
            const y = sy(t.pts[i + 1]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // meteorologia
      if (layers.weather) {
        for (const w2 of wxGeom) {
          const x = sx(w2.x);
          const y = sy(w2.y);
          const color = WX_COLOR[w2.severity] ?? "#34d399";
          const strong = w2.severity === "severe" || w2.severity === "warning";
          if (strong) {
            const r = (w2.severity === "severe" ? 26 : 19) * Math.min(2.2, Math.max(0.7, v.scale));
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = w2.severity === "severe" ? 0.13 : 0.08;
            ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          if (w2.precipMm > 0) {
            ctx.beginPath();
            ctx.arc(x, y, Math.min(16, 7 + w2.precipMm * 2) * Math.min(2, Math.max(0.7, v.scale)), 0, Math.PI * 2);
            ctx.fillStyle = "rgba(56,189,248,0.12)";
            ctx.fill();
          }
          if (w2.gustKmh >= 20) {
            const windTo = (w2.windDir + 180) % 360;
            const len = Math.min(26, 8 + w2.gustKmh * 0.3);
            const rad = ((windTo - 90) * Math.PI) / 180;
            const x2 = x + Math.cos(rad) * len;
            const y2 = y + Math.sin(rad) * len;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = w2.gustKmh >= 45 ? 1.8 : 1.1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x2, y2, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (w2.storm) {
            ctx.font = "13px system-ui";
            ctx.fillText("⚡", x - 14, y - 8);
          }
        }
      }

      // rota do voo selecionado
      if (sel) {
        const ac = acByHex.get(sel);
        const node = nodes.find((n) => n.hex === sel);
        if (ac && node) {
          const destCode = ac.destIata ?? ac.destEstimate ?? null;
          const estimated = !ac.destIata && Boolean(ac.destEstimate);
          const drawArc = (
            ax: number,
            ay: number,
            bx: number,
            by: number,
            color: string,
            dashed: boolean,
          ) => {
            const mx = (ax + bx) / 2;
            const my = (ay + by) / 2;
            const dx = bx - ax;
            const dy = by - ay;
            const dist = Math.hypot(dx, dy) || 1;
            const k = dist * 0.16;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(mx + (-dy / dist) * k, my + (dx / dist) * k, bx, by);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = 0.85;
            if (dashed) ctx.setLineDash([7, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          };
          const orig = ac.origIata
            ? airportGeom.find((g) => g.code === ac.origIata)
            : null;
          const dest = destCode
            ? airportGeom.find((g) => g.code === destCode)
            : null;
          if (orig) drawArc(sx(orig.x), sy(orig.y), node.sx, node.sy, "#22d3ee", false);
          if (dest)
            drawArc(
              node.sx,
              node.sy,
              sx(dest.x),
              sy(dest.y),
              estimated ? "#fbbf24" : "#22d3ee",
              true,
            );
        }
      }

      // aeroportos
      const selAc = sel ? acByHex.get(sel) : null;
      const routeEnds = new Set(
        [selAc?.origIata, selAc?.destIata ?? selAc?.destEstimate].filter(
          Boolean,
        ) as string[],
      );
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";
      for (const ap of airportGeom) {
        const x = sx(ap.x);
        const y = sy(ap.y);
        if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
        const act = activityByCode.get(ap.code);
        const busy = (act?.approach ?? 0) + (act?.ground ?? 0);
        const isEnd = routeEnds.has(ap.code);
        ctx.beginPath();
        ctx.arc(x, y, isEnd ? 4.6 : busy > 0 ? 3.2 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = isEnd
          ? "#22d3ee"
          : busy >= 4
            ? "#fbbf24"
            : busy > 0
              ? "#22d3ee"
              : "#64748b";
        ctx.fill();
        ctx.strokeStyle = "#04070e";
        ctx.lineWidth = 1;
        ctx.stroke();
        if (layers.labels && (ap.hub || isEnd || v.scale > 1.9)) {
          ctx.fillStyle = isEnd ? "#e2f6ff" : "#8fa3bd";
          ctx.fillText(ap.code, x + 6, y + 1);
        }
        if (busy > 0 && layers.labels) {
          ctx.fillStyle = "#fbbf24";
          ctx.font = "700 9px 'JetBrains Mono', monospace";
          const txt = `${act!.approach > 0 ? `↓${act!.approach}` : ""}${
            act!.ground > 0 ? ` ■${act!.ground}` : ""
          }`;
          ctx.fillText(txt, x + 6, y + 12);
          ctx.font = "600 11px 'JetBrains Mono', monospace";
        }
      }

      // aeronaves
      for (const n of nodes) {
        if (n.sx < -30 || n.sy < -30 || n.sx > w + 30 || n.sy > h + 30) continue;
        const isSel = n.hex === sel;
        const isHover = n.hex === hoverHex;
        ctx.save();
        ctx.translate(n.sx, n.sy);
        ctx.rotate((n.track * Math.PI) / 180);
        ctx.globalAlpha = sel && !isSel ? 0.32 : n.onGround ? 0.5 : 0.9;
        const s = isSel || isHover ? 1.3 : 1;
        ctx.beginPath();
        ctx.moveTo(6 * s, 0);
        ctx.lineTo(-4.4 * s, 3.6 * s);
        ctx.lineTo(-1.8 * s, 0);
        ctx.lineTo(-4.4 * s, -3.6 * s);
        ctx.closePath();
        ctx.fillStyle = n.color;
        if (isSel || isHover) {
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 8;
        }
        ctx.fill();
        ctx.restore();
        if (isSel) {
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, 11, 0, Math.PI * 2);
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [
    acByHex,
    activityByCode,
    airportGeom,
    filter,
    follow,
    layers.density,
    layers.labels,
    layers.trails,
    layers.weather,
    selected,
    trailGeom,
    wxGeom,
  ]);

  // ---------- interacoes ----------
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const r = wrapRef.current!.getBoundingClientRect();
      zoomAt(
        e.deltaY < 0 ? 1.18 : 1 / 1.18,
        e.clientX - r.left,
        e.clientY - r.top,
      );
    },
    [zoomAt],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      if (!d.moved) setDragging(true);
      d.moved = true;
      setFollow(false);
      viewRef.current.tx += dx;
      viewRef.current.ty += dy;
      d.x = e.clientX;
      d.y = e.clientY;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d && !d.moved) {
      if (hover) {
        setSelected(hover);
      } else if (hoverAirport) {
        const ap = AIRPORTS.find((a) => a.code === hoverAirport);
        if (ap) focusRegion(ap.lon, ap.lat, 5.2);
        setFollow(false);
      } else {
        setSelected(null);
        setFollow(false);
      }
    }
  }, [focusRegion, hover, hoverAirport]);

  const onPointerLeave = useCallback(() => {
    pointerRef.current = null;
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ---------- UI ----------
  const hoverAc = hover ? acByHex.get(hover) : null;
  const hoverAp = hoverAirport
    ? AIRPORTS.find((a) => a.code === hoverAirport) ?? null
    : null;
  const hoverWx = hoverAirport
    ? weather.find((w) => w.code === hoverAirport) ?? null
    : null;
  const hoverAct = hoverAirport ? activityByCode.get(hoverAirport) ?? null : null;
  const selectedAc = selected ? acByHex.get(selected) : null;
  const tipAc = hoverAc ?? null;
  const tipPos = pointerRef.current;

  const airborne = useMemo(
    () => real.filter((a) => !a.onGround).length,
    [real],
  );

  const toggle = (k: keyof typeof layers) =>
    setLayers((l) => ({ ...l, [k]: !l[k] }));

  const chip = (active: boolean) =>
    `chip cursor-pointer font-mono text-[10px] transition-all ${
      active
        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
        : "border-white/[0.08] bg-[#04070e]/80 text-slate-500 hover:text-slate-300"
    }`;

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{
        cursor: dragging
          ? "grabbing"
          : hover || hoverAirport
            ? "pointer"
            : "grab",
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      {/* filtros por companhia */}
      <div className="pointer-events-auto absolute left-2 top-2 z-10 flex flex-col gap-1">
        <button
          onClick={() => setFilter("all")}
          className={chip(filter === "all")}
        >
          todas · {real.length}
        </button>
        {AIRLINES.map((a) => {
          const n = real.filter((x) => x.airline === a.code).length;
          const active = filter === a.code;
          return (
            <button
              key={a.code}
              onClick={() => setFilter(active ? "all" : a.code)}
              className={`chip cursor-pointer font-mono text-[10px] transition-all ${
                active
                  ? "text-slate-900"
                  : "border-white/[0.08] bg-[#04070e]/80 text-slate-400 hover:text-slate-200"
              }`}
              style={
                active
                  ? { background: a.color, borderColor: a.color }
                  : undefined
              }
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: active ? "#04070e" : a.color }}
              />
              {a.code} · {n}
            </button>
          );
        })}
      </div>

      {/* camadas + zoom */}
      <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
        <div className="flex gap-1">
          <button onClick={() => toggle("trails")} className={chip(layers.trails)}>
            rastros {trails.length > 0 ? `· ${trails.length}` : ""}
          </button>
          <button onClick={() => toggle("weather")} className={chip(layers.weather)}>
            clima {weather.length > 0 ? `· ${weather.length}` : ""}
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={() => toggle("density")} className={chip(layers.density)}>
            densidade
          </button>
          <button onClick={() => toggle("labels")} className={chip(layers.labels)}>
            <Layers size={10} /> rótulos
          </button>
          <button onClick={() => toggle("ground")} className={chip(layers.ground)}>
            solo
          </button>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <button
            onClick={() => zoomAt(1 / 1.35)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-[#04070e]/80 text-slate-300 transition-colors hover:text-cyan-200"
            title="Afastar"
          >
            <Minus size={13} />
          </button>
          <span className="w-12 text-center font-mono text-[10px] text-slate-400">
            {zoomLabel.toFixed(1)}×
          </span>
          <button
            onClick={() => zoomAt(1.35)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-[#04070e]/80 text-slate-300 transition-colors hover:text-cyan-200"
            title="Aproximar"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => {
              fit();
              setFollow(false);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-[#04070e]/80 text-slate-300 transition-colors hover:text-cyan-200"
            title="Enquadrar o Brasil"
          >
            <RotateCcw size={12} />
          </button>
          {selectedAc && (
            <button
              onClick={() => setFollow((f) => !f)}
              className={chip(follow)}
              title="Seguir aeronave selecionada"
            >
              {follow ? <LocateFixed size={11} /> : <Crosshair size={11} />}
              seguir
            </button>
          )}
        </div>
      </div>

      {/* navegacao regional */}
      <div className="absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1 md:flex">
        {[
          { label: "Brasil", lon: -51.5, lat: -14.5, zoom: 1 },
          { label: "Sudeste", lon: -44.8, lat: -22.1, zoom: 3.1 },
          { label: "Sul", lon: -51.0, lat: -27.5, zoom: 3.0 },
          { label: "Nordeste", lon: -39.5, lat: -8.5, zoom: 2.6 },
          { label: "Norte", lon: -54.0, lat: -3.5, zoom: 2.0 },
        ].map((r) => (
          <button
            key={r.label}
            onClick={() =>
              r.zoom === 1 ? fit() : focusRegion(r.lon, r.lat, r.zoom)
            }
            className="rounded-full border border-white/[0.08] bg-[#04070e]/85 px-2.5 py-1 font-mono text-[9.5px] text-slate-400 backdrop-blur transition-colors hover:border-cyan-400/30 hover:text-cyan-200"
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* rodape */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-1">
        <span className="rounded-md bg-[#04070e]/80 px-2.5 py-1.5 font-mono text-[10px] text-amber-200/90 backdrop-blur">
          <span className="anim-blink mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" />
          {airborne} em voo
          {trackedCount !== undefined ? ` · ${trackedCount} rastreadas` : ""} ·{" "}
          {realSource}
        </span>
        {!selectedAc && (
          <span className="rounded-md bg-[#04070e]/80 px-2.5 py-1.5 font-mono text-[10px] text-slate-500 backdrop-blur">
            scroll = zoom · arraste = mover · clique = detalhes
          </span>
        )}
      </div>

      {/* tooltip de hover */}
      {tipAc && tipPos && !selectedAc && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-white/10 bg-[#070c17]/95 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-slate-300 shadow-xl backdrop-blur"
          style={{
            left: Math.min(tipPos.x + 14, (sizeRef.current.w || 400) - 190),
            top: Math.max(6, tipPos.y - 46),
          }}
        >
          <span
            className="font-bold"
            style={{
              color: tipAc.airline ? getAirline(tipAc.airline).color : "#fbbf24",
            }}
          >
            {tipAc.callsign ?? tipAc.hex.toUpperCase()}
          </span>
          {tipAc.registration ? ` · ${tipAc.registration}` : ""}
          {tipAc.aircraftType ? ` · ${tipAc.aircraftType}` : ""}
          <br />
          {tipAc.altM ? `FL${Math.round((tipAc.altM * 3.28084) / 100)}` : "—"}
          {tipAc.speedKmh ? ` · ${tipAc.speedKmh} km/h` : ""}
          {tipAc.destIata
            ? ` · → ${tipAc.destIata}`
            : tipAc.destEstimate
              ? ` · → ${tipAc.destEstimate} (est.)`
              : ""}
        </div>
      )}

      {/* tooltip de aeroporto */}
      {!tipAc && hoverAp && tipPos && !selectedAc && (
        <div
          className="pointer-events-none absolute z-20 w-[220px] rounded-xl border border-white/10 bg-[#070c17]/95 p-2.5 text-[10px] shadow-xl backdrop-blur"
          style={{
            left: Math.min(tipPos.x + 14, (sizeRef.current.w || 400) - 230),
            top: Math.max(6, tipPos.y - 80),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-cyan-200">
              {hoverAp.code}
            </span>
            <span className="truncate text-slate-500">{hoverAp.city}</span>
          </div>
          {hoverWx ? (
            <>
              <p className="mt-1.5 text-slate-300">
                {hoverWx.condition} · {Math.round(hoverWx.tempC)}°C
              </p>
              <p className="mt-0.5 font-mono text-slate-500">
                vento {Math.round(hoverWx.windKmh)}/{Math.round(hoverWx.gustKmh)} km/h{" "}
                {hoverWx.windCardinal}
              </p>
              <p className="font-mono text-slate-500">
                {hoverWx.visibilityM != null
                  ? `vis ${(hoverWx.visibilityM / 1000).toFixed(1)} km`
                  : "vis —"}
                {hoverWx.cape != null ? ` · CAPE ${Math.round(hoverWx.cape)}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-slate-600">meteorologia indisponível</p>
          )}
          <p className="mt-1.5 font-mono text-amber-300/80">
            ↓{hoverAct?.approach ?? 0} aproximações · ■{hoverAct?.ground ?? 0} em solo
          </p>
          <p className="mt-1 text-[9px] text-slate-600">clique para aproximar</p>
        </div>
      )}

      {/* card do voo selecionado */}
      {selectedAc && (
        <div className="absolute bottom-2 right-2 z-20 w-[244px] rounded-xl border border-white/[0.09] bg-[#070c17]/95 p-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
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
                {selectedAc.registration ? ` · ${selectedAc.registration}` : ""}
                {selectedAc.aircraftType ? ` · ${selectedAc.aircraftType}` : ""}
              </p>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setFollow(false);
              }}
              className="shrink-0 rounded px-1 text-xs text-slate-500 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-200">
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5">
              {selectedAc.origIata ?? "•••"}
            </span>
            <span className="text-cyan-400">→</span>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5">
              {selectedAc.destIata ?? selectedAc.destEstimate ?? "•••"}
            </span>
          </div>
          {!selectedAc.destIata && selectedAc.destEstimate && (
            <p className="mt-1 text-[9.5px] leading-snug text-amber-300/80">
              destino estimado pela trajetória
              {selectedAc.destConfidence
                ? ` · confiança ${selectedAc.destConfidence}%`
                : ""}
            </p>
          )}

          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px] text-slate-400">
            <span>
              {selectedAc.altM
                ? `FL${Math.round((selectedAc.altM * 3.28084) / 100)}`
                : "—"}
            </span>
            <span>
              {selectedAc.speedKmh ? `${selectedAc.speedKmh} km/h` : "—"}
            </span>
            <span>
              proa{" "}
              {selectedAc.trailTrack != null
                ? `${Math.round(selectedAc.trailTrack)}°`
                : selectedAc.track != null
                  ? `${Math.round(selectedAc.track)}°`
                  : "—"}
            </span>
            <span
              style={{
                color: (selectedAc.posAgeSec ?? 0) > 60 ? "#fbbf24" : "#34d399",
              }}
              title="Idade do fix ADS-B"
            >
              fix{" "}
              {selectedAc.posAgeSec != null ? `${selectedAc.posAgeSec}s` : "—"}
              {selectedAc.accuracyM ? ` ±${selectedAc.accuracyM}m` : ""}
            </span>
          </div>
        </div>
      )}

      {real.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-xs text-slate-500">
          Sincronizando tráfego real (ADS-B)…
        </div>
      )}
    </div>
  );
}
