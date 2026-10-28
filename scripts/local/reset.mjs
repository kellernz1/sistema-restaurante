import {guardEntry,resolveTarget,authorizeOperation} from "../target-safety.mjs";

import { createBackup } from "../target-operations.mjs";
import {confirmWord,isMain} from "./lib.mjs";
import {runSupabase} from "../target-operations.mjs";
await guardEntry(import.meta.url,"reset");


export async function resetDatabase(context) {
 authorizeOperation(context,"reset");

  const confirmed = await confirmWord(
    "This backs up and then resets the local database. Type RESETAR to continue.",
    "RESETAR",
  );
  if (!confirmed) throw new Error("Database reset cancelled.");

  await createBackup(resolveTarget(),{});
  runSupabase(resolveTarget(),["db", "reset", "--local"]);
  console.log("Local database reset complete. Run `npm run seed:demo` to recreate demo data.");
}

if (isMain(import.meta.url)) {
  await resetDatabase(resolveTarget());
}
