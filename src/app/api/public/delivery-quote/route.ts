import { z } from "zod";

import { mapLinkSchema } from "@/features/customer-ordering/delivery-location";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import {publicLicense}from "@/lib/licensing";
import { PublicApiError, publicError, publicJson, publicQuota, readPublicBody } from "@/lib/public-table-api";

const inputSchema = z.strictObject({ location_url: mapLinkSchema });
export async function POST(request: Request) {
  try {
    await publicQuota(request, "delivery-quote", 60);
    const input = inputSchema.safeParse(await readPublicBody(request));
    if (!input.success) throw new PublicApiError(400, "Envie uma localização válida para calcular a entrega.");
    if(!(await publicLicense()).delivery_enabled)throw new PublicApiError(503,"Pedidos temporariamente indisponíveis. Fale com o atendimento.");
    return publicJson(await createDeliveryQuote(input.data.location_url));
  } catch (error) { return publicError(error); }
}
