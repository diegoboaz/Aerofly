import { getLiveTraffic } from "@/lib/liveTraffic";

export const dynamic = "force-dynamic";

/**
 * Proxy server-side para o trafego aereo real (OpenSky Network).
 * Mantem o cache e as credenciais OAuth2 no servidor.
 */
export async function GET() {
  try {
    const data = await getLiveTraffic();
    return Response.json(data);
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
