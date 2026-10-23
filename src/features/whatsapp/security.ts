import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(raw: Uint8Array, signature: string | null, secret: string | undefined) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(raw).digest(), Buffer.from(signature.slice(7), "hex"));
}
export function secretMatches(value: string | null, secret: string | undefined) {
  if (!value || !secret) return false;
  const actual = Buffer.from(value); const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function mockAllowed(environment: string | undefined, mock: string | undefined) {
  return environment === "development" && mock === "true";
}
