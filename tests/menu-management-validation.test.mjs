import assert from "node:assert/strict";
import test from "node:test";

import { productSchema, productPatchSchema } from "../src/features/menu-management/validation.ts";

const product = { name: " Prato do dia ", description: null, category_id: "12345678-1234-4234-8234-123456789abc", price: 23900, is_active: true };

test("product editing validates names, categories and exact currency precision", () => {
  assert.equal(productSchema.parse(product).name, "Prato do dia");
  for (const changes of [{ name: "" }, { price: -1 }, { price: 1.234 }, { price: Infinity }, { category_id: "bad" }, { description: "a".repeat(1001) }]) {
    assert.equal(productSchema.safeParse({ ...product, ...changes }).success, false);
  }
});
test("availability and restoration use narrow payloads", () => {
  assert.equal(productPatchSchema.safeParse({ is_active: false }).success, true);
  assert.equal(productPatchSchema.safeParse({ action: "restore" }).success, true);
  assert.equal(productPatchSchema.safeParse({}).success, false);
  assert.equal(productPatchSchema.safeParse({ action: "restore", price: 0 }).success, false);
});
test("clients cannot override image references, identity or archive fields", () => {
  for (const extra of [{ id: product.category_id }, { image_version: product.category_id }, { is_archived: true }, { role: "admin" }]) {
    assert.equal(productSchema.safeParse({ ...product, ...extra }).success, false);
    assert.equal(productPatchSchema.safeParse(extra).success, false);
  }
});
