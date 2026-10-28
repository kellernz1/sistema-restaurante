import {authorizeOperation} from "../../scripts/target-safety.mjs";
import {generateKeyPairSync,randomUUID}from "node:crypto";
import {encodeLicense}from "../../owner-tools/licensing/core.mjs";
import {databaseSql}from "../../scripts/target-operations.mjs";

export function licenseFixtures(id){
 const{privateKey,publicKey}=generateKeyPairSync("ed25519"),pem=privateKey.export({type:"pkcs8",format:"pem"}),key=Buffer.from(publicKey.export({format:"jwk"}).x,"base64url").toString("hex"),now=Date.now();
 const base={v:1,license_id:randomUUID(),installation_id:id,restaurant:"Temporary test restaurant",plan:"pilot",features:["delivery","whatsapp"],issued_at:new Date(now).toISOString(),suspended:false};
 const token=(sequence,days,extra={})=>encodeLicense({...base,sequence,expires_at:new Date(now+days*86400000).toISOString(),grace_until:new Date(now+(days+7)*86400000).toISOString(),...extra},pem);
 return{key,pem,base,token,tokens:{active:token(1,30),seven:token(2,6.8),three:token(3,2.8),grace:token(4,-1),expired:token(5,-9),restored:token(6,30),basic:token(7,30,{plan:"basic",features:[]}),suspended:token(8,30,{suspended:true}),older_issue:token(9,30,{issued_at:new Date(now-3600000).toISOString()}),too_long:token(10,40),wrong_installation:token(11,30,{installation_id:randomUUID()})}};
}
function assertTarget(context){authorizeOperation(context,"sql");if(context.profile!=="disposable")throw Error("Test licenses require a disposable target capability");}
export async function seedTestLicense(context){
 assertTarget(context);const id=(await databaseSql(context,"select installation_id from public.license_installation where id")).trim();const f=licenseFixtures(id);
 await databaseSql(context,`select set_config('request.jwt.claim.role','service_role',false);select public.license_set_public_key('${f.key}');select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin'and is_active limit 1),false);select public.license_import('${f.tokens.active}');`);
 return f;
}
export async function licensingSql(context,source){
 assertTarget(context);const id=(await databaseSql(context,"select installation_id from public.license_installation where id")).trim(),f=licenseFixtures(id);
 const fixtures=`create temporary table license_tokens(label text primary key,token text);grant select on license_tokens to authenticated,service_role;insert into license_tokens values ${Object.entries(f.tokens).map(([name,token])=>`('${name}','${token}')`).join(",")};update public.license_installation set public_key=decode('${f.key}','hex'),max_sequence=0,max_seen_at=clock_timestamp(),clock_deadline=null,clock_ack_until=null,clock_suspect=false,restricted=false;delete from public.license_current;`;
 return databaseSql(context,source.replace("-- TOKEN_FIXTURES",()=>fixtures));
}
