import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "../scripts/target-process.mjs";
import { observeProcesses } from "../scripts/integration/process-observation.mjs";

test("readiness output cannot hide a process that exits during observation", async () => {
  const child = spawn(process.execPath, ["-e", "console.log('ready');setTimeout(()=>process.exit(0),80)"], {
    stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
  });
  try {
    await once(child.stdout, "data");
    await assert.rejects(observeProcesses({
      durationMs: 1000,
      intervalMs: 20,
      check: () => assert.equal(child.exitCode, null, "Process exited after readiness"),
    }), /Process exited after readiness/);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});
