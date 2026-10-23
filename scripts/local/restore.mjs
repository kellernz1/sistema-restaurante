import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  confirmWord,
  findDbContainer,
  isMain,
  pipeFileToProcess,
  readOption,
  ROOT,
} from "./lib.mjs";

const BACKUP_DIR = path.join(ROOT, "backups");

async function selectBackup() {
  const requested = readOption("--file");
  if (requested) {
    const resolved = path.resolve(ROOT, requested);
    const relative = path.relative(BACKUP_DIR, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("The restore file must be inside the backups directory.");
    }
    if (!fs.existsSync(resolved)) throw new Error(`Backup not found: ${resolved}`);
    return resolved;
  }

  if (!stdin.isTTY) throw new Error("Use --file backups/<file>.sql in a non-interactive terminal.");
  const backups = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((file) => file.endsWith(".sql")).sort().reverse()
    : [];
  if (backups.length === 0) throw new Error("No SQL backups were found.");

  console.log("Available backups:");
  backups.forEach((file, index) => console.log(`${index + 1}. ${file}`));
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = Number.parseInt(await prompt.question("Choose a backup number:\n> "), 10);
    if (!Number.isInteger(answer) || answer < 1 || answer > backups.length) {
      throw new Error("Invalid backup selection.");
    }
    return path.join(BACKUP_DIR, backups[answer - 1]);
  } finally {
    prompt.close();
  }
}

export async function restoreBackup() {
  const backup = await selectBackup();
  const confirmed = await confirmWord(
    `This replaces local database data with ${path.basename(backup)}. Type RESTORE to continue.`,
    "RESTORE",
  );
  if (!confirmed) throw new Error("Restore cancelled.");

  const container = findDbContainer();
  await pipeFileToProcess(
    backup,
    "docker",
    ["exec", "-i", container, "psql", "--username=postgres", "--dbname=postgres", "--set", "ON_ERROR_STOP=on"],
  );
  console.log(`Restored ${path.basename(backup)}.`);
}

if (isMain(import.meta.url)) {
  await restoreBackup();
}
