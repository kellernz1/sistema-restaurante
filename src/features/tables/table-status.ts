import type { Enums, Tables } from "@/types/database.types";

export type TableStatus = Enums<"table_status">;
export type RestaurantTable = Pick<
  Tables<"tables">,
  "id" | "table_number" | "capacity" | "status"
>;

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: "Disponível",
  occupied: "Ocupada",
  closing: "Fechamento",
};
