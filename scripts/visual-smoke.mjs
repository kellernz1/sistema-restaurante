import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {createServerClient} from "@supabase/ssr";
import {loadEnvFile} from "./local/lib.mjs";
import {textProblems} from "./check-text.mjs";

const env={...loadEnvFile(),...process.env};
const base=env.PUBLIC_TEST_URL||env.NEXT_PUBLIC_APP_URL;
if(!base)throw new Error("Set PUBLIC_TEST_URL or start the configured local stack.");
const executable=env.VISUAL_BROWSER_PATH||["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p=>fs.existsSync(p));
if(!executable)throw new Error("Set VISUAL_BROWSER_PATH to an installed Chromium/Edge executable.");
const output=path.resolve("artifacts/visual",new Date().toISOString().replaceAll(":","-"));fs.mkdirSync(output,{recursive:true});
const jar=new Map();
const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
const login=await auth.auth.signInWithPassword({email:env.VISUAL_EMAIL||"admin@restaurante.local",password:env.VISUAL_PASSWORD||env.DEMO_PASSWORD||"Demo@12345"});if(login.error)throw login.error;
const browser=await chromium.launch({executablePath:executable,headless:true});const failures=[];
try{
 for(const locale of ["pt-BR","es"])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})).concat({name:"restaurant-locale",value:locale,url:base}));
  for(const route of ["/cashier","/cashier/sessions","/cashier/counter","/kitchen","/admin/settings","/admin/reports","/order"]){
   const page=await context.newPage();const errors=[];
   page.on("pageerror",e=>errors.push(e.message));page.on("console",message=>{if(message.type()==="error")errors.push(`${message.text()} (${message.location().url})`);});
   const name=`${locale}-${viewport.width}-${route.slice(1).replaceAll("/","-")}`;
   try{
    const response=await page.goto(base+route,{waitUntil:"networkidle",timeout:30000});assert.ok(response?.ok(),`HTTP ${response?.status()}`);assert.equal(new URL(page.url()).pathname,route,"Unexpected redirect");
    const text=await page.locator("body").innerText();assert.deepEqual(textProblems(text),[],"Suspicious visible text");
    const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),outside:[...document.querySelectorAll(".cash-sessions fieldset > legend")].filter(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.top<b.top||a.bottom>b.bottom||a.left<b.left||a.right>b.right;}).length}));
    assert.ok(geometry.scroll<=geometry.width+1,`Horizontal overflow ${geometry.scroll}/${geometry.width}`);assert.equal(geometry.outside,0,"Cash title outside its card");assert.deepEqual(errors,[],"Browser console errors");
    console.log(`PASS ${name}`);
   }catch(error){failures.push({page:name,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}
   finally{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});await page.close();}
  }await context.close();
 }
}finally{await browser.close();await auth.auth.signOut({scope:"local"});}
fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({failures},null,2));
console.log(`Screenshots: ${output}`);if(failures.length)process.exitCode=1;
