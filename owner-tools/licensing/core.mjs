import fs from "node:fs";
import path from "node:path";
import {generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify,randomUUID}from "node:crypto";
export const DOMAIN="MesaCertaLicense/v1.";
export const ALL_FEATURES=["delivery","whatsapp"];
export function generateKeys(directory){
 fs.mkdirSync(directory,{recursive:true});
 const{privateKey,publicKey}=generateKeyPairSync("ed25519");
 const privateFile=path.join(directory,"private.pem"),publicFile=path.join(directory,"public.json");
 fs.writeFileSync(privateFile,privateKey.export({type:"pkcs8",format:"pem"}),{flag:"wx",mode:0o600});
 fs.writeFileSync(publicFile,JSON.stringify({algorithm:"Ed25519",public_key:Buffer.from(publicKey.export({format:"jwk"}).x,"base64url").toString("hex")},null,2),{flag:"wx"});
 return{privateFile,publicFile};
}
export function encodeLicense(claims,privateKey){const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");return payload+"."+sign(null,Buffer.from(DOMAIN+payload),createPrivateKey(privateKey)).toString("base64url");}
export function decodeLicense(token,publicKey){
 const parts=String(token).split(".");if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))throw Error("Invalid license envelope");
 if(!verify(null,Buffer.from(DOMAIN+parts[0]),createPublicKey(publicKey),Buffer.from(parts[1],"base64url")))throw Error("Invalid license signature");
 return JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
}
export function withRegistry(file,action){
 fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+".lock",fd=fs.openSync(lock,"wx",0o600);
 try{
  const registry=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):{version:1,installations:{},commands:{}};
  const result=action(registry),temporary=file+"."+randomUUID()+".tmp";
  try{fs.writeFileSync(temporary,JSON.stringify(registry,null,2),{flag:"wx",mode:0o600});fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
  return result;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export function days(value,maximum=366){const n=Number(value);if(!Number.isInteger(n)||n<1||n>maximum)throw Error("Invalid days");return n;}
export function installation(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value??""))throw Error("Invalid installation UUID");return value.toLowerCase();}
export function features(value){const f=Array.isArray(value)?value:String(value??ALL_FEATURES.join(",")).split(",").filter(Boolean);if(f.length>64||!f.every(v=>/^[a-z][a-z_]{1,31}$/.test(v)))throw Error("Invalid features");return [...new Set(f)].sort();}
export function issue(registry,id,privateKey,{nonce=null,now=new Date()}={}){
 const r=registry.installations[id];if(!r)throw Error("Installation not registered");
 const issued=now.toISOString(),expires=new Date(Math.min(Date.parse(r.paid_until),now.getTime()+31*86400000)).toISOString();
 const claims={v:1,license_id:r.license_id,installation_id:id,restaurant:r.restaurant,plan:r.plan,features:r.features,sequence:++r.sequence,issued_at:issued,expires_at:expires,grace_until:new Date(Date.parse(expires)+r.grace_days*86400000).toISOString(),suspended:r.suspended,...(nonce?{online_nonce:nonce}:{})};
 const token=encodeLicense(claims,privateKey);r.history.push({sequence:r.sequence,issued_at:issued,expires_at:expires,token});return token;
}
export function extend(registry,id,options){
 id=installation(id);const count=days(options.days),grace=Number(options.grace??7),plan=options.plan??registry.installations[id]?.plan??"pilot";
 if(!Number.isInteger(grace)||grace<0||grace>31||!/^[a-z][a-z0-9_-]{1,31}$/.test(plan))throw Error("Invalid grace or plan");
 const current=registry.installations[id];const restaurant=String(options.restaurant??current?.restaurant??"").trim();if(!restaurant||restaurant.length>160)throw Error("Restaurant required (max 160 characters)");
 const r=current??{license_id:randomUUID(),sequence:0,history:[],suspended:false};
 Object.assign(r,{restaurant,plan,features:plan==="pilot"?[...ALL_FEATURES]:features(options.features??current?.features),grace_days:grace,paid_until:new Date(Math.max(Date.now(),Date.parse(current?.paid_until??"0")||0)+count*86400000).toISOString()});
 registry.installations[id]=r;return r;
}
