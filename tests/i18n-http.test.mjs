import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.PUBLIC_TEST_URL;

test("login renders Portuguese by default and Spanish from the saved language cookie", { skip: !base }, async () => {
  const [portuguese, spanish] = await Promise.all([
    fetch(`${base}/login`).then((response) => response.text()),
    fetch(`${base}/login`, { headers: { cookie: "restaurant-locale=es" } }).then((response) => response.text()),
  ]);
  assert.match(portuguese, /<html[^>]*lang="pt-BR"/);
  assert.match(portuguese, /Acesse sua conta/);
  assert.match(spanish, /<html[^>]*lang="es"/);
  assert.match(spanish, /Acceda a su cuenta/);
  assert.match(spanish, /Contraseña/);
  for (const html of [portuguese, spanish]) {
    assert.match(html, /id="interface-language"/);
    assert.match(html, /Português \(Brasil\)/);
    assert.match(html, /Español/);
  }
});

test("customer pages keep saved Spanish on navigation and localize page titles", { skip: !base }, async () => {
  for (const [path, title] of [["/order", "Retiro y entrega"], ["/t/invalid", "Pida en la mesa"], ["/track/invalid", "Siga su pedido"]]) {
    const response = await fetch(`${base}${path}`, { headers: { cookie: "restaurant-locale=es" } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<html[^>]*lang="es"/);
    assert.ok(html.includes(title), `${path}: expected Spanish title`);
    assert.match(html, /id="interface-language"/);
  }
});

test("unsupported language cookies fall back to Portuguese without affecting another visitor", { skip: !base }, async () => {
  const responses = await Promise.all(["invalid", "es", "pt-BR", "es"].map(async (locale) => {
    const response = await fetch(`${base}/login`, { headers: { cookie: `restaurant-locale=${locale}` } });
    return { locale, html: await response.text() };
  }));
  for (const { locale, html } of responses) assert.ok(html.includes(`lang="${locale === "es" ? "es" : "pt-BR"}"`));
});
