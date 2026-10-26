import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const LOCAL_STATE_DIR = path.join(ROOT, ".local-secrets");
export const LOG_DIR = path.join(ROOT, "logs");
export const SUPABASE_CLI_VERSION = "2.121.0";
export const isWindows = process.platform === "win32";

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;
}

export function executable(name) {
  return isWindows ? `${name}.cmd` : name;
}

export function run(command, args, options = {}) {
  const npmLauncher = isWindows && /^(npm|npx)\.cmd$/i.test(path.basename(command));
  if (npmLauncher) {
    const name = path.basename(command, ".cmd");
    args = [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", `${name}-cli.js`), ...args];
    command = process.execPath;
  }
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...options.env },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} exited with code ${result.status}.${detail}`);
  }
  return result;
}

export function runSupabase(args, options = {}) {
  return run(
    executable("npx"),
    ["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...args],
    options,
  );
}

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadEnvFile(file = path.join(ROOT, ".env.local")) {
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
}

export function writeEnvFile(values, file = path.join(ROOT, ".env.local")) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}`);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${lines.join(os.EOL)}${os.EOL}`, "utf8");
  fs.renameSync(temporary, file);
}

export function getLanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push({ name, address: entry.address });
      }
    }
  }
  return addresses;
}

export function resolveLanIp(explicitIp) {
  const override = explicitIp || process.env.LAN_IP;
  if (override) return override;
  return getLanAddresses()[0]?.address ?? "127.0.0.1";
}

export function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

export async function confirmWord(question, expected) {
  if (!stdin.isTTY) return false;
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`${question}\n> `);
    return answer.trim() === expected;
  } finally {
    prompt.close();
  }
}

export function findDbContainer() {
  const result = run(
    "docker",
    ["ps", "--format", "{{.Names}}"],
    { capture: true },
  );
  const names = result.stdout.split(/\r?\n/).filter((name) => name.startsWith("supabase_db_"));
  const exact = names.find((name) => name === "supabase_db_sistema-restaurante");
  if (exact) return exact;
  if (names.length === 1) return names[0];
  if (names.length === 0) throw new Error("No running local Supabase database container was found.");
  throw new Error(`Multiple Supabase database containers found: ${names.join(", ")}`);
}

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function startDetached(scriptArgs, logName, env = {}) {
  ensureDirectory(LOG_DIR);
  const output = fs.openSync(path.join(LOG_DIR, `${logName}.log`), "a");
  const errors = fs.openSync(path.join(LOG_DIR, `${logName}.error.log`), "a");
  const child = spawn(process.execPath, scriptArgs, {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", output, errors],
  });
  child.unref();
  fs.closeSync(output);
  fs.closeSync(errors);
  return child.pid;
}

export async function pipeFileToProcess(file, command, args) {
  await new Promise((resolve, reject) => {
    const input = fs.openSync(file, "r");
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: [input, "inherit", "inherit"],
    });
    fs.closeSync(input);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

export async function pipeProcessToFile(command, args, file) {
  await new Promise((resolve, reject) => {
    const output = fs.openSync(file, "w");
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ["ignore", output, "inherit"],
    });
    fs.closeSync(output);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}
