import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { PhoneCountry } from "@/lib/phone";

export async function defaultPhoneCountry(): Promise<PhoneCountry> {
  const { data, error } = await createAdminClient().from("restaurant_settings").select("default_phone_country").eq("id", true).single();
  if (error || !data) throw error ?? new Error("Restaurant settings missing");
  return data.default_phone_country === "BR" ? "BR" : "PY";
}
