import "server-only";
import { cookies } from "next/headers";
import { createTranslator, LOCALE_COOKIE, normalizeLocale } from "./catalog";

export async function getLocale() {
  return normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
export async function getTranslation() {
  return createTranslator(await getLocale());
}
