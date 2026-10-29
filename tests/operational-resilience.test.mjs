import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import io from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFilesystemTarget } from "../scripts/target-safety.mjs";
import { writeOperationalJson, createOperationalLogger, fileRetryDelays, command } from "../scripts/target-operations.mjs";
import { SupervisorState, createSupervisorReporter, confirmProcessExit, stopRuntimeEvidence } from "../scripts/local/supervisor-state.mjs";
import { operationAlerts, operationsPolicySchema } from "../src/lib/operations.ts";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-operational-"));
  return { root, target: createFilesystemTarget(root), file: path.join(root, "state.json"), close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const failure = (code = "EPERM") => Object.assign(Error("Injected filesystem failure"), { code, syscall: "rename" });

test("atomic state retries the same temporary with exact bounded delays, preserving the old JSON", async () => {
  const f = fixture(), waits = [], sources = []; let calls = 0;
  fs.writeFileSync(f.file, '{"old":true}');
  try {
    await writeOperationalJson(f.target, f.file, { new: true }, { platform: "win32", wait: async ms => waits.push(ms), io: { ...io, rename: async (from, to) => {
      sources.push(from); if (++calls <= 5) { assert.equal(fs.readFileSync(to, "utf8"), '{"old":true}'); throw failure(calls % 2 ? "EPERM" : "EBUSY"); } await io.rename(from, to);
    } } });
    assert.deepEqual(waits, [...fileRetryDelays]); assert.equal(new Set(sources).size, 1); assert.equal(calls, 6);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file, "utf8")), { new: true });
    assert.deepEqual(fs.readdirSync(f.root), ["state.json"]);
  } finally { f.close(); }
});

test("permanent error and failed cleanup retain the original error and previous JSON", async () => {
  const f = fixture(), original = failure(), cleanup = failure("EBUSY"), waits = []; let calls = 0;
  fs.writeFileSync(f.file, '{"old":true}');
  try {
    await assert.rejects(writeOperationalJson(f.target, f.file, { bad: true }, { platform: "win32", wait: async ms => waits.push(ms), io: { ...io, rename: async () => { calls++; throw original; }, rm: async () => { throw cleanup; } } }), error => error === original && error.cleanupError === cleanup);
    assert.equal(calls, 6); assert.equal(waits.length, 10); assert.equal(fs.readFileSync(f.file, "utf8"), '{"old":true}');
  } finally { f.close(); }
});

test("nontransient failures are not retried and unauthorized paths never reach I/O", async () => {
  const f = fixture(); let calls = 0;
  try {
    await assert.rejects(writeOperationalJson(f.target, f.file, {}, { io: { ...io, rename: async () => { calls++; throw failure("ENOSPC"); } } }), { code: "ENOSPC" });
    assert.equal(calls, 1);
    await assert.rejects(writeOperationalJson({}, f.file, {}));
    await assert.rejects(writeOperationalJson(f.target, path.join(f.root, "..", "outside.json"), {}));
    assert.equal(calls, 1);
  } finally { f.close(); }
});

test("simultaneous publications serialize, readers only see complete JSON and rejection does not poison the queue", async () => {
  const f = fixture(), committed = []; let active = 0, maximum = 0;
  try {
    const options = { io: { ...io, rename: async (from, to) => { maximum = Math.max(maximum, ++active); try { await new Promise(resolve => setTimeout(resolve, 2)); await io.rename(from, to); committed.push(JSON.parse(await io.readFile(to, "utf8")).index); } finally { active--; } } } };
    // Match the real process observer cadence; a 1ms loop tests perpetual host contention instead.
    const reader = setInterval(() => { if (fs.existsSync(f.file)) assert.ok(Number.isInteger(JSON.parse(fs.readFileSync(f.file, "utf8")).index)); }, 250);
    try { await Promise.all(Array.from({ length: 20 }, (_, index) => writeOperationalJson(f.target, f.file, { index }, options))); }
    finally { clearInterval(reader); }
    assert.equal(maximum, 1); assert.deepEqual(committed, Array.from({ length: 20 }, (_, i) => i));
    await assert.rejects(writeOperationalJson(f.target, f.file, {}, { io: { ...io, rename: async () => { throw failure("ENOSPC"); } } }));
    await writeOperationalJson(f.target, f.file, { recovered: true });
    assert.equal(JSON.parse(fs.readFileSync(f.file, "utf8")).recovered, true);
  } finally { f.close(); }
});

if (process.platform === "win32") test("real Windows handle without delete sharing blocks replacement, then recovery preserves JSON", async () => {
  const f = fixture(), marker = path.join(f.root, "locked"); let child;
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  fs.writeFileSync(f.file, '{"old":true}');
  try {
    child = command(f.target, "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; $handle=[IO.File]::Open(${quote(f.file)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { [IO.File]::WriteAllText(${quote(marker)},'locked'); Start-Sleep -Milliseconds 2200 } finally { $handle.Dispose() }`]);
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(fs.existsSync(marker), "Windows test handle did not become ready");
    await assert.rejects(writeOperationalJson(f.target, f.file, { new: true }), error => ["EPERM", "EBUSY"].includes(error.code));
    assert.equal(fs.readFileSync(f.file, "utf8"), '{"old":true}');
    await child; child = null; await writeOperationalJson(f.target, f.file, { recovered: true });
    assert.equal(JSON.parse(fs.readFileSync(f.file, "utf8")).recovered, true);
  } finally { if (child) await child.catch(() => {}); f.close(); }
});

test("partial rotation resumes its unfinished step; append failures do not replay ambiguous bytes", async () => {
  const f = fixture(), directory = path.join(f.root, "logs"), file = path.join(directory, "worker.log"); let blocked = true, appendFail = false, movedTwo = 0;
  fs.mkdirSync(directory); fs.writeFileSync(file, "A".repeat(100)); fs.writeFileSync(`${file}.1`, "B"); fs.writeFileSync(`${file}.2`, "C");
  try {
    const log = createOperationalLogger(f.target, { maximum: 100, platform: "win32", wait: async () => {}, io: { ...io,
      rename: async (from, to) => { if (from === `${file}.2`) movedTwo++; if (from === `${file}.1` && blocked) throw failure(); await io.rename(from, to); },
      appendFile: async (name, bytes) => { if (appendFail) { await io.appendFile(name, bytes.subarray(0, 2)); throw failure(); } await io.appendFile(name, bytes); },
    } });
    await assert.rejects(log("worker", "first"), { code: "EPERM" }); assert.equal(movedTwo, 1);
    blocked = false; await log("worker", "second"); assert.equal(movedTwo, 1); assert.equal(fs.readFileSync(`${file}.3`, "utf8"), "C");
    appendFail = true; await assert.rejects(log("worker", "ambiguous")); assert.ok(fs.statSync(file).size <= 100);
    appendFail = false; for (let i = 0; i < 10; i++) await log("worker", "bounded");
    assert.ok(fs.readdirSync(directory).length <= 4); for (const name of fs.readdirSync(directory)) assert.ok(fs.statSync(path.join(directory, name)).size <= 100);
  } finally { f.close(); }
});

test("log queue is bounded even when the filesystem is stalled", async () => {
  const f = fixture(); let release; const held = new Promise(resolve => { release = resolve; });
  try {
    const log = createOperationalLogger(f.target, { maximumPending: 80, io: { ...io, mkdir: async (...args) => { await held; return io.mkdir(...args); } } });
    const first = log("worker", "A".repeat(20));
    await assert.rejects(log("worker", "B".repeat(80)), { code: "ELOGQUEUE" }); release(); await first;
  } finally { release?.(); f.close(); }
});

test("supervisor publication failures degrade without throwing; retry recovers and unchanged PIDs are not republished", async () => {
  const writes = [], errors = [], failures = new Set(); let blocked = true;
  const state = new SupervisorState({ stateFile: "pids", heartbeatFile: "heartbeat", processes: () => ({ app: 42 }), restarts: {}, failures, report: error => errors.push(error), write: async (file, value) => { if (file === "pids" && blocked) throw failure(); writes.push({ file, value }); } });
  await state.publish(true); await state.publish(true);
  assert.equal(writes.at(-1).value.mode, "degraded"); assert.equal(errors.length, 2);
  assert.equal(operationAlerts({ supervisor: writes.at(-1).value }, operationsPolicySchema.parse({}), 1e10).supervisor, true);
  blocked = false; await state.publish(true); await state.publish(true);
  assert.equal(writes.filter(value => value.file === "pids").length, 1); assert.equal(writes.at(-1).value.mode, "normal");
  assert.equal(operationAlerts({ supervisor: writes.at(-1).value }, operationsPolicySchema.parse({}), 1e10).supervisor, false);
});

test("heartbeat publication failures stay conservative and later recover", async () => {
  const failures = new Set(); let blocked = true, last;
  const state = new SupervisorState({ stateFile: "pids", heartbeatFile: "heartbeat", processes: () => ({}), restarts: {}, failures, report: () => {}, write: async (file, value) => { if (file === "heartbeat" && blocked) throw failure(); if (file === "heartbeat") last = value; } });
  await state.publish(true); assert.ok(failures.has("state-write:heartbeat")); assert.equal(last, undefined);
  assert.equal(operationAlerts({}, operationsPolicySchema.parse({}), 1e10).supervisor, true);
  blocked = false; await state.publish(true); assert.equal(last.mode, "normal");
});

test("stderr diagnostics are bounded and retain original filesystem error details", () => {
  const output = [], report = createSupervisorReporter(text => output.push(text)), original = failure();
  original.cleanupError = failure("EBUSY"); for (let i = 0; i < 1000; i++) report(original, "pids");
  assert.equal(output.length, 2); assert.match(output[0], /Injected filesystem failure/); assert.match(output[1], /EBUSY/);
  assert.doesNotThrow(() => createSupervisorReporter(() => { throw failure(); })(original, "pids"));
});

test("shutdown confirms real exit, retains a denial and tolerates an already-exited process", async () => {
  let time = 0, running = true, signals = 0;
  const common = { alive: () => running, now: () => time, wait: async ms => { time += ms; }, timeout: 100 };
  const denied = await confirmProcessExit(42, { ...common, signal: async () => { throw failure(); } });
  assert.equal(denied.stopped, false); assert.equal(denied.error.code, "EPERM");
  running = false; const gone = await confirmProcessExit(42, { ...common, signal: async () => signals++ });
  assert.equal(gone.alreadyExited, true); assert.equal(signals, 0);
  running = true; const stopped = await confirmProcessExit(42, { ...common, signal: async () => { running = false; } }); assert.equal(stopped.stopped, true);
});

test("stop never removes evidence or stops children under a live supervisor after denial", async () => {
  const calls = [], state = { supervisor: 1, app: 2 };
  const dependencies = { stop: async pids => { calls.push(pids); return [{ stopped: false }]; }, release: async () => calls.push("release"), remove: async () => calls.push("remove") };
  await assert.rejects(stopRuntimeEvidence(state, dependencies), /Supervisor is still running/); assert.deepEqual(calls, [[1]]);
  calls.length = 0; dependencies.stop = async pids => { calls.push(pids); return [{ stopped: pids.includes(1) }]; };
  await assert.rejects(stopRuntimeEvidence(state, dependencies), /children are still running/); assert.equal(calls.includes("release"), false);
  calls.length = 0; dependencies.stop = async pids => { calls.push(pids); return [{ stopped: true }]; };
  await stopRuntimeEvidence(state, dependencies); assert.deepEqual(calls.slice(-2), ["release", "remove"]);
});
