import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const result = await createAdminClient()
      .from("restaurant_settings")
      .select("id", { head: true, count: "exact" })
      .eq("id", true);
    if (result.error) throw result.error;
    return Response.json({ status: "ok", database: "reachable", checked_at: checkedAt });
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable", checked_at: checkedAt },
      { status: 503 },
    );
  }
}
