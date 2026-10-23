import fs from "node:fs";
import path from "node:path";

import {
  ensureDirectory,
  findDbContainer,
  isMain,
  pipeProcessToFile,
  ROOT,
} from "./lib.mjs";

const BACKUP_DIR = path.join(ROOT, "backups");
const MAX_BACKUPS = 14;

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function createBackup() {
  ensureDirectory(BACKUP_DIR);
  const container = findDbContainer();
  const destination = path.join(BACKUP_DIR, `${timestamp()}.sql`);

  console.log(`Creating backup at ${path.relative(ROOT, destination)}...`);
  await pipeProcessToFile(
    "docker",
    [
      "exec",
      container,
      "pg_dump",
      "--username=postgres",
      "--dbname=postgres",
      "--no-owner",
      "--no-privileges",
      "--schema=public",
      "--schema=auth",
      "--schema=storage",
    ],
    destination,
  );

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((file) => /^\d{4}-\d{2}-\d{2}_\d{6}\.sql$/.test(file))
    .sort()
    .reverse();
  for (const oldBackup of backups.slice(MAX_BACKUPS)) {
    fs.rmSync(path.join(BACKUP_DIR, oldBackup));
  }

  console.log(`Backup complete: ${destination}`);
  return destination;
}

if (isMain(import.meta.url)) {
  await createBackup();
}
