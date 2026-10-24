import { managementProducts } from "@/features/menu-management/query";
import { productSchema } from "@/features/menu-management/validation";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

export async function GET() {
  try {
    const { db } = await requireStaff(["admin"]);
    return publicJson({ products: await managementProducts(db) });
  } catch (error) { return publicError(error); }
}

export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const parsed = productSchema.safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira nome, categoria, descrição e preço do produto.");
    const { data, error } = await db.from("products").insert(parsed.data).select("*").single();
    if (error) throw new PublicApiError(409, "Não foi possível cadastrar. Confira a categoria e os dados.");
    return publicJson({ product: data }, 201);
  } catch (error) { return publicError(error); }
}
