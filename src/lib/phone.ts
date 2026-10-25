import { parsePhoneNumberFromString } from "libphonenumber-js/max";
export type PhoneCountry = "PY" | "BR";
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = "PY";
export const phoneCountries = { PY: { label: "Paraguai (+595)", code: "595" }, BR: { label: "Brasil (+55)", code: "55" } };

export function normalizePhone(value: string, country: PhoneCountry = DEFAULT_PHONE_COUNTRY): string {
  if (value.length > 40 || !/^[+\d\s().-]+$/.test(value)) throw new Error("Invalid phone");
  const cleaned = value.replace(/[\s().-]/g, "");
  let parsed = parsePhoneNumberFromString(cleaned, { defaultCountry: country, extract: false });
  // A pasted calling code without '+' is explicit only for the selected country.
  if (!cleaned.startsWith("+") && cleaned.startsWith(phoneCountries[country].code)) {
    const international = parsePhoneNumberFromString(`+${cleaned}`, { extract: false });
    if (international?.country === country && international.isValid()) parsed = international;
  }
  if (parsed?.country === "BR" && parsed.nationalNumber.length === 10 && !(parsed.isValid() && ["FIXED_LINE", "FIXED_LINE_OR_MOBILE"].includes(parsed.getType() ?? ""))) {
    const national = parsed.nationalNumber;
    const mobile = parsePhoneNumberFromString(`+55${national.slice(0, 2)}9${national.slice(2)}`, { extract: false });
    if (mobile?.isValid() && mobile.getType() === "MOBILE") parsed = mobile;
  }
  if (!parsed?.isValid() || parsed.ext) throw new Error("Invalid phone");
  return parsed.number;
}

export function phoneAliases(value: string, country: PhoneCountry = DEFAULT_PHONE_COUNTRY): string[] {
  const canonical = normalizePhone(value, country);
  const aliases = [canonical];
  if (/^\+55\d{2}9\d{8}$/.test(canonical)) {
    const legacy = canonical.slice(0, 5) + canonical.slice(6);
    try { if (normalizePhone(legacy) === canonical) aliases.push(legacy); } catch { /* Not a safe mobile alias. */ }
  }
  return aliases;
}

export function addressStorageKeys(value: string, country: PhoneCountry = DEFAULT_PHONE_COUNTRY) {
  return phoneAliases(value, country).map((phone) => `delivery-address:${phone}`);
}

export function whatsappIdentity(recipient: string) {
  if (!/^\+?[1-9]\d{7,14}$/.test(recipient)) throw new Error("Invalid WhatsApp recipient");
  return { phone: normalizePhone(`+${recipient.replace(/^\+/, "")}`), recipient: recipient.replace(/^\+/, "") };
}
