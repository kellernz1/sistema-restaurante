import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

test("approval request IDs work on LAN HTTP without crypto.randomUUID",()=>{
 const source=fs.readFileSync(new URL("../src/lib/uuid.ts",import.meta.url),"utf8").replace("export function uuid", "function uuid");
 const context=vm.createContext({crypto:{getRandomValues:array=>webcrypto.getRandomValues(array)}});
 const ids=vm.runInContext(source+"; Array.from({length:100},()=>uuid())",context);
 assert.equal(new Set(ids).size,100);
 for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 const ui=fs.readFileSync(new URL("../src/features/approvals/sensitive-actions.tsx",import.meta.url),"utf8");
 assert.doesNotMatch(ui,/crypto\.randomUUID\(/);
 assert.match(ui,/request: uuid\(\)/);
});
