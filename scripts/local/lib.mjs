import {validateTargetEnvironment,directoryTarget,resolveTarget,databaseTarget,authorizeOperation,assertExecution,targetPath,targetKeys,authorizeSql,assertDirectory,requireTransport} from "../target-safety.mjs";


import { spawn, spawnSync } from "../target-process.mjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {providerMetadata,providerCompose,readProviderSecrets,prepareProviderCli} from "../target-provider.mjs";

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
  if(command==="docker"&&args.some(a=>["psql","pg_dump","pg_restore","createdb","dropdb"].includes(a)))assertExecution(resolveTarget(),command,args,options);

  const npmLauncher = isWindows && /^(npm|npx)\.cmd$/i.test(path.basename(command));
  if (npmLauncher) {
    const name = path.basename(command, ".cmd");
    args = [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", `${name}-cli.js`), ...args];
    command = process.execPath;
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
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

export function runSupabase(context,args, options = {}) {
  const target=context;requireTransport(target);validateTargetEnvironment(target,options.env);
  if(!args.includes("--workdir"))args=[...args,"--workdir",target.root];
  authorizeOperation(target,args[0]==="start"?"boot":args[0]==="db"&&args[1]==="reset"?"reset":args[0]==="migration"&&args[1]==="repair"?"repair":args[0]==="migration"||args[0]==="db"?"migration":"runtime");
  const work=args.indexOf("--workdir");if(work>=0)targetPath(target,args[work+1]);
  const urlAt=args.indexOf("--db-url");if(urlAt>=0){const url=new URL(args[urlAt+1]);if(url.hostname!=="127.0.0.1"||Number(url.port)!==target.dbPort)throw Error("Mixed migration endpoint refused");databaseTarget(target,decodeURIComponent(url.pathname.slice(1)));}

  const workIndex=args.indexOf("--workdir");
  const root=workIndex>=0?path.resolve(args[workIndex+1]):ROOT;
  const provider=providerMetadata(root);
  if(provider){
    if(args[0]==="start"||args[0]==="stop"){
      const result=providerCompose(resolveTarget(),args[0]==="start"?["up","-d"]:["stop"],{timeout:options.timeout});
      if(!options.capture)console.log("Restaurant provider "+args[0]+" completed; secrets suppressed.");
      return {...result,stdout:"Restaurant provider ready\n",stderr:""};
    }
    const secrets=readProviderSecrets(root);
    if(args[0]==="status"){
      const values={API_URL:provider.apiUrl,DB_URL:`postgresql://postgres@127.0.0.1:${provider.dbPort}/postgres`,PUBLISHABLE_KEY:secrets.SUPABASE_PUBLISHABLE_KEY,SECRET_KEY:secrets.SUPABASE_SECRET_KEY,ANON_KEY:secrets.ANON_KEY,SERVICE_ROLE_KEY:secrets.SERVICE_ROLE_KEY};
      return {status:0,stdout:options.capture?Object.entries(values).map(([k,v])=>k+"="+v).join("\n"):"Restaurant provider configured; credentials suppressed.\n",stderr:""};
    }
    const transformed=args.filter((a,i)=>a!=="--local"&&a!=="--workdir"&&args[i-1]!=="--workdir");
    transformed.push("--workdir",prepareProviderCli(resolveTarget(),root));
    if(args.includes("--local"))transformed.push("--db-url",`postgresql://postgres@127.0.0.1:${provider.dbPort}/postgres?sslmode=disable`);
    const result=run(executable("npx"),["--yes",`supabase@${SUPABASE_CLI_VERSION}`,...transformed],{...options,capture:true,allowFailure:true,env:{...options.env,PGPASSWORD:secrets.POSTGRES_PASSWORD}});
    if(result.status!==0&&!options.allowFailure)throw new Error("Official provider CLI command failed; output suppressed to protect credentials");
    if(!options.capture)console.log("Official provider CLI command completed; secrets suppressed.");
    return result;
  }
  return run(
    executable("npx"),
    ["--yes", `supabase@${SUPABASE_CLI_VERSION}`, ...args],
    {...options,env:{...options.env,...(targetKeys(target).dbPassword?{PGPASSWORD:targetKeys(target).dbPassword}:{})}},
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

export function writeEnvFile(context,values, file = path.join(context.root, ".env.local")) {
  authorizeOperation(context,"runtime");targetPath(context,file);
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}`);
  const temporary = `${file}.tmp`;
  targetPath(context,temporary);fs.writeFileSync(temporary, `${lines.join(os.EOL)}${os.EOL}`, {encoding:"utf8",flag:"wx",mode:0o600});
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

export function ensureDirectory(context,directory) {
  authorizeOperation(context,"runtime");directory=assertDirectory(context,directory);
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

export function findDbContainer() { return resolveTarget().container; }

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Access denied is not proof that a process exited.
    return error.code !== "ESRCH";
  }
}

export function startDetached(context,scriptArgs, logName, env = {}) {
  authorizeOperation(context,"runtime");validateTargetEnvironment(context,env);if(!scriptArgs.length||!/[.]m?js$/.test(scriptArgs[0]))throw Error("Owned script path required");targetPath(context,path.resolve(context.root,scriptArgs[0]));if(!/^[a-zA-Z0-9_-]+$/.test(logName))throw Error("Invalid process log name");const directory=targetPath(context,path.join(context.root,"logs"));
  ensureDirectory(context,directoryTarget(context,directory));
  const output = fs.openSync(targetPath(context,path.join(directory, `${logName}.log`)), "a");
  const errors = fs.openSync(targetPath(context,path.join(directory, `${logName}.error.log`)), "a");
  const child = spawn(process.execPath, scriptArgs, {
    cwd: context.root,
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

export async function pipeFileToProcess(context,file, command, args) {
  authorizeOperation(context,"sql");authorizeSql(context,fs.readFileSync(file,"utf8"));assertExecution(context,command,args);
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

export async function pipeProcessToFile(context,command, args, file) {
  authorizeOperation(context,"sql");targetPath(context,file);assertExecution(context,command,args);
  await new Promise((resolve, reject) => {
    const output = fs.openSync(file, "wx",0o600);
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ["ignore", output, "inherit"],
    });
    fs.closeSync(output);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}
