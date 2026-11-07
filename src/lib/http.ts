// Resposta JSON com compressao gzip sob demanda.
// Os payloads do dashboard (tráfego + rastros + clima) passam de 100 KB;
// comprimir reduz ~5x o trafego em cada ciclo de polling.

export function jsonResponse(data: unknown, req: Request): Response {
  const body = JSON.stringify(data);
  const accepts = req.headers.get("accept-encoding") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Accept-Encoding",
  };

  if (
    body.length > 1024 &&
    accepts.includes("gzip") &&
    typeof CompressionStream !== "undefined"
  ) {
    try {
      const stream = new Blob([body])
        .stream()
        .pipeThrough(new CompressionStream("gzip"));
      return new Response(stream, {
        headers: { ...headers, "Content-Encoding": "gzip" },
      });
    } catch {
      /* cai para resposta sem compressao */
    }
  }
  return new Response(body, { headers });
}
