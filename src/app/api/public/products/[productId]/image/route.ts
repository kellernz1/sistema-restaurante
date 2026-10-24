import { z } from "zod";

import { PublicApiError, publicError, publicQuota } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  try {
    const id = z.uuid().safeParse((await context.params).productId);
    const version = z.uuid().safeParse(new URL(request.url).searchParams.get("v"));
    if (!id.success || !version.success) throw new PublicApiError(404, "Foto não encontrada.");
    await publicQuota(request, "product-photo-read", 6000);
    const { data, error } = await createAdminClient().from("product_photos").select("content, version").eq("product_id", id.data).eq("version", version.data).maybeSingle();
    if (error) throw error;
    if (!data) throw new PublicApiError(404, "Foto não encontrada.");
    const headers = { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ETag: `"${data.version}"` };
    if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
    return new Response(Buffer.from(data.content, "base64"), { headers });
  } catch (error) { return publicError(error); }
}
