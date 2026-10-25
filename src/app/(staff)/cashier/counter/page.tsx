import { CounterDesk } from "@/features/counter/counter-desk";
import { requireStaff } from "@/lib/staff-api";
import { getTranslation } from "@/lib/i18n/server";
import type { PaymentConfig } from "@/lib/money";
import "./counter.css";
export default async function CounterPage() {
  const t = await getTranslation();
  const { db } = await requireStaff(["admin", "cashier"]);
  const [products, categories, settings, payments] = await Promise.all([
    db.from("products").select("id,name,price,category_id").eq("is_active", true).order("name"),
    db.from("categories").select("id,name").order("sort_order").order("name"),
    db.from("restaurant_settings").select("*").eq("id", true).single(), db.rpc("payment_configuration"),
  ]);
  if (products.error || categories.error || settings.error || payments.error || !settings.data) return <p role="alert">{t("Não foi possível carregar o balcão.")}</p>;
  return <CounterDesk products={products.data} categories={categories.data} settings={settings.data} config={payments.data as unknown as PaymentConfig} />;
}
