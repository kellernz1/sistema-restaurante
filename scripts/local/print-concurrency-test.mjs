import { sqlTestDatabase } from "./sql-test-target.mjs";
import assert from "node:assert/strict";
import { spawn } from "../target-process.mjs";
import { randomUUID } from "node:crypto";
import { findDbContainer, run } from "./lib.mjs";

/** Requires an idle local queue. Two real PostgreSQL sessions contend for the global lease. */
export async function runPrintConcurrencyTest() {
  const container=findDbContainer(),owner=randomUUID(),other=randomUUID();
  const args=["exec","-i",container,"psql","-X","-tA","-U","postgres","-d",sqlTestDatabase(),"-v","ON_ERROR_STOP=1"];
  const initial=run("docker",[...args,"-c","select coalesce(owner_id::text,''),expires_at::text from public.print_processor_lease where id and expires_at<=now()"],{capture:true}).stdout.trim();
  if(!initial)throw new Error("Stop active print processors before the concurrency suite");
  const [priorOwner,priorExpiry]=initial.split("|");
  const session=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});
  let output="",errors="";
  const done=new Promise((resolve,reject)=>{session.on("error",reject);session.on("close",code=>code===0?resolve():reject(new Error(errors)));});
  const locked=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Lease session timed out")),10000);
    session.stdout.on("data",chunk=>{output+=chunk;if(output.includes("LEASE_LOCKED")){clearTimeout(timeout);resolve();}});
    session.on("close",()=>{clearTimeout(timeout);if(!output.includes("LEASE_LOCKED"))reject(new Error(errors||"Lease session stopped"));});
  });
  session.stderr.on("data",chunk=>{errors+=chunk;});
  session.stdin.end(`begin; select 1 from public.print_processor_lease where id for update; update public.print_processor_lease set owner_id='${owner}',expires_at=now()+interval '1 minute' where id; select 'LEASE_LOCKED'; select pg_sleep(1); commit;`);
  try{
    await locked;
    const result=run("docker",[...args,"-c",`set request.jwt.claim.role='service_role'; select public.claim_print_job('${other}','file') is null;`],{capture:true});
    await done;
    assert.ok(result.stdout.trim().endsWith("t"),"A competing processor bypassed the held lease");
    const actual=run("docker",[...args,"-c","select owner_id from public.print_processor_lease where id"],{capture:true}).stdout.trim();
    assert.equal(actual,owner);
  }finally{
    await done;
    // Restore only the sentinel lease owned by this test, never another processor's claim.
    run("docker",[...args,"-c",`update public.print_processor_lease set owner_id=${priorOwner?`'${priorOwner}'::uuid`:"null"},expires_at='${priorExpiry}'::timestamptz where id and owner_id='${owner}';`],{capture:true});
  }
  console.log("Print processor concurrency passed (two PostgreSQL sessions).");
}
