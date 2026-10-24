import { ProductManager } from "@/features/menu-management/product-manager";
import { managementProducts } from "@/features/menu-management/query";
import { requireStaff } from "@/lib/staff-api";

export default async function MenuManagementPage() {
  const { db } = await requireStaff(["admin"]);
  const [products, categories] = await Promise.all([managementProducts(db).catch(() => null), db.from("categories").select("id, name").order("sort_order").order("name")]);
  if (!products || categories.error) {
    return <p role="alert">Não foi possível carregar o cardápio. Confira a conexão e atualize a página.</p>;
  }
  return <ProductManager initialProducts={products} categories={categories.data} />;
}
