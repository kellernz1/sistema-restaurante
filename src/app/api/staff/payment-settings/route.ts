import { requireStaff } from "@/lib/staff-api";
import { publicError, publicJson, readPublicBody, PublicApiError } from "@/lib/public-table-api";
import { exchangeRateSchema } from "@/features/payments/validation";
import { z } from "zod";
const methodsSchema = z.strictObject({ enabled_methods: z.array(z.enum(["cash", "transfer", "card", "pix"])).min(1).max(4).refine((values) => new Set(values).size === values.length) });

export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const { data, error } = await db.rpc("payment_configuration");
    if (error) throw error;
    return publicJson(data);
  } catch (error) { return publicError(error); }
}
export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const body = await readPublicBody(request);
    const methods = methodsSchema.safeParse(body);
    if (methods.success) {
      const { error } = await db.rpc("set_payment_methods", { p_methods: methods.data.enabled_methods });
      if (error) throw new PublicApiError(409, "Não foi possível salvar a configuração de pagamentos.");
      return publicJson({ saved: true });
    }
    const input = exchangeRateSchema.safeParse(body);
    if (!input.success) throw new PublicApiError(400, "Cotação inválida.");
    const { error } = await db.rpc("set_exchange_rate", { p_rate: input.data.rate, p_rounding: input.data.rounding });
    if (error) throw new PublicApiError(409, "Não foi possível salvar a cotação.");
    return publicJson({ saved: true });
  } catch (error) { return publicError(error); }
}
