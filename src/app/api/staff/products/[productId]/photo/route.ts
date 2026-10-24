import { z } from "zod";

import { readProductPhoto } from "@/features/menu-management/photo-upload";
import { PublicApiError, publicError, publicJson } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

type Context = { params: Promise<{ productId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { db } = await requireStaff(["admin"]);
    const id = z.uuid().safeParse((await context.params).productId);
    if (!id.success) throw new PublicApiError(400, "Produto inválido.");
    const content = await readProductPhoto(request);
    const { data, error } = await db.rpc("set_product_photo", { p_product_id: id.data, p_content: content });
    if (error) throw new PublicApiError(409, "Não foi possível salvar a foto. Confira se o produto ainda está no cardápio.");
    return publicJson({ image_version: data });
  } catch (error) { return publicError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { db } = await requireStaff(["admin"]);
    const id = z.uuid().safeParse((await context.params).productId);
    if (!id.success) throw new PublicApiError(400, "Produto inválido.");
    // Empty content means removal; PostgreSQL's nullable argument is modeled by the CLI as string.
    const { error } = await db.rpc("set_product_photo", { p_product_id: id.data, p_content: "" });
    if (error) throw new PublicApiError(409, "Não foi possível remover a foto. Atualize a lista.");
    return publicJson({ image_version: null });
  } catch (error) { return publicError(error); }
}
