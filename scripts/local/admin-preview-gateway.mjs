import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { isMain, LOCAL_STATE_DIR } from "./lib.mjs";

const sessionCookie = "mesa-certa-staff-gate";
const markerCookie = "mesa-certa-staff-preview";
const prefix = "/__staff_supabase";
export function adminPreviewTarget(rawPath) {
  const pathname = rawPath.split("?")[0];
  if (!pathname.startsWith("/") || pathname.startsWith("//") || /[%\\#]/.test(pathname) || pathname.split("/").some((part) => part === "." || part === "..")) return null;
  if (pathname === "/dev" || pathname.startsWith("/dev/") || pathname.startsWith("/api/whatsapp")) return null;
  if (pathname.startsWith(prefix)) {
    const backendPath = rawPath.slice(prefix.length);
    const endpoint = pathname.slice(prefix.length);
    return /^\/auth\/v1\/(token|user|logout|settings|health)$/.test(endpoint) || endpoint.startsWith("/rest/v1/") || endpoint.startsWith("/realtime/v1/")
      ? { port: 54321, path: backendPath, backend: true } : null;
  }
  return { port: 3000, path: rawPath, backend: false };
}
const digest = (value) => crypto.createHash("sha256").update(value).digest();
function safeEqual(left, right) { return crypto.timingSafeEqual(digest(left), digest(right)); }
export function previewSession(code, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + 14400}.${crypto.randomBytes(12).toString("hex")}`;
  return `${value}.${crypto.createHmac("sha256", code).update(value).digest("hex")}`;
}
export function validPreviewSession(value, code, now = Date.now()) {
  const match = /^(\d+)\.([a-f0-9]{24})\.([a-f0-9]{64})$/.exec(value ?? "");
  if (!match || Number(match[1]) <= Math.floor(now / 1000)) return false;
  return safeEqual(match[3], crypto.createHmac("sha256", code).update(`${match[1]}.${match[2]}`).digest("hex"));
}
function cookieValue(header, name) { return header?.split(/;\s*/).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1); }
const loginHtml = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acesso de testes · Mesa Certa</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f5f5f7;color:#1d1d1f;font:16px/1.5 -apple-system,Segoe UI,sans-serif}main{max-width:380px;margin:24px;padding:32px;background:white;border-radius:28px}h1{font-size:28px;letter-spacing:-.03em}p{color:#6e6e73}label{display:grid;gap:10px}input,button{box-sizing:border-box;width:100%;min-height:48px;font:inherit;border-radius:14px;padding:12px 16px}input{border:1px solid #ccc}button{margin-top:20px;border:0;border-radius:999px;background:#0071e3;color:white;cursor:pointer}a{color:#0071e3}</style><main><h1>Mesa Certa</h1><p>Acesso temporário da equipe. Informe o código compartilhado para abrir o login do sistema.</p><form method="post" action="/__preview/login"><label>Código de acesso<input type="password" name="code" required autocomplete="current-password" maxlength="100"></label><button>Continuar para o login</button></form></main></html>`;

export function createAdminPreviewGateway(config) {
  const failures = new Map();
  const current = () => typeof config === "function" ? config() : config;
  function authorized(request) { const { accessCode } = current(); return validPreviewSession(cookieValue(request.headers.cookie, sessionCookie), accessCode); }
  function securityHeaders(response) { response.setHeader("X-Robots-Tag", "noindex, nofollow"); response.setHeader("Referrer-Policy", "no-referrer"); response.setHeader("Cache-Control", "no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); }
  function json(response, status, message) { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: message })); }
  const server = http.createServer(async (request, response) => {
    securityHeaders(response);
    const { accessCode, url } = current();
    if (!accessCode || !url) { json(response, 503, "O acesso de testes está iniciando."); return; }
    const pathname = request.url.split("?")[0];
    if (pathname === "/__preview/login" && request.method === "GET") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(loginHtml); return; }
    if (pathname === "/__preview/login" && request.method === "POST") {
      if (request.headers.origin && request.headers.origin !== url) { json(response, 403, "Origem inválida."); request.resume(); return; }
      const attemptKey = request.socket.remoteAddress;
      const previous = failures.get(attemptKey);
      if (previous && previous.expires > Date.now() && previous.count >= 20) { json(response, 429, "Muitas tentativas. Aguarde dez minutos."); request.resume(); return; }
      const chunks = []; let size = 0;
      try {
        for await (const chunk of request) { size += chunk.length; if (size > 2048) throw new Error("Body too large"); chunks.push(chunk); }
      } catch { json(response, 400, "Dados inválidos."); return; }
      const code = new URLSearchParams(Buffer.concat(chunks).toString()).get("code") ?? "";
      if (!safeEqual(code, accessCode)) {
        failures.set(attemptKey, { count: previous?.expires > Date.now() ? previous.count + 1 : 1, expires: previous?.expires > Date.now() ? previous.expires : Date.now() + 600000 });
        json(response, 401, "Código inválido. Volte e tente novamente."); return;
      }
      failures.delete(attemptKey);
      response.setHeader("Set-Cookie", [`${sessionCookie}=${previewSession(accessCode)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`, `${markerCookie}=1; Path=/; Secure; SameSite=Lax; Max-Age=14400`]);
      response.writeHead(303, { Location: "/login" }); response.end(); return;
    }
    if (!authorized(request)) {
      if (pathname.startsWith("/api/") || pathname.startsWith(prefix)) json(response, 401, "Acesso de testes expirado. Abra o link novamente e informe o código.");
      else { response.writeHead(303, { Location: "/__preview/login" }); response.end(); }
      request.resume(); return;
    }
    const target = adminPreviewTarget(request.url);
    if (!target) { json(response, 404, "Rota indisponível neste acesso de testes."); request.resume(); return; }
    const headers = { ...request.headers, host: target.backend ? "127.0.0.1:54321" : new URL(url).host };
    for (const key of Object.keys(headers)) if (key === "connection" || key.startsWith("x-forwarded-") || key === "forwarded") delete headers[key];
    headers["x-forwarded-host"] = new URL(url).host;
    headers["x-forwarded-proto"] = "https";
    if (target.backend) delete headers.cookie;
    const upstream = http.request({ hostname: "127.0.0.1", port: target.port, path: target.path, method: request.method, headers, timeout: 30000 }, (result) => {
      for (const [name, value] of Object.entries(result.headers)) {
        if (value === undefined || ["connection", "transfer-encoding", "keep-alive", "cache-control"].includes(name)) continue;
        response.setHeader(name, name === "set-cookie" ? (Array.isArray(value) ? value : [value]).map((cookie) => /;\s*secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`) : value);
      }
      securityHeaders(response); response.statusCode = result.statusCode ?? 502; result.pipe(response);
    });
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => { if (!response.headersSent) json(response, 502, "Sistema temporariamente indisponível. Tente novamente."); else response.destroy(); });
    request.on("aborted", () => upstream.destroy()); response.on("close", () => upstream.destroy()); request.pipe(upstream);
  });
  server.on("upgrade", (request, socket, head) => {
    const target = adminPreviewTarget(request.url);
    if (!authorized(request) || !target?.backend || !target.path.startsWith("/realtime/v1/")) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
    const headers = { ...request.headers, host: "127.0.0.1:54321" }; delete headers.cookie;
    const upstream = http.request({ hostname: "127.0.0.1", port: 54321, path: target.path, headers, method: "GET", timeout: 15000 });
    upstream.on("upgrade", (result, upstreamSocket, upstreamHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(result.headers).map(([name, value]) => `${name}: ${value}`).join("\r\n")}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head); if (upstreamHead.length) socket.write(upstreamHead);
      socket.pipe(upstreamSocket); upstreamSocket.pipe(socket);
      socket.on("error", () => upstreamSocket.destroy()); socket.on("close", () => upstreamSocket.destroy()); upstreamSocket.on("error", () => socket.destroy());
    });
    upstream.on("response", (result) => { result.resume(); socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"); });
    upstream.on("timeout", () => upstream.destroy()); upstream.on("error", () => socket.destroy()); upstream.end();
  });
  return server;
}
if (isMain(import.meta.url)) {
  createAdminPreviewGateway(() => JSON.parse(fs.readFileSync(path.join(LOCAL_STATE_DIR, "admin-preview.json"), "utf8").replace(/^\uFEFF/, ""))).listen(3013, "127.0.0.1", () => console.log("Protected staff preview gateway listening on loopback port 3013."));
}
