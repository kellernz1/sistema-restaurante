import http from "node:http";
import {createPublicKey,timingSafeEqual}from "node:crypto";
import {decodeLicense,withRegistry,extend,issue,installation}from "./core.mjs";
export function createLicenseServer({privateKey,registryFile,adminToken}){
 if(typeof adminToken!=="string"||adminToken.length<32)throw Error("Administrative bearer token must have at least 32 characters");
 const publicKey=createPublicKey(privateKey).export({type:"spki",format:"pem"});
 return http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,"http://reference.local");
   if(url.pathname.startsWith("/admin/")){
    const actual=Buffer.from(req.headers.authorization??""),expected=Buffer.from("Bearer "+adminToken);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(401,{error:"unauthorized"});
   }
   let raw="";for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>16384)return send(413,{error:"too_large"});}
   const body=raw?JSON.parse(raw):{};
   if(req.method==="POST"&&url.pathname==="/v1/renew"){
    const id=installation(body.installation_id);if(!/^[0-9a-f-]{36}$/i.test(body.nonce??""))throw Error("Invalid nonce");
    const prior=decodeLicense(body.license,publicKey);if(prior.installation_id!==id)throw Error("Installation mismatch");
    const token=withRegistry(registryFile,registry=>{
     const r=registry.installations[id];if(!r||r.license_id!==prior.license_id)throw Error("Unknown license");
     const key=id+":"+body.nonce;if(registry.commands[key])return registry.commands[key];
     const result=issue(registry,id,privateKey,{nonce:body.nonce});registry.commands[key]=result;return result;
    });return send(200,{license:token});
   }
   const match=url.pathname.match(/^\/admin\/installations\/([0-9a-f-]+)(?:\/(extend|suspend))?$/i);
   if(match){const id=installation(match[1]);
    const result=withRegistry(registryFile,registry=>{
     if(req.method==="GET"&&!match[2]){const r=registry.installations[id];if(!r)throw Error("Installation not registered");const{history,...publicRecord}=r;return{...publicRecord,issued_count:history.length};}
     if(req.method!=="POST"||!body.request_id||!/^[0-9a-f-]{36}$/i.test(body.request_id))throw Error("Administrative request UUID required");
     const key="admin:"+body.request_id,payload=JSON.stringify({id,action:match[2],body});const old=registry.commands[key];if(old){if(old.payload!==payload)throw Error("Request key changed");return old.result;}
     if(match[2]==="extend")extend(registry,id,body);
     else if(match[2]==="suspend"){if(!registry.installations[id])throw Error("Installation not registered");if(typeof body.suspended!=="boolean")throw Error("Suspended boolean required");registry.installations[id].suspended=body.suspended;}
     else throw Error("Unknown action");
     const response={license:issue(registry,id,privateKey)};registry.commands[key]={payload,result:response};return response;
    });return send(200,result);
   }
   return send(404,{error:"not_found"});
  }catch{return send(400,{error:"invalid_request"});}
 });
}
