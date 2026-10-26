import path from "node:path";
import { requireStaff } from "@/lib/staff-api";
import { publicError, publicJson, PublicApiError, readPublicBody } from "@/lib/public-table-api";
import { atomicJson, operationsDirectory, operationsPolicySchema, operationsStatus } from "@/lib/operations";

function requireLocal() { if(process.env.APP_MODE!=="local")throw new PublicApiError(404,"Operação local indisponível."); }
export async function GET() {
  try {
    const {role}=await requireStaff(["admin","cashier"]);requireLocal();
    const status=operationsStatus();
    const state={...status.state,file:role==="admin"?status.state.file:undefined,external_directory:role==="admin"?status.state.external_directory:undefined};
    return publicJson({...status,state,policy:{...status.policy,external_directory:role==="admin"?status.policy.external_directory:""}});
  } catch(error){return publicError(error);}
}
export async function PATCH(request:Request) {
  try {
    await requireStaff(["admin"]);requireLocal();
    const value=operationsPolicySchema.safeParse(await readPublicBody(request));
    if(!value.success)throw new PublicApiError(400,"Confira os intervalos e a pasta de backup.");
    atomicJson(path.join(operationsDirectory,"policy.json"),value.data);
    return publicJson({success:true});
  } catch(error){return publicError(error);}
}
