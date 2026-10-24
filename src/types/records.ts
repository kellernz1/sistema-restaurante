import type { Database } from "@/types/database.types";

// PostgREST computed helpers are opt-in fields, not persisted row columns.
export type StoredRow<Name extends keyof Database["public"]["Tables"]> = Omit<
  Database["public"]["Tables"][Name]["Row"],
  Database["public"]["Tables"][Name] extends { ComputedFields: infer Field extends string } ? Field : never
>;
