import { counterDiscountRequestSchema } from "@/features/counter/validation";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
export async function POST(request:Request){
 try{
  const {db}=await requireStaff(["admin","cashier"]);
  const parsed=counterDiscountRequestSchema.safeParse(await readPublicBody(request));
  if(!parsed.success)throw new PublicApiError(400,"Confira os itens, o desconto e o PIN de aprovação.");
  const p=parsed.data;
  const result=p.command==="quote"?await db.rpc("counter_discount_quote",{p_draft_id:p.draft_id,p_payload:p.payload,p_discount:p.discount}):await db.rpc("request_counter_discount_approval",{p_request_id:p.request_id,p_approver:p.approver,p_pin:p.pin,p_draft_id:p.draft_id,p_payload:p.payload,p_discount:p.discount,p_binding:p.binding});
  // Never log PIN-bearing requests or RPC errors.
  if(result.error){if(/^[0-9A-Z]{5}$/.test(result.error.code??""))throw new PublicApiError(409,"Confira novamente o carrinho e a aprovação do desconto.");throw result.error;}
  return publicJson(result.data);
 }catch(error){return publicError(error);}
}
