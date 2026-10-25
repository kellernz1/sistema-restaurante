import {requireStaff} from "@/lib/staff-api";
import {publicJson,publicError,PublicApiError} from "@/lib/public-table-api";
export async function GET(request:Request){
 try{const {db}=await requireStaff(["admin"]);const day=new URL(request.url).searchParams.get("day");if(day&&!/^20\d{2}-\d{2}-\d{2}$/.test(day))throw new PublicApiError(400,"Dia inválido.");const result=await db.rpc("cash_day_report",day?{p_day:day}:{});if(result.error)throw new PublicApiError(400,"Relatório indisponível para esse dia.");return publicJson(result.data);}catch(error){return publicError(error);}
}
