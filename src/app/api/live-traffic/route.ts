import { getLiveTraffic } from "@/lib/liveTraffic";
import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Proxy server-side para o trafego aereo real (FR24 / ADS-B aberto / OpenSky).
 * Mantem cache, credenciais e compressao no servidor.
 */
export async function GET(req: Request) {
  try {
    const data = await getLiveTraffic();
    return jsonResponse(data, req);
  } catch (err) {
    console.error("live-traffic error", err);
    return Response.json(
      {
        error:
          "OpenSky indisponível no momento — limite anônimo ou rede. Tente em instantes.",
        errorCode: "OPENSKY_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
