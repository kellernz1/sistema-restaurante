import "server-only";
import {createAdminClient}from "@/utils/supabase/admin";
import {PublicApiError}from "@/lib/public-table-api";
export function licensingError(error:unknown){return ["L0001","L0002"].includes((error as {code?:string})?.code??"")?new PublicApiError(503,"Pedidos temporariamente indisponíveis. Fale com o atendimento."):null;}
export async function publicLicense(){const result=await createAdminClient().rpc("license_public_status");if(result.error)throw result.error;return result.data as {orders_enabled:boolean;delivery_enabled:boolean;whatsapp_enabled:boolean};}
