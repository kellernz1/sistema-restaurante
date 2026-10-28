import {createFilesystemTarget,directoryTarget} from "../scripts/target-safety.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { buildPrintDocument,wrapText } from "../src/features/printing/document.ts";
import { renderEscPos,encodePrintText } from "../src/features/printing/escpos.ts";
import { FilePrintDriver } from "../scripts/printing-file-driver.mjs";
import { processOnePrint } from "../scripts/printing-process.mjs";

const device={id:randomUUID(),name:"Test",driver:"file",paper_mm:80,columns:48,codepage:"cp860",codepage_number:3,locale:"pt-BR"};
const snapshot={restaurant:"Mesa Certa",ticket:12,name:"Ana",total:25000,date:"2026-10-25T12:00:00Z",timezone:"America/Asuncion",token:"a".repeat(64),items:[{id:randomUUID(),name:"Prato",quantity:1,notes:"Sem cebola",price:25000}],payments:[{method:"pix",currency:"BRL",original:1800,equivalent:25000,change:0,rate:"1400"}]};
test("discount receipts and cancellation snapshots render on both paper widths",()=>{
 for(const paper_mm of [58,80])for(const locale of ["pt-BR","es"]){
  const d={...device,paper_mm,columns:paper_mm===58?32:48,locale};
  const receipt=buildPrintDocument({kind:"receipt",additional:false,reprint:false,device:d,snapshot:{...snapshot,total:22500,discount:2500}},"http://localhost:3000");
  assert.ok(receipt.blocks.some(b=>b.type==="text"&&/Desconto|Descuento/.test(b.text)&&b.text.includes("2.500")));
  const cancellation=buildPrintDocument({kind:"cancellation",additional:false,reprint:true,device:d,snapshot:{...snapshot,cancellation:true,reason:"Sem estoque",payments:undefined}},"http://localhost:3000");
  assert.ok(cancellation.blocks.some(b=>b.type==="text"&&b.text==="ITEM CANCELADO"&&b.large));
  assert.ok(cancellation.blocks.some(b=>b.type==="text"&&b.text==="Sem estoque"));
  assert.ok(renderEscPos(cancellation,d).length>0);
 }
});
test("a fully discounted paid receipt never claims payment is pending",()=>{
 const document=buildPrintDocument({kind:"receipt",additional:false,reprint:false,device,snapshot:{...snapshot,total:0,discount:25000,payment_status:"paid",payments:[]}},"http://localhost:3000");
 assert.ok(document.blocks.some(b=>b.type==="text"&&b.text==="Quitado por desconto integral"));
 assert.ok(!document.blocks.some(b=>b.type==="text"&&b.text==="Pagamento pendente"));
});
test("ESC/POS encodes both supported tables and sanitizes control injection",()=>{
 for(const codepage of ["cp860","cp850"]){const special="ãõçáéíóúñ¿¡";const bytes=encodePrintText(special,codepage);assert.equal(bytes.length,11);assert.ok([...bytes].every(b=>b>127&&b!==63));}
 assert.deepEqual([...encodePrintText("ãñ¿¡","cp860")],[132,164,168,173]);
 assert.deepEqual([...encodePrintText("ãñ¿¡","cp850")],[198,164,168,173]);
 assert.equal(encodePrintText("😀","cp860")[0],63);
 assert.ok(wrapText("A\u001b@B",32).join("").indexOf("\u001b")===-1);
});
test("58/80 mm documents wrap large headings and long words, preserve QR and cut commands",()=>{
 for(const [paper_mm,columns] of [[58,32],[80,48]]){
  const config={...device,paper_mm,columns};const document=buildPrintDocument({kind:"receipt",additional:false,reprint:true,snapshot,device:config},"http://restaurant.local:3000");
  assert.equal(document.columns,columns);const bytes=renderEscPos(document,config);
  assert.deepEqual([...bytes.slice(0,5)],[27,64,27,116,3]);assert.deepEqual([...bytes.slice(-3)],[29,86,0]);
  assert.ok(Buffer.from(bytes).includes(Buffer.from("/track/")));assert.ok(document.blocks.some(b=>b.text?.includes("Gs. 25.000")));assert.ok(document.blocks.some(b=>b.text?.includes("1400")));
  assert.ok(wrapText("word "+"x".repeat(120),columns).every(line=>Array.from(line).length<=columns));
 }
 assert.throws(()=>wrapText("x",0));
});
test("additional documents use only their snapshot and test page covers accents and width",()=>{
 const additional=buildPrintDocument({kind:"kitchen",additional:true,reprint:false,snapshot:{...snapshot,items:[{...snapshot.items[0],name:"Extra"}]},device},"http://restaurant.local");
 assert.ok(additional.blocks.some(b=>b.text==="ADICIONAL"));assert.ok(!JSON.stringify(additional).includes("Prato"));
 const doc=buildPrintDocument({kind:"test",additional:false,reprint:false,snapshot:{},device},"http://restaurant.local");
 assert.ok(doc.blocks.some(b=>b.text==="ã õ ç á é í ó ú ñ ¿ ¡"));assert.ok(doc.blocks.some(b=>b.text?.length===48));
});
test("discounted receipt keeps original payments and shows historical refunds at both widths",()=>{
 for(const locale of ["pt-BR","es"])for(const [paper_mm,columns]of [[58,32],[80,48]]){
  const doc=buildPrintDocument({kind:"receipt",additional:false,reprint:false,device:{...device,locale,paper_mm,columns},snapshot:{...snapshot,total:40000,discount:10000,refunded:20000,refunds:[{method:"pix",currency:"BRL",original:1450,amount:20000,rate:"1400.00000000",reason:"Discounted refund"}]}},"http://restaurant.local");
  const text=doc.blocks.map(b=>b.text??"").join("\n");assert.match(text,/Gs\. 40\.000/);assert.match(text,/Gs\. 10\.000/);assert.match(text,/Gs\. 20\.000/);assert.match(text,/1400\.00000000/);assert.match(text,/14,50/);
  assert.ok(doc.blocks.some(b=>b.type==="qr"));assert.ok(wrapText(text,columns).every(line=>Array.from(line).length<=columns));
 }
});
test("file driver writes exclusive artifacts and never overwrites an uncertain previous output",async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),"mesa-print-test-"));
 try{const driver=new FilePrintDriver(createFilesystemTarget(directory),directoryTarget(createFilesystemTarget(directory),directory));const job={id:randomUUID()};const document={blocks:[],columns:48,paperMm:80};const bytes=Uint8Array.from([27,64,10]);
  assert.equal((await driver.deliver(job,document,bytes)).status,"sent");assert.deepEqual(await fs.readFile(path.join(directory,job.id+".bin")),Buffer.from(bytes));
  assert.equal((await driver.deliver(job,document,bytes)).status,"uncertain");
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test("processor persists uncertainty before output and does not redeliver after lost acknowledgement",async()=>{
 let status="pending", deliveries=0, offline=true;
 const job={id:randomUUID(),claim_token:randomUUID(),kind:"receipt",additional:false,reprint:false,snapshot,device};
 const db={async rpc(name,args){
  if(offline)return {error:new Error("Database restarted")};
  if(name==="claim_print_job"){if(status!=="pending")return {data:null};status="processing";return {data:job};}
  if(args.p_status==="sent")return {error:new Error("Acknowledgement lost")};
  status=args.p_status;return {data:null};
 }};
 const context={db,owner:randomUUID(),driver:{async deliver(){assert.equal(status,"uncertain");deliveries++;return {status:"sent"};}},appUrl:"http://restaurant.local"};
 await assert.rejects(processOnePrint(context));assert.equal(deliveries,0);
 offline=false;await assert.rejects(processOnePrint(context));assert.equal(deliveries,1);assert.equal(status,"uncertain");
 assert.equal(await processOnePrint(context),null);assert.equal(deliveries,1);
});
