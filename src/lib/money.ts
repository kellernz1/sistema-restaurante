export const BASE_CURRENCY = "PYG";
export const MAX_MONEY = 1_000_000_000_000;
const integerFormat = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
export const money = { format: (value: number) => `Gs. ${integerFormat.format(value)}` };
export const brl = { format: (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100) };
export const paymentLabels = { cash: "Dinheiro", transfer: "Transferência", card: "Cartão", pix: "Pix" };
export type PaymentMethod = keyof typeof paymentLabels;
export type RoundingMode = "none" | "half_real" | "whole_real";
export type PaymentConfig = { enabled_methods: PaymentMethod[]; rate: { id: string; rate: string; rounding: RoundingMode } | null };
export type PaymentLine = { method: PaymentMethod; currency: "PYG" | "BRL"; original_amount: number; amount_pyg: number; rate_id?: string };

// Decimal rates are transmitted as strings; integer arithmetic mirrors PostgreSQL.
export function brlCentsFor(pyg: number, rate: string, rounding: RoundingMode) {
  if (!Number.isSafeInteger(pyg) || pyg < 0 || pyg > MAX_MONEY || !/^\d+(\.\d{1,8})?$/.test(rate)) throw new Error("Invalid monetary amount");
  const [whole, fraction = ""] = rate.split(".");
  const scaled = BigInt(whole) * BigInt(100000000) + BigInt(fraction.padEnd(8, "0"));
  if (scaled <= BigInt(0)) throw new Error("Invalid exchange rate");
  const step = rounding === "whole_real" ? BigInt(100) : rounding === "half_real" ? BigInt(50) : BigInt(1);
  const numerator = BigInt(pyg) * BigInt(100) * BigInt(100000000);
  const cents = ((numerator + scaled * step - BigInt(1)) / (scaled * step)) * step;
  if (cents > BigInt(MAX_MONEY)) throw new Error("Amount exceeds limit");
  return Number(cents);
}
