import {validateTargetEnvironment,authorizeOperation,targetPath,assertExecution,resolveTarget} from "../target-safety.mjs";


import { spawn } from "../target-process.mjs";
import fs from "node:fs";
import path from "node:path";
import {ROOT} from "./lib.mjs";

export function command(context,command, args, { input, output, timeout = 120000, env = {} } = {}) {
  validateTargetEnvironment(context,env);
  const database=command==="docker"&&args.some(a=>["psql","pg_dump","pg_restore","createdb","dropdb"].includes(a));
  if(database)assertExecution(context,command,args,{input,output});else authorizeOperation(context,command==="docker"&&["info","pg_isready"].some(value=>args.includes(value))?"boot":context.profile==="disposable"?"file":"runtime");
  if(output)targetPath(context,output);
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
export function rotateLog(context,file, maximum = 5 * 1024 * 1024, copies = 3) {
  authorizeOperation(context,context.profile==="disposable"?"file":"runtime");targetPath(context,file);
  if (!fs.existsSync(file) || fs.statSync(file).size < maximum) return;
  fs.rmSync(`${file}.${copies}`, { force: true });
  for (let i = copies - 1; i >= 1; i--) if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
  fs.renameSync(file, `${file}.1`);
}
export function logLine(context,name, text) {
  authorizeOperation(context,"runtime");const directory=targetPath(context,path.join(context.root,"logs"));if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error("Invalid log name");
  fs.mkdirSync(directory, { recursive: true });
  const file = targetPath(context,path.join(directory, `${name}.log`)); rotateLog(resolveTarget(),file);
  fs.appendFileSync(file, `${new Date().toISOString()} ${text}\n`, "utf8");
}
