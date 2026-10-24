import spanish from "./es.json";

export const LOCALE_COOKIE = "restaurant-locale";
export type Locale = "pt-BR" | "es";
export function normalizeLocale(value?: string | null): Locale {
  return value === "es" ? "es" : "pt-BR";
}
const dictionary: Record<string, string> = spanish;
const reverse = new Map(Object.entries(dictionary).map(([source, target]) => [target, source]));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function makePatterns(entries: [string, string][]) {
  return entries.filter(([source]) => source.includes("{0}"))
    .sort(([a], [b]) => b.replace(/\{\d+\}/g, "").length - a.replace(/\{\d+\}/g, "").length)
    .map(([source, target]) => ({
    expression: new RegExp("^" + source.split(/\{\d+\}/).map(escapeRegex).join("([\\s\\S]*?)") + "$"), target,
  }));
}
const forwardPatterns = makePatterns(Object.entries(dictionary));
const reversePatterns = makePatterns(Object.entries(dictionary).map(([source, target]) => [target, source]));
export function translate<T>(locale: Locale, value: T): T {
  if (typeof value !== "string") return value;
  const source = value.trim().replace(/\s+/g, " ");
  let translated = locale === "es" ? dictionary[source] : reverse.get(source);
  if (!translated) {
    for (const { expression, target } of locale === "es" ? forwardPatterns : reversePatterns) {
      const match = expression.exec(source);
      if (match) {
        translated = target.replace(/\{(\d+)\}/g, (_, index: string) => match[Number(index) + 1] ?? "");
        break;
      }
    }
  }
  if (!translated) return value;
  return (value.slice(0, value.length - value.trimStart().length) + translated + value.slice(value.trimEnd().length)) as T;
}
export function createTranslator(locale: Locale) {
  return <T,>(value: T) => translate(locale, value);
}
