import { CashierNewOrder } from "@/features/cashier/new-order";
import { requireStaff } from "@/lib/staff-api";

export default async function NewCashierOrderPage() {
  const { db } = await requireStaff(["admin", "cashier"]);
  const [tables, products, categories, settings] = await Promise.all([
    db.from("tables").select("id, table_number, status").order("table_number"),
    db.from("products").select("*").eq("is_active", true).order("name"),
    db.from("categories").select("*").order("sort_order").order("name"),
    db.from("restaurant_settings").select("*").eq("id", true).single(),
  ]);
  if (tables.error || products.error || categories.error || settings.error || !settings.data) {
    return <p role="alert">Não foi possível carregar o novo pedido. Confira a conexão e atualize a página.</p>;
  }
  return <CashierNewOrder tables={tables.data} products={products.data} categories={categories.data} settings={settings.data} />;
}
