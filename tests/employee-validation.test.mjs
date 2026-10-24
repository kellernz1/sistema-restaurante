import assert from "node:assert/strict";
import test from "node:test";

import { employeeCreateSchema, employeeUpdateSchema } from "../src/features/employees/validation.ts";

const employee = { full_name: " Ana Souza ", email: " ANA@EXAMPLE.COM ", password: "Employee@Test123", role: "cashier" };
test("employee creation normalizes identity and permits only staff roles", () => {
  const parsed = employeeCreateSchema.parse(employee);
  assert.equal(parsed.full_name, "Ana Souza"); assert.equal(parsed.email, "ana@example.com"); assert.equal(parsed.is_active, true);
  for (const role of ["admin", "cashier", "waiter", "kitchen"]) assert.equal(employeeCreateSchema.safeParse({ ...employee, role }).success, true);
  for (const changes of [{ role: "owner" }, { email: "bad" }, { full_name: "" }, { password: "short" }, { password: " ".repeat(12) }, { password: "x".repeat(73) }]) assert.equal(employeeCreateSchema.safeParse({ ...employee, ...changes }).success, false);
});
test("employee updates cannot change credentials or inject actor identities", () => {
  assert.equal(employeeUpdateSchema.safeParse({ full_name: "Ana Souza", role: "waiter" }).success, true);
  assert.equal(employeeUpdateSchema.safeParse({ is_active: false }).success, true);
  for (const value of [{}, { password: "Other@Test123" }, { email: "new@example.com" }, { id: "other", is_active: true }, { is_active: false, role: "admin" }, { full_name: "Ana", role: "waiter", user_id: "actor" }]) assert.equal(employeeUpdateSchema.safeParse(value).success, false);
  assert.equal(employeeCreateSchema.safeParse({ ...employee, id: "chosen-id" }).success, false);
});
