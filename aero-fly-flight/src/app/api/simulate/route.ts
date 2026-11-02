import { ensureSeeded, runTick } from "@/lib/simulation";

export const dynamic = "force-dynamic";

/**
 * Executa ticks do motor operacional.
 * Em producao, esse papel e da pipeline Python (python/pipeline.py);
 * aqui funciona como fallback para manter o dashboard vivo no preview.
 */
export async function POST(req: Request) {
  try {
    let ticks = 1;
    try {
      const body = await req.json();
      ticks = Math.min(5, Math.max(1, Number(body?.ticks) || 1));
    } catch {
      /* corpo vazio: 1 tick */
    }

    await ensureSeeded("web");
    let agg = { inserted: 0, updated: 0, cancelled: 0, events: 0, durationMs: 0 };
    for (let i = 0; i < ticks; i++) {
      const s = await runTick("web");
      agg = {
        inserted: agg.inserted + s.inserted,
        updated: agg.updated + s.updated,
        cancelled: agg.cancelled + s.cancelled,
        events: agg.events + s.events,
        durationMs: agg.durationMs + s.durationMs,
      };
    }
    return Response.json({ ok: true, ticks, ...agg });
  } catch (err) {
    console.error("simulate error", err);
    return Response.json({ error: "Falha ao executar o tick" }, { status: 500 });
  }
}
