import { db } from "@/db";
import { flights } from "@/db/schema";
import { AIRLINES, STATUS_META } from "@/lib/aviation";
import { ensureSeeded, startOfSpDay } from "@/lib/simulation";
import { and, desc, gte, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmtDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const csv = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function GET() {
  try {
    await ensureSeeded("web");
    const rows = await db
      .select()
      .from(flights)
      .where(
        and(
          gte(flights.scheduledDeparture, startOfSpDay(0)),
          lt(flights.scheduledDeparture, startOfSpDay(1)),
        ),
      )
      .orderBy(desc(flights.scheduledDeparture));

    const header = [
      "Voo",
      "Companhia",
      "Origem",
      "Destino",
      "Partida Programada",
      "Chegada Programada",
      "Status",
      "Atraso (min)",
      "Motivo do Cancelamento",
    ];

    const lines = rows.map((f) =>
      [
        f.flightNumber,
        AIRLINES.find((a) => a.code === f.airlineCode)?.name ?? f.airlineCode,
        f.originCode,
        f.destinationCode,
        fmtDate.format(f.scheduledDeparture),
        fmtDate.format(f.scheduledArrival),
        STATUS_META[f.status]?.label ?? f.status,
        f.delayMinutes,
        f.cancellationReason ?? "",
      ]
        .map(csv)
        .join(";"),
    );

    const body = "﻿" + header.map(csv).join(";") + "\n" + lines.join("\n");
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aerofly-voos-${stamp}.csv"`,
      },
    });
  } catch (err) {
    console.error("export error", err);
    return Response.json({ error: "Falha ao exportar" }, { status: 500 });
  }
}
