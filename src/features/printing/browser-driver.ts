import type { PrintDriver } from "./driver";

export const browserDriver: PrintDriver = {
 async deliver(job) {
  const frame=document.createElement("iframe");
  frame.style.cssText="position:fixed;width:1px;height:1px;left:-10000px;top:0";
  frame.title="Print";
  try {
   await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Print page timeout")),15000);
    frame.onload=()=>{clearTimeout(timeout);if(frame.contentDocument?.querySelector(`[data-print-job="${job.id}"]`))resolve();else reject(new Error("Print page unavailable"));};
    frame.onerror=()=>{clearTimeout(timeout);reject(new Error("Print page unavailable"));};
    frame.src=`/print/jobs/${job.id}`; document.body.appendChild(frame);
   });
   await frame.contentDocument?.fonts.ready;
   await Promise.all(Array.from(frame.contentDocument?.images ?? []).map(img=>img.decode()));
   const target=frame.contentWindow;
   if(!target) throw new Error("No print window");
   await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Print acknowledgement timeout")),90000);
    target.addEventListener("afterprint",()=>{clearTimeout(timeout);resolve();},{once:true});
    try { target.focus();target.print(); } catch(error) { clearTimeout(timeout);reject(error); }
   });
   return {status:"sent"};
  } catch { return {status:"uncertain",error:"Browser print outcome unknown; inspect before reprinting"}; }
  finally { frame.remove(); }
 },
};
