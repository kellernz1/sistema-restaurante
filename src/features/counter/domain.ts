export function normalizeCounterName(value: string): string | null {
  const name = value.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  if ([...name].length > 30) throw new Error("Counter name exceeds 30 characters");
  return name || null;
}
export function counterWaitTone(readyAt: string, now: number, greenMinutes = 2, yellowMinutes = 5) {
  const elapsed = Math.max(0, now - Date.parse(readyAt));
  if (!Number.isFinite(elapsed)) return "red";
  return elapsed <= greenMinutes * 60000 ? "green" : elapsed <= yellowMinutes * 60000 ? "yellow" : "red";
}
