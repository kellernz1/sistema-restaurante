import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { command } from "./operations-process.mjs";
import { findDbContainer, isMain, ROOT, isProcessRunning } from "./lib.mjs";
import { atomicJson, readOperationsPolicy, patchOperationsState, operationsDirectory } from "../../src/lib/operations.ts";
import { localMigrations, verifyHistory } from "./migration-history.mjs";

export const BACKUP_DIR = path.join(ROOT, "backups");
export const migrationFiles = () => localMigrations().map(file=>file.file);
export async function checksum(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
export function backupName(date = new Date()) { return `${date.toISOString().replace(/[:.]/g, "-")}_${randomUUID()}.dump`; }
export function publishFile(temporary, destination) { fs.linkSync(temporary, destination); fs.unlinkSync(temporary); }
export async function atomicDump(destination, produce, verify) {
  const temporary=`${destination}.${randomUUID()}.tmp`;
  try { await produce(temporary); await verify(temporary); publishFile(temporary,destination); }
  finally { fs.rmSync(temporary,{force:true}); }
}
export function assertVersion(version, maximum = migrationFiles().at(-1).split("_")[0]) {
  if (typeof version !== "string" || !/^\d+$/.test(version) || version > maximum) throw new Error("Unsupported or newer migration version");
}
export async function validateBackup(file, { container = findDbContainer(), legacy = false } = {}) {
  if (!fs.existsSync(`${file}.json`)) {
    if (legacy && file.endsWith(".sql")) return { format: "legacy-sql", migration: null, sha256: await checksum(file) };
    throw new Error("Backup manifest required");
  }
  const manifest = JSON.parse(fs.readFileSync(`${file}.json`, "utf8"));
  assertVersion(manifest.migration);
  if(manifest.app_migration)assertVersion(manifest.app_migration);
  if(typeof manifest.created_at!=="string"||!Number.isFinite(Date.parse(manifest.created_at))||typeof manifest.app_version!=="string")throw new Error("Invalid backup provenance");
  if (manifest.result !== "valid" || manifest.format !== "pg-custom-v1" || manifest.file !== path.basename(file) || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes !== fs.statSync(file).size || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.sha256 !== await checksum(file)) throw new Error("Backup manifest/checksum mismatch");
  await command("docker", ["exec", "-i", container, "pg_restore", "--file=/dev/null"], { input: fs.readFileSync(file),timeout:600000 });
  return manifest;
}
export function retainedFiles(manifests, daily = 14, weekly = 8) {
  const sorted = [...manifests].sort((a,b) => b.created_at.localeCompare(a.created_at));
  const keep = new Set(sorted.slice(0,1).map(value => value.file)), days = new Set(), weeks = new Set();
  for (const value of sorted) {
    const date = new Date(value.created_at), day = date.toISOString().slice(0,10);
    const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0,10);
    if (!days.has(day) && days.size < daily) { days.add(day); keep.add(value.file); }
    if (!weeks.has(week) && weeks.size < weekly) { weeks.add(week); keep.add(value.file); }
  }
  return keep;
}
async function retention(directory, policy, container, current) {
  const valid = [];
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith(".dump"))) {
    try { valid.push(await validateBackup(path.join(directory,name), {container})); } catch { /* Invalid and legacy files are never automatically deleted. */ }
  }
  const keep = retainedFiles(valid, policy.daily, policy.weekly);
  keep.add(path.basename(current));
  for (const value of valid) if (!keep.has(value.file)) {
    fs.unlinkSync(path.join(directory,value.file)); fs.unlinkSync(path.join(directory,`${value.file}.json`));
  }
}
export async function copyExternal(file, directory) {
  if (!fs.statSync(directory).isDirectory()) throw new Error("External destination unavailable");
  const destination = path.join(directory, path.basename(file));
  if (path.resolve(destination) === path.resolve(file)) throw new Error("External destination must differ from backup source");
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.copyFileSync(file, temporary, fs.constants.COPYFILE_EXCL);
    if (await checksum(temporary) !== await checksum(file)) throw new Error("External checksum mismatch");
    publishFile(temporary, destination);
    fs.copyFileSync(`${file}.json`, `${destination}.json`, fs.constants.COPYFILE_EXCL);
  } finally { fs.rmSync(temporary, {force:true}); }
}
export async function createBackup({ database = "postgres", directory = BACKUP_DIR, record = true, reason = "manual", container = findDbContainer() } = {}) {
  if (database !== "postgres" && !/^mesa_(restore|source|clean)_[a-f0-9]{24}$/.test(database)) throw new Error("Unsafe backup database");
  fs.mkdirSync(directory, {recursive:true}); fs.mkdirSync(operationsDirectory, {recursive:true});
  const lock = path.join(operationsDirectory, `backup-${database}.lock`);
  const file = path.join(directory,backupName()), temporary = `${file}.tmp`, created_at = new Date().toISOString();
  if (fs.existsSync(lock)) {
    const raw=fs.readFileSync(lock,"utf8");let previous;
    try{previous=JSON.parse(raw);}catch{previous=null;}
    const owner=typeof previous==="object"?previous?.pid:Number(raw);
    if (isProcessRunning(owner)) throw new Error("Backup already running");
    if(previous?.file&&path.dirname(previous.file)===path.resolve(directory)) {
      const prefix=path.basename(previous.file);
      for(const name of fs.readdirSync(directory))if(name.startsWith(prefix)&&name.endsWith(".tmp"))fs.unlinkSync(path.join(directory,name));
    }
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, JSON.stringify({pid:process.pid,file}), {flag:"wx"});
  if (record) patchOperationsState({last_attempt:created_at,result:"running",reason});
  try {
    const migration = (await command("docker",["exec",container,"psql","-X","-U","supabase_admin","-d",database,"-Atc","select max(version) from supabase_migrations.schema_migrations"])).trim();
    assertVersion(migration);
    const historyWarning=!(await verifyHistory(database,container)).ok;
    await atomicDump(temporary,
      output=>command("docker",["exec",container,"pg_dump","-U","supabase_admin","-d",database,"--format=custom"],{output,timeout:600000}),
      output=>command("docker",["exec","-i",container,"pg_restore","--file=/dev/null"],{input:fs.readFileSync(output),timeout:600000}));
    const app = JSON.parse(fs.readFileSync(path.join(ROOT,"package.json"),"utf8"));
    const manifest = {format:"pg-custom-v1",file:path.basename(file),created_at,app_version:app.version,app_migration:migrationFiles().at(-1).split("_")[0],migration,history_warning:historyWarning,bytes:fs.statSync(temporary).size,sha256:await checksum(temporary),result:"valid",reason};
    publishFile(temporary,file);
    atomicJson(`${file}.json`,manifest);
    const policy = readOperationsPolicy();
    if (record) patchOperationsState({last_success:created_at,file,result:"valid",migration_warning:historyWarning,external:policy.external_directory?"pending":"disabled",external_directory:policy.external_directory});
    if (record && policy.external_directory) {
      try { await copyExternal(file,policy.external_directory); patchOperationsState({external:"valid",external_at:new Date().toISOString()}); }
      catch { patchOperationsState({external:"failed",external_at:new Date().toISOString()}); }
    }
    if (record) await retention(directory,policy,container,file);
    if(record){try{await command("docker",["exec","-i",container,"psql","-X","-U","supabase_admin","-d",database,"-v","ON_ERROR_STOP=1"],{input:`do $$begin if to_regprocedure('public.license_tick(timestamptz)')is not null then perform public.license_tick('${created_at}'::timestamptz);end if;end $$;`,timeout:10000});}catch{console.error("Backup remains valid; license clock observation unavailable.");}}
    console.log(`Valid backup: ${file}`);
    return file;
  } catch (error) {
    if (record) patchOperationsState({result:"failed"});
    throw error;
  } finally { fs.rmSync(temporary,{force:true}); fs.rmSync(lock,{force:true}); }
}
if (isMain(import.meta.url)) await createBackup({reason:process.env.BACKUP_REASON||"manual"});
