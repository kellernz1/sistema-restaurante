import assert from "node:assert/strict";
import test from "node:test";
import { adminPreviewTarget, createAdminPreviewGateway, previewSession, validPreviewSession } from "../scripts/local/admin-preview-gateway.mjs";
import { browserSupabaseConnection } from "../src/utils/supabase/public-env.ts";

test("staff preview sessions reject tampering, wrong codes and expiration", () => {
  const session = previewSession("test-secret", 100000);
  assert.equal(validPreviewSession(session, "test-secret", 101000), true);
  assert.equal(validPreviewSession(session, "other", 101000), false);
  assert.equal(validPreviewSession(session, "test-secret", 14500000), false);
  assert.equal(validPreviewSession(`${session}0`, "test-secret", 101000), false);
});

test("staff preview restricts backend and ambiguous routes", () => {
  for (const route of ["/__staff_supabase/auth/v1/admin/users", "/__staff_supabase/pg", "/dev/whatsapp", "/api/whatsapp/process", "/%64ev", "/../dev", "//admin"]) assert.equal(adminPreviewTarget(route), null);
  assert.deepEqual(adminPreviewTarget("/__staff_supabase/rest/v1/profiles?select=role"), { port: 54321, path: "/rest/v1/profiles?select=role", backend: true });
  assert.equal(adminPreviewTarget("/admin/settings").port, 3000);
});

test("preview browser connection preserves server session cookie identity", () => {
  const original = "http://192.168.100.8:54321";
  assert.deepEqual(browserSupabaseConnection(original, "https://team.trycloudflare.com", true), { url: "https://team.trycloudflare.com/__staff_supabase", storageKey: "sb-192-auth-token", preview: true });
  assert.equal(browserSupabaseConnection(original, "https://team.trycloudflare.com", false).url, original);
  assert.equal(browserSupabaseConnection(original, "https://trycloudflare.com.evil.example", true).url, original);
  assert.equal(browserSupabaseConnection(original).url, original);
});

test("staff gateway requires its code before app/API access", async () => {
  const server = createAdminPreviewGateway({ accessCode: "test-secret", url: "https://team.trycloudflare.com" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    // A no-referrer policy makes browser form POSTs send Origin: null.
    // Preserve same-origin form metadata without leaking referrers to other sites.
    const form = await fetch(`${origin}/__preview/login`);
    assert.equal(form.headers.get("referrer-policy"), "same-origin");
    for (const suppliedOrigin of ["null", "https://other.example"]) {
      const rejected = await fetch(`${origin}/__preview/login`, { method: "POST", headers: { origin: suppliedOrigin }, body: "code=test-secret", redirect: "manual" });
      assert.equal(rejected.status, 403);
    }
    const page = await fetch(`${origin}/admin`, { redirect: "manual" });
    assert.equal(page.status, 303);
    assert.equal(page.headers.get("location"), "/__preview/login");
    assert.equal((await fetch(`${origin}/api/staff/orders`)).status, 401);
    const wrong = await fetch(`${origin}/__preview/login`, { method: "POST", body: "code=wrong" });
    assert.equal(wrong.status, 401);
    const login = await fetch(`${origin}/__preview/login`, { method: "POST", headers: { origin: "https://team.trycloudflare.com" }, body: "code=test-secret", redirect: "manual" });
    assert.equal(login.status, 303);
    const cookies = login.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => cookie.includes("Secure") && cookie.includes("SameSite=Lax")));
    assert.ok(cookies[0].includes("HttpOnly"));
    assert.equal((await fetch(`${origin}/__staff_supabase/auth/v1/admin/users`, { headers: { cookie: cookies[0].split(";")[0] } })).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
