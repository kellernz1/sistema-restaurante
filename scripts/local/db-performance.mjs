import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { allocateDatabase, targetPath } from "../target-safety.mjs";
import { createIsolatedDatabase, dropIsolatedDatabase, databaseSql, migrateIsolated, verifyHistory } from "../target-operations.mjs";
import { atomicJson } from "../target-state.mjs";
import { ROOT } from "./lib.mjs";
import { seedTestLicense } from "../../tests/helpers/license-fixture.mjs";

export const PERFORMANCE_MIGRATION = "202610270002";
const BASELINE = "202610260010";
const fixture = name => fs.readFileSync(path.join(ROOT, "supabase/fixtures", name), "utf8");

export async function preparePerformanceFixture(context, count, waiter, active = 100) {
  assert.equal(context.profile, "disposable", "Performance fixtures require an owned disposable target");
  await databaseSql(context, fs.readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8") + "\n" + fixture("performance-data.sql"));
  await seedTestLicense(context);
  await databaseSql(context, "update public.products set price=price*1000;");
  for (let start = 1; start <= count; start += 5000) {
    await databaseSql(context, `select perf_fixture.seed_batch(${start},${Math.min(5000, count-start+1)});`);
  }
  await databaseSql(context, `select perf_fixture.seed_active(${waiter ? "true" : "false"},${active});analyze;`);
}

export async function comparePerformanceVisibility(context) {
  assert.equal(context.profile, "disposable", "Visibility comparisons require an owned disposable target");
  await databaseSql(context, "select perf_fixture.capture('before');");
  migrateIsolated(context, { through: PERFORMANCE_MIGRATION });
  await databaseSql(context, "select perf_fixture.capture('after');\n" + fixture("performance-visibility-assert.sql"));
  // A deliberate snapshot-only discrepancy must fail, then roll back on connection close.
  await assert.rejects(() => databaseSql(context, `begin;
    update perf_fixture.visibility set keys=keys||jsonb_build_array('unexpected-row'::text)
    where phase='after'and label='admin'and relation='orders';
    ${fixture("performance-visibility-assert.sql")}`), /RLS visibility changed/);
  return JSON.parse((await databaseSql(context, "select json_build_object('identities',count(distinct label),'relations',count(distinct relation),'comparisons',count(*))from perf_fixture.visibility where phase='after';")).trim());
}

// Run in every clean-chain validation, including service mode off and inactive staff.
export async function validatePerformanceVisibility(parent) {
  assert.equal(parent.profile, "disposable");
  const context = allocateDatabase(parent, "clean");
  try {
    await createIsolatedDatabase(context);
    migrateIsolated(context, { through: BASELINE });
    await preparePerformanceFixture(context, 20, false, 1100);
    const result = await comparePerformanceVisibility(context);
    console.log("RLS before/after SQL comparison passed: " + JSON.stringify(result));
  } finally { await dropIsolatedDatabase(context); }
}

const queries = {
  kitchen: `select i.id,i.quantity,i.status,i.notes,i.created_at,p.name,o.order_number
    from public.order_items i join public.orders o on o.id=i.order_id join public.products p on p.id=i.product_id
    where o.status in ('open','ready')and i.status in ('pending','preparing','ready')order by i.created_at,i.id`,
  ready: "select id,counter_ticket,counter_name,counter_ready_at from public.orders where is_counter and status='ready'order by counter_ready_at,id",
  cashier: "select o.id,o.order_number,o.total_amount,t.table_number from public.orders o join public.tables t on t.id=o.table_id where o.order_type='dine_in'and o.status not in('closed','cancelled')order by o.created_at,o.id",
  day: "select public.cash_day_report(current_date-180)",
  turn: "select public.cash_session_report(id)from public.cash_sessions where operator_id=auth.uid()and status='open'order by opened_at desc,id limit 1",
  audit: "select public.audit_timeline(current_date-180,null,null,null,0)",
};

async function benchmark(context, phase, samples) {
  const actor = (await databaseSql(context, "select actor from perf_fixture.identities where label='admin'")).trim();
  const results = {};
  const measured = { ...queries };
  if (phase === "after") {
    // EXPLAIN the actual invoker SQL body, without executing migration DDL directly.
    const body = await databaseSql(context,"select prosrc from pg_proc where oid='public.kitchen_queue_page(timestamptz,uuid,integer)'::regprocedure;");
    measured.kitchen = body.trim().replace(/\bp_after_created\b/g,"null::timestamptz")
      .replace(/\bp_after_id\b/g,"null::uuid").replace(/\bp_limit\b/g,"250");
    measured.kitchen_rpc = "select public.kitchen_queue_page(null,null,250)";
  }
  for (const [name, query] of Object.entries(measured)) {
    results[name] = [];
    for (let sample = 0; sample < samples; sample++) {
      const output = await databaseSql(context, `begin;set local statement_timeout='110s';
        select set_config('request.jwt.claim.sub','${actor}',true);
        select set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;
        explain(analyze,buffers,format json) ${query};rollback;`);
      const start = output.indexOf("[\n");
      assert.ok(start >= 0, "EXPLAIN output missing");
      results[name].push(JSON.parse(output.slice(start,output.lastIndexOf("]")+1))[0]);
    }
    console.log(`DB performance ${context.database}: ${phase} ${name}, ${samples} samples complete`);
  }
  return results;
}

export async function runDatabasePerformance(parent) {
  assert.equal(parent.profile, "disposable");
  const evidence = { baseline: BASELINE, migration: PERFORMANCE_MIGRATION, samples: { before: 3, after: 30 }, scenarios: [] };
  const output = targetPath(parent, path.join(path.dirname(process.env.TARGET_CONTEXT_FILE), "performance-db.json"));
  for (const count of [36500,100000]) {
    const context = allocateDatabase(parent, "clean");
    try {
      await createIsolatedDatabase(context);
      migrateIsolated(context, { through: BASELINE });
      await preparePerformanceFixture(context, count, true);
      const scenario = { historyOrders: count, activeCounterOrders: 100, activeTables: 5 };
      evidence.scenarios.push(scenario);
      scenario.before = await benchmark(context, "before", evidence.samples.before);
      atomicJson(parent, output, evidence);
      scenario.visibility = await comparePerformanceVisibility(context);
      await databaseSql(context,"analyze;");
      scenario.after = await benchmark(context, "after", evidence.samples.after);
      assert.ok((await verifyHistory(context.database,context.container)).ok, "Performance migration history mismatch");
      atomicJson(parent, output, evidence);
    } finally { await dropIsolatedDatabase(context); }
  }
  console.log("DB performance evidence: " + output);
}
