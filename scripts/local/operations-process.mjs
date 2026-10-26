import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, LOG_DIR } from "./lib.mjs";

export function command(command, args, { input, output, timeout = 120000, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const file = output ? fs.openSync(output, "wx", 0o600) : null;
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, env: { ...process.env, ...env }, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false, writeError = null;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", bytes => {
      if(settled||writeError)return;
      try { if (file !== null) fs.writeSync(file, bytes); else if (stdout.length < 20000000) stdout += bytes; }
      catch(error){writeError=error;child.kill("SIGKILL");}
    });
    child.stderr.on("data", bytes => { if (stderr.length < 200000) stderr += bytes; });
    child.on("error", error => { if(settled)return;settled=true;clearTimeout(timer); if (file !== null) fs.closeSync(file); reject(error); });
    child.on("close", code => {
      if(settled)return;settled=true;
      clearTimeout(timer);
      if(file!==null){try{fs.fsyncSync(file);}catch(error){writeError=error;}finally{fs.closeSync(file);}}
      if(writeError)reject(writeError);
      else if (code !== 0) reject(new Error(`${command} failed (${code}): ${stderr.slice(-4000)}`)); else resolve(stdout);
    });
    if (input !== undefined) { child.stdin.on("error", () => {}); child.stdin.end(input); }
  });
}
export async function waitFor(check, label, milliseconds = 180000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    try { await check(); return; } catch { console.log(`Waiting for ${label}...`); }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`${label} did not become ready within ${milliseconds / 1000}s`);
}
export function rotateLog(file, maximum = 5 * 1024 * 1024, copies = 3) {
  if (!fs.existsSync(file) || fs.statSync(file).size < maximum) return;
  fs.rmSync(`${file}.${copies}`, { force: true });
  for (let i = copies - 1; i >= 1; i--) if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
  fs.renameSync(file, `${file}.1`);
}
export function logLine(name, text) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `${name}.log`); rotateLog(file);
  fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`, "utf8");
}
