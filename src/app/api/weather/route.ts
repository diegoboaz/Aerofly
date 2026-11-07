import { getWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

/** Meteorologia real dos aeroportos monitorados (Open-Meteo). */
export async function GET() {
  try {
    const data = await getWeather();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("weather error", err);
    return Response.json(
      { error: "Serviço meteorológico indisponível no momento" },
      { status: 503 },
    );
  }
}
