import { z } from "zod";

import { mapLinkSchema } from "@/features/customer-ordering/delivery-location";
import { resolveMapCoordinates } from "@/lib/delivery-quotes";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

const schema = z.strictObject({ location_url: mapLinkSchema });
export async function POST(request: Request) {
  try {
    await requireStaff(["admin"]);
    const input = schema.safeParse(await readPublicBody(request));
    if (!input.success) throw new PublicApiError(400, "Cole um link válido do Google Maps, Apple Mapas ou Waze.");
    return publicJson(await resolveMapCoordinates(input.data.location_url));
  } catch (error) { return publicError(error); }
}
