import {resolveTarget} from "../target-safety.mjs";
import { sqlTestDatabase } from "./sql-test-target.mjs";
import assert from "node:assert/strict";
import { spawn } from "../target-process.mjs";
import path from "node:path";
import {findDbContainer,ROOT,run} from "./lib.mjs";
import {pipeFileToProcess} from "../target-operations.mjs";

export async function runCounterConcurrencyTest() {
  const container = findDbContainer();
  const prefix = ["exec", "-i", container, "psql", "-U", "postgres", "-d", sqlTestDatabase(), "-v", "ON_ERROR_STOP=1"];
  const existing = run("docker", [...prefix, "-tA", "-c", "select count(*) from public.counter_daily_numbers where business_date='9997-12-31'"], { capture: true });
  assert.equal(existing.stdout.trim(), "0", "Concurrency sentinel date already exists");
  function connection() {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", [...prefix, "-tA"], { cwd: ROOT, windowsHide: true });
      let output = "", errors = "";
      child.stdout.on("data", (value) => { output += value; });
      child.stderr.on("data", (value) => { errors += value; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(Number(output.split(/\r?\n/).find((line) => /^\d+$/.test(line)))) : reject(new Error(errors)));
      child.stdin.end("begin; select public.next_counter_ticket('9997-12-31'); select pg_sleep(0.3); commit;");
    });
  }
  try {
    const results = await Promise.allSettled([connection(), connection()]);
    for (const result of results) if (result.status === "rejected") throw result.reason;
    const tickets = results.map((result) => result.value);
    assert.deepEqual([...tickets].sort((a, b) => a - b), [1, 2]);
    await pipeFileToProcess(resolveTarget(),path.join(ROOT, "supabase/tests/counter_concurrency_test.sql"), "docker", [...prefix, "-v", `first_ticket=${tickets[0]}`, "-v", `second_ticket=${tickets[1]}`]);
  } finally {
    run("docker", [...prefix, "-c", "delete from public.counter_daily_numbers where business_date='9997-12-31'"], { capture: true });
  }
}
