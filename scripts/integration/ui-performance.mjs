import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createServerClient } from "@supabase/ssr";
import { resolveTarget, requireTransport } from "../target-safety.mjs";
import { databaseSql } from "../target-operations.mjs";

// Instrumentation belongs to the existing disposable controller, never a live installation.
const target = resolveTarget();
requireTransport(target);
assert.equal(target.profile, "disposable");
const env = process.env;
const base = env.PUBLIC_TEST_URL;
const executable = env.VISUAL_BROWSER_PATH || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p => fs.existsSync(p));
if (!executable) throw Error("Installed Edge is required for UI performance measurement");
await databaseSql(target, `
do $$ declare actor uuid; begin
select id into strict actor from public.profiles where full_name='Integration admin';
perform set_config('request.jwt.claim.sub',actor::text,true);
perform set_config('request.jwt.claim.role','authenticated',true);
insert into public.orders(order_type,source,is_counter,counter_name,notes,waiter_id,created_at)
select 'pickup','waiter',true,'UI fixture','UI_BASELINE_'||n,actor,now()-make_interval(mins=>n)
from generate_series(1,50)n;
insert into public.order_items(order_id,product_id,quantity,unit_price,status)
select o.id,p.id,1,p.price,case when substring(o.notes from 13)::int<=20 then 'ready'::public.order_item_status else 'preparing'::public.order_item_status end
from public.orders o cross join lateral(select id,price from public.products where is_active order by id limit 1)p
where o.notes like 'UI_BASELINE_%';
update public.orders set status='ready' where notes like 'UI_BASELINE_%' and substring(notes from 13)::int<=20;
insert into public.orders(order_type,source,table_id,waiter_id,notes)
select 'dine_in','waiter',id,actor,'UI_BASELINE_TABLE' from public.tables order by table_number limit 5;
insert into public.order_items(order_id,product_id,quantity,unit_price,status)
select o.id,p.id,1,p.price,'pending' from public.orders o
cross join lateral(select id,price from public.products where is_active order by id limit 1)p
where o.notes='UI_BASELINE_TABLE';
end $$;`);
const jar = new Map();
const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) },
});
const login = await auth.auth.signInWithPassword({ email: "admin@restaurante.local", password: env.DEMO_PASSWORD });
if (login.error) throw Error("Disposable benchmark login failed");
const browser = await chromium.launch({ executablePath: executable, headless: true });
const results = [];
function percentile(values, fraction) { return [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]; }
try {
  for (const [name, route, selector, action] of [
    ["cashier", "/cashier", ".cashier-dashboard", ".cashier-table"],
    ["counter", "/cashier/counter", ".counter-products button", ".counter-products button"],
    ["kitchen", "/kitchen", ".kitchen-card", ".kitchen-threshold select"],
    ["ready", "/cashier", ".counter-ready", ".counter-queue details summary"],
  ]) {
    const cold = [], interactions = [], scripts = [];
    let version;
    for (let sample = 0; sample < 5; sample++) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "light" });
      await context.addCookies([...jar].map(([key, value]) => ({ name: key, value, url: base })));
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      version = browser.version();
      const start = performance.now();
      const response = await page.goto(base + route, { waitUntil: "load" });
      assert.ok(response.ok());
      await page.locator(selector).first().waitFor({ state: "visible" });
      cold.push(performance.now() - start);
      await page.waitForTimeout(500);
      scripts.push(await page.evaluate(() => {
        const resources = performance.getEntriesByType("resource").filter(r => /\.js(?:\?|$)/.test(r.name));
        const unique = [...new Map(resources.map(r => [r.name, r])).values()];
        return { decoded: unique.reduce((s, r) => s + r.decodedBodySize, 0), encoded: unique.reduce((s, r) => s + r.encodedBodySize, 0), resources: unique.length };
      }));
      if (sample === 4) {
        for (let i = 0; i < 30; i++) {
          await page.locator(action).first().scrollIntoViewIfNeeded();
          await page.evaluate(query => {
            const element = document.querySelector(query);
            window.__uiPaint = new Promise(resolve => element.addEventListener(query.includes("select") ? "change" : "click", () => {
              const started = performance.now();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - started)));
            }, { once: true }));
          }, action);
          if (name === "kitchen") await page.locator(action).selectOption(i % 2 ? "10" : "15");
          else await page.locator(action).first().click();
          interactions.push(await page.evaluate(() => window.__uiPaint));
        }
      }
      await context.close();
    }
    results.push({ name, route, selector, interaction: action, browser: version, cpuSlowdown: 4, coldSamples: cold, coldMedianMs: percentile(cold, .5), coldMaxMs: Math.max(...cold), scripts, jsDecodedMax: Math.max(...scripts.map(s => s.decoded)), jsEncodedMax: Math.max(...scripts.map(s => s.encoded)), interactionSamples: interactions, interactionP95Ms: percentile(interactions, .95) });
  }
} finally {
  await browser.close();
  await auth.auth.signOut({ scope: "local" });
}
const destination = path.join(path.dirname(env.TARGET_CONTEXT_FILE), "ui-performance.json");
fs.writeFileSync(destination, JSON.stringify({ methodology: "Edge CPU4x; 1366x768; light pt-BR; five cold contexts; 30 warm local feedback actions; no payment or handoff mutations", fixture: "50 added active counter orders, 20 ready, plus unchanged integration suite fixtures; catalog from seed", results }, null, 2), "utf8");
console.log(JSON.stringify(results.map(({ name, jsDecodedMax, jsEncodedMax, coldMedianMs, interactionP95Ms }) => ({ name, jsDecodedMax, jsEncodedMax, coldMedianMs, interactionP95Ms })), null, 2));
// Current absolute DESIGN.md ceilings are stricter than the phase-3A baseline +3%.
for (const result of results) {
  const decoded = result.name === "kitchen" ? 900000 : 1050000;
  const encoded = result.name === "kitchen" ? 265000 : 310000;
  assert.ok(result.jsDecodedMax <= decoded && result.jsEncodedMax <= encoded, `${result.name} exceeds the unchanged DESIGN.md JavaScript budget; inspect the saved measurement`);
  assert.ok(result.interactionP95Ms <= 100, `${result.name} exceeds the local-feedback proxy budget`);
}
