import {createClient as rawCreateClient} from "@supabase/supabase-js";
import {resolveTarget,authorizeOperation,targetKeys,requireTransport} from "./target-safety.mjs";

export function createClient(url,key,options={}){
 const context=resolveTarget();requireTransport(context);authorizeOperation(context,"runtime");
 const keys=targetKeys(context);
 if(url!==context.apiUrl||![keys.apiKey,keys.publicKey].includes(key))throw Error("Mixed HTTP target or credential refused");
 const supplied=options.global?.fetch??globalThis.fetch;
 return rawCreateClient(url,key,{...options,global:{...options.global,fetch:(input,init)=>{
  authorizeOperation(context,"runtime");
  const requestUrl=new URL(typeof input==="string"?input:input.url??String(input));
  if(requestUrl.origin!==new URL(context.apiUrl).origin)throw Error("HTTP target escaped installation");
  return supplied(input,init);
 }}});
}
