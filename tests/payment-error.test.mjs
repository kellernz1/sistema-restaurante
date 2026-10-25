import assert from "node:assert/strict";
import test from "node:test";
import { CustomerApiError } from "../src/features/customer-ordering/public-client.ts";
import { paymentErrorMessage } from "../src/features/payments/payment-error.ts";

test("payment panel preserves the actionable missing-session error", () => {
  const message = "Abra o caixa antes de registrar pagamentos.";
  assert.equal(paymentErrorMessage(new CustomerApiError(409, message)), message);
});

test("other conflicts stay sanitized and uncertain results retain recovery guidance", () => {
  assert.match(paymentErrorMessage(new CustomerApiError(409, "internal detail")), /Confira o saldo/);
  assert.match(paymentErrorMessage(new CustomerApiError(503, "unavailable")), /Envio incerto/);
  assert.match(paymentErrorMessage(new Error("network")), /Envio incerto/);
});
