import "server-only";

import type { Tables } from "@/types/database.types";

export type CustomerEvent = "accepted" | "rejected" | "ready" | "out_for_delivery" | "completed";

// Phase 10 will supply the WhatsApp adapter. Ordering never depends on delivery.
export async function notifyCustomer(order: Tables<"orders">, event: CustomerEvent): Promise<void> {
  void order;
  void event;
}
