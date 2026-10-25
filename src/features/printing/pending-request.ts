export type PendingPrintRequest={action:"request";request_id:string;kind:"kitchen"|"receipt"|"test";destination:"kitchen"|"cashier";order_id?:string;job_id?:string};
type StorageAccess=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const prefix="mesa-print-pending-v1:";
export function printRequestKey(target:Pick<PendingPrintRequest,"kind"|"destination"|"order_id"|"job_id">){return prefix+(target.job_id?`job:${target.job_id}`:`${target.kind}:${target.order_id??target.destination}`);}
export function loadPrintRequest(storage:StorageAccess,target:Pick<PendingPrintRequest,"kind"|"destination"|"order_id"|"job_id">):PendingPrintRequest|null{
 const saved=storage.getItem(printRequestKey(target));if(!saved)return null;
 const value=JSON.parse(saved) as PendingPrintRequest;
 if(value.action!=="request"||!/^[a-f0-9-]{36}$/i.test(value.request_id)||value.kind!==target.kind||value.destination!==target.destination||value.order_id!==target.order_id||value.job_id!==target.job_id)throw new Error("Stored print request does not match target");
 return value;
}
export function savePrintRequest(storage:StorageAccess,value:PendingPrintRequest){storage.setItem(printRequestKey(value),JSON.stringify(value));}
export function clearPrintRequest(storage:StorageAccess,value:PendingPrintRequest){storage.removeItem(printRequestKey(value));}
