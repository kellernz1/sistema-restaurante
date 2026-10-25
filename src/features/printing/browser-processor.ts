import { customerApi } from "../customer-ordering/public-client";
import { uuid } from "../../lib/uuid";
import { browserDriver } from "./browser-driver";
import { buildPrintDocument, type PrintJob } from "./document";
import { renderEscPos } from "./escpos";
let busy=false;
let instance:string;
const owner=()=>instance??=uuid();
export async function browserPrintHeartbeat(){return customerApi("/api/staff/printing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"heartbeat",owner_id:owner(),version:"4A.1"}),signal:AbortSignal.timeout(10000)});}
export async function processBrowserPrint() {
 if(busy) return;
 busy=true;
 const ownerId=owner();
 const command=(body:object)=>customerApi("/api/staff/printing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 try {
  await browserPrintHeartbeat();
  const job=await command({action:"claim",owner_id:ownerId}) as PrintJob | null;
  if(!job) return;
  const finish=(status:string,error?:string)=>command({action:"finish",owner_id:ownerId,job_id:job.id,token:job.claim_token,status,error});
  let document,bytes;
  try {document=buildPrintDocument(job,location.origin);bytes=renderEscPos(document,job.device);}
  catch {await finish("failed","Document generation failed");return;}
  await finish("uncertain","Browser transport started; inspect output if interrupted");
  const result=await browserDriver.deliver(job,document,bytes);
  await finish(result.status,result.error);
 } finally {busy=false;}
}
