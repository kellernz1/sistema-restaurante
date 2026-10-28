import {resolveTarget,databaseTarget} from "../target-safety.mjs";
import { sqlTestDatabase } from "./sql-test-target.mjs";
import fs from "node:fs";
import path from "node:path";

import {findDbContainer,isMain,ROOT} from "./lib.mjs";
import {pipeFileToProcess} from "../target-operations.mjs";

import { runCounterConcurrencyTest } from "./counter-concurrency-test.mjs";
import { runPrintConcurrencyTest } from "./print-concurrency-test.mjs";
import { runPrintDocumentConcurrencyTest } from "./print-document-concurrency-test.mjs";
import { runCashSessionConcurrencyTest } from "./cash-session-concurrency-test.mjs";
import {runServiceConcurrencyTest} from "./service-concurrency-test.mjs";
import {runApprovalConcurrencyTest} from "./approval-concurrency-test.mjs";
import {runCounterDiscountConcurrencyTest} from "./counter-discount-concurrency-test.mjs";
import {runRefundConcurrencyTest} from "./refund-concurrency-test.mjs";
import {licensingSql}from "../../tests/helpers/license-fixture.mjs";

const testFiles = [
  "licensing_test.sql",
  "refunds_test.sql",
  "pin_feedback_test.sql",
  "counter_discounts_test.sql",
  "approvals_test.sql",
  "rls_smoke_test.sql",
  "service_modes_test.sql",
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
    if(file==="licensing_test.sql"){await licensingSql(databaseTarget(resolveTarget(),sqlTestDatabase()),fs.readFileSync(source,"utf8"));console.log("Licensing SQL passed.");continue;}
    console.log(`Running SQL test ${file}...`);
    if (file === "counter_concurrency_test.sql") { await runCounterConcurrencyTest(); continue; }
    await pipeFileToProcess(resolveTarget(),
      source,
      "docker",
      ["exec", "-i", container, "psql", "--username=postgres", `--dbname=${sqlTestDatabase()}`, "--set", "ON_ERROR_STOP=on"],
    );
  }
  console.log(`${testFiles.length} SQL test files passed.`);
  await runPrintConcurrencyTest();
  await runPrintDocumentConcurrencyTest();
  await runCashSessionConcurrencyTest();
  await runServiceConcurrencyTest();
  await runApprovalConcurrencyTest();
  await runCounterDiscountConcurrencyTest();
  await runRefundConcurrencyTest();
}

if (isMain(import.meta.url)) {
  await runSqlTests();
}
