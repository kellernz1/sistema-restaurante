import fs from "node:fs";
import path from "node:path";
import {fileURLToPath}from "node:url";
import {randomUUID}from "node:crypto";
import {generateKeys,withRegistry,extend,issue,installation}from "./core.mjs";
import {createLicenseServer}from "./server.mjs";
function main(){
const [command,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith("--")||args[i+1]===undefined)throw Error("Use --name value options");options[args[i].slice(2)]=args[i+1];}
const tool=path.dirname(fileURLToPath(import.meta.url)),candidate=path.resolve(tool,"../..");
const root=fs.existsSync(path.join(candidate,"supabase","migrations"))&&fs.existsSync(path.join(candidate,"src","app"))?candidate:tool;
function external(file){if(!file)throw Error("External path required");const p=path.resolve(file);if(p===root||p.startsWith(root+path.sep))throw Error("Owner keys and registry must stay outside the application repository");return p;}
if(process.env.APP_MODE==="local")throw Error("Run this owner tool outside the restaurant application environment");
if(command==="keygen")console.log(JSON.stringify(generateKeys(external(options.directory))));
else if(command==="list")console.log(JSON.stringify(withRegistry(external(options.registry),r=>Object.entries(r.installations).map(([installation_id,x])=>({installation_id,restaurant:x.restaurant,plan:x.plan,paid_until:x.paid_until,suspended:x.suspended,issued_count:x.history.length}))),null,2));
else{
 const privateKey=fs.readFileSync(external(options.key),"utf8"),registryFile=external(options.registry);
 if(command==="issue"||command==="extend"){
  const output=options.out?external(options.out):null;
  if(output&&fs.existsSync(output))throw Error("Output already exists; keep the existing license or choose a different output path");
  const id=installation(options.installation);const token=withRegistry(registryFile,r=>{
   const {out:ignoredOutput,...issueOptions}=options;void ignoredOutput;
   const request=options.request?installation(options.request):null,key=request?"cli:"+request:null,payload=JSON.stringify({command,...issueOptions});
   if(key&&r.commands[key]){if(r.commands[key].payload!==payload)throw Error("Request key changed");return r.commands[key].token;}
   if(command==="issue"&&r.installations[id])throw Error("Installation already registered; use extend or replay its original --request UUID");
   extend(r,id,options);const token=issue(r,id,privateKey);if(key)r.commands[key]={payload,token};return token;
  });
  if(typeof token!=="string"||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(token))throw Error("Issuer returned no valid license");
  if(output){
   const temporary=output+"."+randomUUID()+".tmp";
   try{
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(temporary,token+"\n",{flag:"wx",mode:0o600});
    // Publish atomically without replacing an existing output; failed issuance never opens this file.
    fs.linkSync(temporary,output);
   }finally{fs.rmSync(temporary,{force:true});}
   console.log("License file created successfully.");
  }else console.log(token);
 }else if(command==="serve"){
  const server=createLicenseServer({privateKey,registryFile,adminToken:process.env.LICENSE_ADMIN_TOKEN});const port=Number(options.port??8787);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid port");server.listen(port,"127.0.0.1",()=>console.log("Reference licensing server listening on loopback port "+port));
 }else throw Error("Commands: keygen, issue, extend, list, serve");
}
}
try{main();}catch(error){
 const known=["External path required","Owner keys and registry must stay outside the application repository","Run this owner tool outside the restaurant application environment","Use --name value options","Invalid installation UUID","Invalid days","Invalid grace or plan","Restaurant required (max 160 characters)","Installation already registered; use extend or replay its original --request UUID","Request key changed","Output already exists; keep the existing license or choose a different output path","Issuer returned no valid license"];
 const reason=known.includes(error?.message)?error.message:"Check input files, permissions, key format and registry lock";
 console.error("License command failed: "+reason+". No license file was published. Do not continue with saving or importing.");
 process.exitCode=1;
}
