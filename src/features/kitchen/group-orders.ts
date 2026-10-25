type Item = { id: string; created_at: string; status: "pending" | "preparing" | "ready" | "delivered"; orders: { id: string } };

export function groupKitchenOrders<T extends Item>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.status === "delivered") continue;
    const group = groups.get(item.orders.id) ?? [];
    group.push(item);
    groups.set(item.orders.id, group);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const status = sorted.every((item) => item.status === "ready") ? "ready" : sorted.every((item) => item.status === "pending") ? "pending" : "preparing";
    return { id, items: sorted, status, createdAt: sorted[0].created_at };
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
