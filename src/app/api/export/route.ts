import { AIRLINES, REAL_PHASE_META, flightPhase } from "@/lib/aviation";
import { getLiveTraffic } from "@/lib/liveTraffic";

export const dynamic = "force-dynamic";

const csv = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Exporta o snapshot REAL atual do trafego ADS-B (Brasil). */
export async function GET() {
  try {
    const traffic = await getLiveTraffic();

    const header = [
      "Callsign",
      "Voo",
      "Companhia",
      "Rota",
      "Latitude",
      "Longitude",
      "Altitude (ft)",
      "Velocidade (km/h)",
      "Proa (graus)",
      "Fase",
      "Fonte",
      "Coletado em",
    ];

    const lines = traffic.aircraft.map((a) =>
      [
        a.callsign ?? a.hex.toUpperCase(),
        a.flightNumber ?? "",
        a.airline
          ? (AIRLINES.find((x) => x.code === a.airline)?.name ?? a.airline)
          : a.country,
        a.origIata && a.destIata ? `${a.origIata}→${a.destIata}` : "",
        a.lat,
        a.lon,
        a.altM ? Math.round(a.altM * 3.28084) : "",
        a.speedKmh ?? "",
        a.track ?? "",
        REAL_PHASE_META[flightPhase(a)]?.label ?? "",
        traffic.source,
        traffic.updatedAt,
      ]
        .map(csv)
        .join(";"),
    );

    const body = "﻿" + header.map(csv).join(";") + "\n" + lines.join("\n");
    const stamp = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/g, "");

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aerofly-trafego-real-${stamp}.csv"`,
      },
    });
  } catch (err) {
    console.error("export error", err);
    return Response.json(
      { error: "Fonte ADS-B indisponível no momento" },
      { status: 503 },
    );
  }
}
