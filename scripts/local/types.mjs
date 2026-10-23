import fs from "node:fs";
import path from "node:path";

import { isMain, ROOT, runSupabase } from "./lib.mjs";

export function generateDatabaseTypes() {
  const result = runSupabase(
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    { capture: true },
  );
  if (!result.stdout.includes("export type Database")) {
    throw new Error("Supabase CLI returned unexpected type output.");
  }

  const destination = path.join(ROOT, "src", "types", "database.types.ts");
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, result.stdout, "utf8");
  fs.renameSync(temporary, destination);
  console.log(`Generated ${path.relative(ROOT, destination)}.`);
}

if (isMain(import.meta.url)) {
  generateDatabaseTypes();
}
