import {guardEntry} from "./target-safety.mjs";
import {createClient}from "./target-client.mjs";
import {loadEnvFile}from "./local/lib.mjs";
import {licensingRpc,renewLicense}from "./license-renewal.mjs";
await guardEntry(import.meta.url,"runtime");

const env={...loadEnvFile(),...process.env};
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let stopped=false,nextRetry=0,lastSuccess=performance.now(),reportedReady=false;process.on("SIGTERM",()=>{stopped=true;});process.on("SIGINT",()=>{stopped=true;});
while(!stopped){
 try{const result=await licensingRpc(db,"license_tick");if(result.error)throw Error();if(performance.now()>=nextRetry){const renewal=await renewLicense(db,{publicKey:env.LICENSE_PUBLIC_KEY,force:performance.now()-lastSuccess>=7*86400000});if(renewal.failed)nextRetry=performance.now()+3600000;else if(renewal.attempted)lastSuccess=performance.now();}if(!reportedReady){console.log("License worker active.");reportedReady=true;}}
 catch{console.error("License worker unavailable; reconnecting without interrupting existing service.");}
 if(process.argv.includes("--once"))break;
 await new Promise(resolve=>{const timer=setTimeout(resolve,30000);const done=()=>{clearTimeout(timer);resolve();};process.once("SIGTERM",done);process.once("SIGINT",done);setTimeout(()=>{process.removeListener("SIGTERM",done);process.removeListener("SIGINT",done);},30100).unref();});
}
