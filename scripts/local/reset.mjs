import { createBackup } from "./backup.mjs";
import { confirmWord, isMain, runSupabase } from "./lib.mjs";

export async function resetDatabase() {
  const confirmed = await confirmWord(
    "This backs up and then resets the local database. Type RESETAR to continue.",
    "RESETAR",
  );
  if (!confirmed) throw new Error("Database reset cancelled.");

  await createBackup();
  runSupabase(["db", "reset", "--local"]);
  console.log("Local database reset complete. Run `npm run seed:demo` to recreate demo data.");
}

if (isMain(import.meta.url)) {
  await resetDatabase();
}
