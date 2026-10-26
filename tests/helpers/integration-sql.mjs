import {spawn}from "node:child_process";
import {assertIntegrationEnvironment}from "./integration-guard.mjs";

// Fixture setup only. Do not use this helper for actions whose HTTP authorization is under test.
export async function fixtureSql(source){
 const marker=assertIntegrationEnvironment();
 return new Promise((resolve,reject)=>{
  const child=spawn("docker",["exec","-i",`supabase_db_${marker.project}`,"psql","-X","-U","postgres","-d","postgres","-At","-v","ON_ERROR_STOP=1"],{windowsHide:true,stdio:["pipe","pipe","pipe"]});let output="",error="";
  child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>code===0?resolve(output.trim()):reject(Error(error)));child.stdin.end(source);
 });
}
