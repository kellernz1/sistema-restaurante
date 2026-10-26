import { describe, expect, it } from "vitest";
import { operationSchema, sensitiveRequestSchema } from "./validation";
const target = "11111111-1111-4111-8111-111111111111";
describe("sensitive operation HTTP boundary", () => {
  it("bounds whole-guarani inputs and rejects caller supplied totals", () => {
    expect(operationSchema.safeParse({ action: "discount", target, mode: "amount", value: 25000, reason: "Courtesy" }).success).toBe(true);
    for (const value of [-1, 1.5, 1e12 + 1]) expect(operationSchema.safeParse({ action: "discount", target, mode: "amount", value, reason: "Courtesy" }).success).toBe(false);
    expect(operationSchema.safeParse({ action: "cancel_order", target, reason: "Cancellation", total: 0 }).success).toBe(false);
  });
  it("requires bounded numeric PIN and rejects secret-bearing extra fields", () => {
    expect(sensitiveRequestSchema.safeParse({ command: "pin", pin: "012345", password: "password" }).success).toBe(true);
    for (const pin of ["123", "1234567", "12a4"]) expect(sensitiveRequestSchema.safeParse({ command: "pin", pin, password: "password" }).success).toBe(false);
    expect(sensitiveRequestSchema.safeParse({ command: "execute", request: target, operation: { action: "cancel_order", target, reason: "Cancellation" }, binding: "a".repeat(64), authorization: target, pin: "1234" }).success).toBe(false);
  });
});
