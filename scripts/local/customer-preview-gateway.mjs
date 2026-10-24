import http from "node:http";
import { isMain } from "./lib.mjs";

export function allowCustomerPreview(method, rawPath) {
  // Reject encoded paths and normalization tricks before URL parsing.
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || /[%\\#]/.test(rawPath.split("?")[0])) return false;
  const pathname = rawPath.split("?")[0];
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return false;
  if (method === "POST") return ["/api/public/orders", "/api/public/delivery-quote"].includes(pathname);
  if (!["GET", "HEAD"].includes(method)) return false;
  return ["/", "/order", "/favicon.ico", "/api/public/menu"].includes(pathname)
    || /^\/track\/[a-f0-9]{64}$/.test(pathname)
    || /^\/api\/public\/orders\/[a-f0-9]{64}$/.test(pathname)
    || /^\/api\/public\/products\/[a-f0-9-]{36}\/image$/.test(pathname)
    || /^\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|ttf|png|svg|ico)$/.test(pathname);
}

export function createCustomerPreviewGateway(upstreamPort = 3000) {
  return http.createServer((request, response) => {
    const apiRequest = request.url?.startsWith("/api/");
    function unavailable() {
      if (!response.headersSent) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "Conexão temporariamente indisponível. Se você estava enviando um pedido, confira com o restaurante antes de reenviar." }));
      } else response.destroy();
    }
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (!allowCustomerPreview(request.method, request.url)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Página indisponível neste link de teste.");
      request.resume();
      return;
    }
    if (request.url === "/") {
      response.writeHead(302, { Location: "/order" }); response.end(); return;
    }
    // No staff cookies, authorization, action or forwarding headers cross this gateway.
    const headers = {};
    for (const name of ["accept", "accept-encoding", "content-type", "content-length", "if-none-match", "user-agent", "rsc", "next-router-state-tree", "next-router-prefetch", "next-url"]) {
      if (request.headers[name]) headers[name] = request.headers[name];
    }
    headers.host = `127.0.0.1:${upstreamPort}`;
    const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method, headers, timeout: 30000 }, (result) => {
      if (apiRequest && !/^application\/(?:[\w.+-]+\+)?json\b/i.test(result.headers["content-type"] ?? "")) {
        console.warn("Customer preview: upstream API returned an unexpected content type", result.statusCode);
        result.resume(); unavailable(); return;
      }
      for (const [name, value] of Object.entries(result.headers)) {
        if (value !== undefined && !["set-cookie", "connection", "transfer-encoding", "keep-alive"].includes(name)) response.setHeader(name, value);
      }
      response.setHeader("X-Robots-Tag", "noindex, nofollow");
      response.statusCode = result.statusCode ?? 502;
      result.pipe(response);
    });
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => { if (apiRequest) unavailable(); else { if (!response.headersSent) response.writeHead(502); response.end(); } });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  });
}

if (isMain(import.meta.url)) {
  createCustomerPreviewGateway().listen(3010, "127.0.0.1", () => console.log("Customer preview gateway listening on loopback port 3010."));
}
