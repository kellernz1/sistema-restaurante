import {requireStaff}from "@/lib/staff-api";
import {PublicApiError,publicError,publicJson,readPublicBody}from "@/lib/public-table-api";
import {refundRequestSchema,refundOperationSchema}from "@/features/refunds/validation";
export async function POST(request:Request){
 try{
  const {db}=await requireStaff(["admin","cashier"]);
  const parsed=refundRequestSchema.safeParse(await readPublicBody(request));if(!parsed.success)throw new PublicApiError(400,"Confira o estorno e a confirmação da devolução manual.");
  const p=parsed.data;
  const result=p.command==="quote"?await db.rpc("refund_quote",{p_operation:p.operation}):p.command==="approve"?await db.rpc("request_refund_approval",{p_request_id:p.request,p_operation:p.operation,p_binding:p.binding,p_approver:p.approver,p_pin:p.pin}):await db.rpc("execute_refund",{p_request_id:p.request,p_operation:p.operation,p_binding:p.binding,p_authorization:p.authorization??undefined,p_confirmed:p.confirmed});
  if(result.error){if(/^[0-9A-Z]{5}$/.test(result.error.code??""))throw new PublicApiError(409,"Estorno recusado. Abra seu caixa, atualize o pedido e confira o saldo e a aprovação. Para devolução integral de pedido ativo, use cancelar e estornar.");throw result.error;}
  return publicJson(result.data);
 }catch(error){return publicError(error);}
}
export async function GET(request:Request){
 try{
  const{db}=await requireStaff(["admin","cashier"]);const id=new URL(request.url).searchParams.get("order");
  if(!id||!refundOperationSchema.shape.target.safeParse(id).success)throw new PublicApiError(400,"Pedido inválido.");
  const result=await db.from("refunds").select("id,amount_pyg,original_amount,method,currency,exchange_rate,reason,created_at").eq("order_id",id).order("created_at");
  if(result.error)throw result.error;return publicJson(result.data);
 }catch(error){return publicError(error);}
}
