import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root=path.resolve(import.meta.dirname,"..");
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(directory,e.name)):[path.join(directory,e.name)]);
export function unsafeTargetImports(file,source){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),errors=[];
 const normalized=file.replaceAll("\\","/");
 const internal=normalized.includes("/local/safety-internal/");
 const facade=/\/scripts\/target-(operations|provider)\.mjs$/.test(normalized);
 const rawProcess=/\/scripts\/target-(safety|process)\.mjs$/.test(normalized);
 function visit(n){
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
   const spec=n.moduleSpecifier.text;
   if(spec.includes("safety-internal/")&&!internal&&!facade)errors.push("private implementation import");
   if(spec==="node:child_process"&&!rawProcess)errors.push("unguarded process transport");
   if(spec==="@supabase/supabase-js"&&!normalized.endsWith("/scripts/target-client.mjs"))errors.push("unguarded HTTP client");
   if(spec.endsWith("lib.mjs")&&!internal&&!facade&&!normalized.endsWith("/scripts/local/operations-process.mjs")&&ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>["runSupabase","writeEnvFile","ensureDirectory","startDetached","pipeFileToProcess","pipeProcessToFile"].includes((e.propertyName??e.name).text)))errors.push("direct low-level writer import");
   if(spec.endsWith("operations-process.mjs")&&!internal&&!facade&&ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>["command","rotateLog","logLine"].includes((e.propertyName??e.name).text)))errors.push("direct process writer import");
   if(spec.endsWith("operations.ts")&&!normalized.endsWith("/scripts/target-state.mjs")&&ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>["atomicJson","patchOperationsState"].includes((e.propertyName??e.name).text)))errors.push("unguarded operational state writer");
   if(spec.endsWith("target-safety.mjs")&&!internal&&ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>(e.propertyName??e.name).text==="withTargetOperation"))errors.push("private operation delegation");
   if(spec.endsWith("target-safety.mjs")&&!/\/scripts\/(?:integration\/run|local\/test-provision)\.mjs$/.test(normalized)&&ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>["createDisposableTarget","activateDisposableTarget"].includes((e.propertyName??e.name).text)))errors.push("unapproved disposable controller");
  }ts.forEachChild(n,visit);
 }visit(ast);return errors;
}
test("scripts cannot import data writers or transports outside the target barrier",()=>{
 const failures=[];for(const file of walk(path.join(root,"scripts")).filter(f=>f.endsWith(".mjs"))){const errors=unsafeTargetImports(file,fs.readFileSync(file,"utf8"));if(errors.length)failures.push({file:path.relative(root,file),errors});}
 assert.deepEqual(failures,[]);
});
test("static guard rejects a new script importing a private writer or raw client",()=>{
 const file=path.join(root,"scripts/unsafe-new-script.mjs");
 for(const source of ['import {createBackup} from "./local/safety-internal/backup.mjs";','import {spawn} from "node:child_process";','import {createClient} from "@supabase/supabase-js";'])assert.ok(unsafeTargetImports(file,source).length);
});
