import {createPublicKey,verify}from "node:crypto";
export function verifyLicenseToken(token,hex){
 const parts=String(token).split(".");if(parts.length!==2||!parts.every(v=>/^[A-Za-z0-9_-]+$/.test(v))||! /^[0-9a-f]{64}$/i.test(hex))throw Error("Invalid license envelope/key");
 const key=createPublicKey({key:{kty:"OKP",crv:"Ed25519",x:Buffer.from(hex,"hex").toString("base64url")},format:"jwk"});
 if(!verify(null,Buffer.from("MesaCertaLicense/v1."+parts[0]),key,Buffer.from(parts[1],"base64url")))throw Error("License signature rejected");
 return JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
}
export async function licensingRpc(db,name,args={}){return await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));}
export async function renewLicense(db,{force=false,publicKey}={}){
 if(publicKey){const key=await licensingRpc(db,"license_set_public_key",{p_hex:publicKey});if(key.error)throw Error("License public key setup failed");}
 const claim=await licensingRpc(db,"license_renewal_claim",{p_force:force});if(claim.error)throw Error("License renewal claim failed");
 if(!claim.data)return {attempted:false};const c=claim.data;
 try{
  const url=new URL(c.url);if(url.username||url.password||url.hash||url.search||!(url.protocol==="https:"||(url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname))))throw Error("Invalid licensing URL");
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({installation_id:c.installation_id,nonce:c.nonce,license:c.license}),signal:AbortSignal.timeout(10000),redirect:"error"});
  if(!response.ok||!response.body)throw Error("Renewal unavailable");const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw Error("Renewal response too large");}chunks.push(value);}
  const token=JSON.parse(Buffer.concat(chunks).toString("utf8")).license;
  if(publicKey){const claims=verifyLicenseToken(token,publicKey);if(claims.installation_id!==c.installation_id||claims.online_nonce!==c.nonce)throw Error("Renewal binding mismatch");}
  const result=await licensingRpc(db,"license_renewal_finish",{p_nonce:c.nonce,p_token:token});if(result.error)throw Error("Renewal proof rejected");return{attempted:true,status:result.data};
 }catch{
  const failed=await licensingRpc(db,"license_renewal_finish",{p_nonce:c.nonce,p_error:"unavailable_or_invalid_proof"});if(failed.error)throw Error("Renewal result unavailable; worker will reconnect");return{attempted:true,failed:true,status:failed.data};
 }
}
