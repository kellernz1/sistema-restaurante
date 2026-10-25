import { requireStaff } from "@/lib/staff-api";
import { publicJson,publicError } from "@/lib/public-table-api";
export async function GET(){
 try{const {db}=await requireStaff(["admin","cashier","kitchen"]);const result=await db.rpc("print_worker_health");if(result.error)throw result.error;return publicJson(result.data);}
 catch(error){return publicError(error);}
}
