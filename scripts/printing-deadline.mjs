export const PRINT_RPC_TIMEOUT_MS=10000;
export const PRINT_DRIVER_TIMEOUT_MS=30000;
export const PRINT_WORKER_VERSION="4A.1";

/** Abort the transport where supported, and always bound how long the worker waits. */
export async function withPrintDeadline(task,milliseconds,label="Print operation") {
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error(`${label} timed out`);error.name="TimeoutError";reject(error);},milliseconds);});
  try{return await Promise.race([Promise.resolve().then(()=>task(controller.signal)),timeout]);}
  finally{clearTimeout(timer);}
}

export async function printRpc(db,name,args,timeout=PRINT_RPC_TIMEOUT_MS){
  return withPrintDeadline(signal=>{const query=db.rpc(name,args);return typeof query.abortSignal==="function"?query.abortSignal(signal):query;},timeout,name);
}
