import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { createAdminClient } from "@/utils/supabase/admin";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { licenseErrors, licenseImportError, publicKeyConfiguration, validLicenseEnvelope } from "@/features/licensing/validation";
import { renewLicense } from "../../../../../scripts/license-renewal.mjs";

const schema = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("import"), token: z.string().trim().max(12000) }),
  z.strictObject({ command: z.literal("renew") }),
  z.strictObject({ command: z.literal("configure"), url: z.string().max(500), days: z.number().int().min(1).max(7) }),
]);

export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const pulse = await createAdminClient().rpc("license_tick");
    if (pulse.error) throw pulse.error;
    const result = await db.rpc("license_status");
    if (result.error) throw result.error;
    return publicJson({ ...(result.data as object), public_key_environment: publicKeyConfiguration(process.env.LICENSE_PUBLIC_KEY) });
  } catch (error) { return publicError(error); }
}

export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const parsed = schema.safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira os dados da licença.");
    const input = parsed.data;
    if (input.command === "import" && !validLicenseEnvelope(input.token)) throw new PublicApiError(400, licenseErrors.format);
    const configuration = publicKeyConfiguration(process.env.LICENSE_PUBLIC_KEY);
    if (configuration === "invalid") throw new PublicApiError(400, licenseErrors.invalidKey);
    if (configuration === "valid") {
      const key = await createAdminClient().rpc("license_set_public_key", { p_hex: process.env.LICENSE_PUBLIC_KEY!.trim() });
      if (key.error) throw new PublicApiError(409, licenseImportError(key.error));
    } else if (input.command !== "configure") {
      const status = await db.rpc("license_status");
      if (status.error) throw status.error;
      // A previously pinned trust key remains usable without replacing it from the environment.
      if (!(status.data as { key_configured?: boolean }).key_configured) throw new PublicApiError(409, licenseErrors.missingKey);
    }
    if (input.command === "renew") {
      const result = await renewLicense(createAdminClient(), { force: true, publicKey: process.env.LICENSE_PUBLIC_KEY?.trim() || undefined });
      if (result.failed) throw new PublicApiError(503, "Não foi possível renovar. A licença atual e o atendimento existente foram preservados.");
      if (!result.attempted) throw new PublicApiError(409, "Importe a licença inicial e configure o servidor, ou aguarde a renovação em andamento.");
      return publicJson(result.status);
    }
    const result = input.command === "import"
      ? await db.rpc("license_import", { p_token: input.token })
      : await db.rpc("license_configure", { p_url: input.url.trim() || undefined, p_days: input.days });
    if (result.error) throw new PublicApiError(400, input.command === "import" ? licenseImportError(result.error) : "Confira a URL e o intervalo de renovação.");
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
