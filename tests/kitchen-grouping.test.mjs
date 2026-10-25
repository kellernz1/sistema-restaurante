import assert from "node:assert/strict";
import test from "node:test";
import { groupKitchenOrders } from "../src/features/kitchen/group-orders.ts";

const item = (id, order, status, minute = "00") => ({ id, orders: { id: order }, status, created_at: `2026-10-24T12:${minute}:00Z` });
test("kitchen keeps each order together and advances only when every item is ready", () => {
  const rows = [item("b", "one", "ready"), item("c", "two", "pending", "02"), item("a", "one", "pending")];
  const groups = groupKitchenOrders(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map((row) => row.id), ["a", "b"]);
  assert.equal(groups[0].status, "preparing");
  assert.equal(groups[1].status, "pending");
  assert.equal(groupKitchenOrders(rows.filter((row) => row.orders.id === "one").map((row) => ({ ...row, status: "ready" })))[0].status, "ready");
  assert.equal(rows[0].id, "b");
  assert.deepEqual(groupKitchenOrders([]), []);
  assert.deepEqual(groupKitchenOrders([item("d", "three", "delivered")]), []);
});
