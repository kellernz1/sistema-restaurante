import { sqlTestDatabase } from "./sql-test-target.mjs";
import fs from "node:fs";
import path from "node:path";

import { findDbContainer, isMain, pipeFileToProcess, ROOT } from "./lib.mjs";

import { runCounterConcurrencyTest } from "./counter-concurrency-test.mjs";
import { runPrintConcurrencyTest } from "./print-concurrency-test.mjs";
import { runPrintDocumentConcurrencyTest } from "./print-document-concurrency-test.mjs";
import { runCashSessionConcurrencyTest } from "./cash-session-concurrency-test.mjs";

const testFiles = [
  "rls_smoke_test.sql",
  "table_self_service_test.sql",
  "offsite_orders_test.sql",
  "whatsapp_bot_test.sql",
  "local_security_test.sql",
  "cashier_orders_test.sql",
  "employee_access_test.sql",
  "distance_delivery_test.sql",
  "kitchen_print_test.sql",
  "print_reliability_test.sql",
  "cash_sessions_test.sql",
  "cash_delivery_fee_test.sql",
  "payments_currency_test.sql",
  "paraguay_contacts_test.sql",
  "counter_flow_test.sql",
  "atomic_kitchen_test.sql",
  "counter_concurrency_test.sql",
];

export async function runSqlTests() {
  const container = findDbContainer();
  for (const file of testFiles) {
    const source = path.join(ROOT, "supabase", "tests", file);
    if (!fs.existsSync(source)) throw new Error(`Missing SQL test: ${file}`);
    console.log(`Running SQL test ${file}...`);
    if (file === "counter_concurrency_test.sql") { await runCounterConcurrencyTest(); continue; }
    await pipeFileToProcess(
      source,
      "docker",
      ["exec", "-i", container, "psql", "--username=postgres", `--dbname=${sqlTestDatabase()}`, "--set", "ON_ERROR_STOP=on"],
    );
  }
  console.log(`${testFiles.length} SQL test files passed.`);
  await runPrintConcurrencyTest();
  await runPrintDocumentConcurrencyTest();
  await runCashSessionConcurrencyTest();
}

if (isMain(import.meta.url)) {
  await runSqlTests();
}
