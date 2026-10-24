import fs from "node:fs";
import path from "node:path";

import { findDbContainer, isMain, pipeFileToProcess, ROOT } from "./lib.mjs";

const testFiles = [
  "rls_smoke_test.sql",
  "table_self_service_test.sql",
  "offsite_orders_test.sql",
  "whatsapp_bot_test.sql",
  "local_security_test.sql",
  "cashier_orders_test.sql",
  "employee_access_test.sql",
  "distance_delivery_test.sql",
];

export async function runSqlTests() {
  const container = findDbContainer();
  for (const file of testFiles) {
    const source = path.join(ROOT, "supabase", "tests", file);
    if (!fs.existsSync(source)) throw new Error(`Missing SQL test: ${file}`);
    console.log(`Running SQL test ${file}...`);
    await pipeFileToProcess(
      source,
      "docker",
      ["exec", "-i", container, "psql", "--username=postgres", "--dbname=postgres", "--set", "ON_ERROR_STOP=on"],
    );
  }
  console.log(`${testFiles.length} SQL test files passed.`);
}

if (isMain(import.meta.url)) {
  await runSqlTests();
}
