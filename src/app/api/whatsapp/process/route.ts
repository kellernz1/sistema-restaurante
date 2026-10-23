import { drainWhatsApp } from "@/features/whatsapp/handlers";
import { secretMatches } from "@/features/whatsapp/security";
import { publicJson } from "@/lib/public-table-api";

export const maxDuration = 60;
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("authorization"), process.env.WHATSAPP_WORKER_SECRET ? `Bearer ${process.env.WHATSAPP_WORKER_SECRET}` : undefined)) return publicJson({ error: "Forbidden" }, 403);
  try { return publicJson({ processed: await drainWhatsApp() }); }
  catch { return publicJson({ error: "Worker temporarily unavailable" }, 503); }
}
export const GET = POST;
