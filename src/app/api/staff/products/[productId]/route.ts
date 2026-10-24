import { z } from "zod";

import { productPatchSchema } from "@/features/menu-management/validation";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

type Context = { params: Promise<{ productId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { db } = await requireStaff(["admin"]);
    const id = z.uuid().safeParse((await context.params).productId);
    const input = productPatchSchema.safeParse(await readPublicBody(request));
    if (!id.success || !input.success) throw new PublicApiError(400, "Confira os dados do produto.");
    const restoring = "action" in input.data;
    const changes = restoring ? { is_archived: false, is_active: false } : input.data;
    const { data, error } = await db.from("products").update(changes).eq("id", id.data).eq("is_archived", restoring).select("*").maybeSingle();
    if (error || !data) throw new PublicApiError(409, "Produto alterado ou removido. Atualize a lista e tente novamente.");
    return publicJson({ product: data });
  } catch (error) { return publicError(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { db } = await requireStaff(["admin"]);
    const id = z.uuid().safeParse((await context.params).productId);
    if (!id.success) throw new PublicApiError(400, "Produto inválido.");
    const { data, error } = await db.from("products").update({ is_archived: true, is_active: false }).eq("id", id.data).select("*").maybeSingle();
    if (error || !data) throw new PublicApiError(409, "Não foi possível remover. Atualize a lista.");
    return publicJson({ product: data });
  } catch (error) { return publicError(error); }
}
