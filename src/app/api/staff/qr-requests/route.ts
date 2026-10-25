import {z} from "zod";
import {requireStaff} from "@/lib/staff-api";
import {publicJson,publicError,PublicApiError,readPublicBody} from "@/lib/public-table-api";
import {paymentRequestSchema} from "@/features/payments/validation";
const paymentLineSchema=paymentRequestSchema.shape.lines.element;
const schema=z.discriminatedUnion("action",[
 z.strictObject({action:z.enum(["confirm","reject"]),id:z.uuid(),request_id:z.uuid(),reason:z.string().trim().max(500).optional(),lines:z.array(paymentLineSchema).max(20).default([])}),
 z.strictObject({action:z.literal("block"),id:z.uuid(),blocked:z.boolean(),reason:z.string().trim().min(1).max(500)})
]);
export async function GET(){try{
 const {db}=await requireStaff(["admin","cashier"]);
 const fields="id,table_id,customer_name,customer_phone,items,total_amount,confirmation_mode,status,created_at,reason,tables(table_number)";
 const [pending,recent,accounts]=await Promise.all([
 db.from("qr_requests").select(fields).eq("status","pending").order("created_at"),
 db.from("qr_requests").select(fields).neq("status","pending").order("created_at",{ascending:false}).limit(100),
 db.from("orders").select("table_id,total_amount,payments(equivalent_pyg,change_pyg)").eq("order_type","dine_in").not("status","in","(closed,cancelled)")]);
 if(pending.error||recent.error||accounts.error)throw pending.error||recent.error||accounts.error;
 return publicJson([...pending.data,...recent.data].map(row=>{const account=accounts.data.find(a=>a.table_id===row.table_id);return {...row,required_pyg:row.total_amount+(account?Math.max(0,account.total_amount-account.payments.reduce((sum,p)=>sum+p.equivalent_pyg-p.change_pyg,0)):0)};}));
 }catch(e){return publicError(e);}}
export async function POST(request:Request){try{const {db}=await requireStaff(["admin","cashier"]);const parsed=schema.safeParse(await readPublicBody(request));if(!parsed.success)throw new PublicApiError(400,"Confira os dados da confirmação.");const v=parsed.data;const result=v.action==="block"?await db.rpc("set_phone_block",{p_request:v.id,p_block:v.blocked,p_reason:v.reason}):await db.rpc("qr_review",{p_id:v.id,p_request_id:v.request_id,p_action:v.action,p_reason:v.reason??undefined,p_lines:v.lines});if(result.error)throw new PublicApiError(result.error.code==="42501"?403:409,"Não foi possível confirmar. Confira o caixa aberto, o saldo, os preços e o estado da mesa.");return publicJson(result.data??{success:true});}catch(e){return publicError(e);}}
