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
const table=await auth.from("tables").select("qr_token").limit(1).single();if(table.error)throw table.error;
const payable=await auth.from("orders").select("table_id,tables!inner(table_number,status)").eq("order_type","dine_in").in("status",["open","ready"]).in("tables.status",["occupied","closing"]).neq("payment_status","paid").limit(1).maybeSingle();if(payable.error)throw payable.error;
const translations=JSON.parse(fs.readFileSync("src/lib/i18n/es.json","utf8"));
const browser=await chromium.launch({executablePath:executable,headless:true});const failures=[];
try{
 for(const locale of ["pt-BR","es"])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,colorScheme:env.VISUAL_THEME==="dark"?"dark":"light"});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})).concat({name:"restaurant-locale",value:locale,url:base}));
  for(const route of ["/cashier","/cashier/sessions","/cashier/counter","/kitchen","/admin","/admin/settings","/admin/settings/employees","/admin/reports","/order",`/t/${table.data.qr_token}`]){
   const page=await context.newPage();const errors=[];
   page.on("pageerror",e=>errors.push(e.message));page.on("console",message=>{if(message.type()==="error")errors.push(`${message.text()} (${message.location().url})`);});
   const name=`${locale}-${viewport.width}-${route.slice(1).replaceAll("/","-")}`;
   try{
    const response=await page.goto(base+route,{waitUntil:"networkidle",timeout:30000});assert.ok(response?.ok(),`HTTP ${response?.status()}`);assert.equal(new URL(page.url()).pathname,route,"Unexpected redirect");
    if(route==="/admin/settings"){
      await page.locator("#settings-nav-backup").click();
      await page.locator(".operations-panel input[type=number]").first().waitFor();
      assert.equal(await page.locator(".operations-panel input[type=number]").count(),5);
      await page.locator(".operations-panel").screenshot({path:path.join(output,name+"-operations.png")});
    }
    await page.locator(".print-history").evaluateAll(elements=>elements.forEach(element=>{element.open=true;}));
    if(await page.locator(".print-job-select").count()){
      const bulk=page.locator(".print-bulk");
      await bulk.locator('input[type="checkbox"]').check();
      assert.ok(await bulk.locator("strong").isVisible());
      assert.equal(await page.locator('.print-job-select:not(:checked)').count(),0);
      await page.locator(".print-history").screenshot({path:path.join(output,name+"-print-selection.png")});
      await bulk.locator('input[type="checkbox"]').uncheck();
      assert.equal(await page.locator('.print-job-select:checked').count(),0);
    }
    if(route==="/cashier"&&payable.data?.tables){
      const label=value=>locale==="es"?translations[value]??value:value;
      await page.locator(".cashier-table").filter({has:page.locator("strong").filter({hasText:new RegExp(`^Mesa\\s*${payable.data.tables.table_number}$`)})}).click();
      const closeBill=page.locator(".cashier-bill").getByRole("button",{name:label("Fechar conta"),exact:true});await closeBill.click();
      const modal=page.locator(".bill-dialog");await modal.waitFor({state:"visible"});
      const add=modal.getByRole("button",{name:label("Adicionar pagamento"),exact:true});
      for(let index=0;index<3;index++)await add.click();
      assert.equal(await modal.locator(".payment-entry").count(),3);
      const bounds=await modal.boundingBox(),actions=await modal.locator(".payment-panel-actions .primary-button").boundingBox();
      assert.ok(bounds&&Math.abs(bounds.x+bounds.width/2-viewport.width/2)<2&&Math.abs(bounds.y+bounds.height/2-viewport.height/2)<2,"Bill confirmation must be centered");
      assert.ok(actions&&actions.y>=0&&actions.y+actions.height<=viewport.height,"Payment action must remain visible");
      assert.ok(await modal.locator(".payment-panel-content").evaluate(el=>el.scrollHeight>el.clientHeight),"Long split payments must scroll inside the dialog");
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      await modal.screenshot({path:path.join(output,name+"-bill-split.png")});
      await modal.locator(".bill-dialog-close").click();assert.equal(await modal.isVisible(),false);
      assert.notEqual(await page.evaluate(()=>document.body.style.overflow),"hidden");
      await closeBill.click();await modal.waitFor({state:"visible"});await modal.getByRole("button",{name:label("Adicionar pagamento"),exact:true}).click();
      await modal.screenshot({path:path.join(output,name+"-bill-single.png")});
    }
    if(route.startsWith("/cashier")){
      const expected=route.startsWith("/cashier/counter")?"/cashier/counter":route.startsWith("/cashier/sessions")?"/cashier/sessions":"/cashier";
      assert.equal(await page.locator('.cashier-workspace-nav a[aria-current="page"]').getAttribute("href"),expected);
    }
    if(route==="/cashier/counter"){
      await page.locator(".counter-products button").first().click();
      await page.locator('.counter-cart input[maxlength="120"]').fill("Counter navigation");
      await page.locator('.cashier-workspace-nav a[href="/cashier"]').click();await page.waitForURL(/\/cashier$/);
      await page.locator('.cashier-workspace-nav a[href="/cashier/counter"]').click();await page.waitForURL(/\/cashier\/counter$/);
      await page.locator(".counter-cart article").first().waitFor();
      assert.equal(await page.locator('.counter-cart input[maxlength="120"]').inputValue(),"Counter navigation","Switching views lost the draft name");
      assert.equal(await page.locator(".counter-cart article").count(),1,"Switching views lost or duplicated a draft item");
      const heading=await page.locator(".counter-heading").boundingBox(),catalog=await page.locator(".counter-catalog").boundingBox();
      assert.ok(heading&&catalog&&catalog.y>=heading.y+heading.height,"Counter search must not overlap its heading");
      const nav=await page.locator(".cashier-workspace-nav").boundingBox(),header=await page.locator(".staff-header").boundingBox();
      assert.ok(nav&&header&&nav.y>=header.y+header.height-1,"Cashier tabs must remain below the main header");
    }
    if(route.startsWith("/t/")){
      assert.ok(await page.locator(".menu-product").count()<=6,"Table menu must paginate products");
      assert.ok(await page.locator(".catalog-category-pages").isVisible(),"Table categories must be directly selectable");
      const categories=page.locator(".catalog-category-pages button");
      for(let index=0;index<await categories.count();index++){
        await categories.nth(index).click();assert.ok(await page.locator(".menu-product").count()<=6);
        const pagination=page.locator(".catalog-pagination button");
        if(await pagination.count()>1&&await pagination.last().isEnabled()){
          const first=await page.locator(".menu-product h3").first().innerText();
          await pagination.last().click();assert.notEqual(await page.locator(".menu-product h3").first().innerText(),first);
          assert.ok(await page.locator(".menu-product").count()<=6);await pagination.first().click();break;
        }
      }
      // Exercise the draft cart only; never submit an order or create audit fixtures.
      const add=page.locator(".menu-products button").first();await add.click();
      await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight/2));
      const floating=page.locator(".floating-cart-button"),box=await floating.boundingBox();
      assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height,"Cart shortcut must stay in view");
      assert.ok(Math.abs(box.width-box.height)<2,"Table cart shortcut must be circular");
      const preferences=await page.locator(".interface-preferences").boundingBox();
      assert.ok(box&&preferences&&(box.x+box.width<=preferences.x||preferences.x+preferences.width<=box.x||box.y+box.height<=preferences.y||preferences.y+preferences.height<=box.y),"Cart shortcut must not overlap theme/language controls");
      await floating.click();const cart=page.locator(".customer-cart-dialog");assert.ok(await cart.isVisible());
      assert.equal(await cart.locator("output").first().innerText(),"1");
      await cart.locator(".quantity-control button").nth(1).click();assert.equal(await cart.locator("output").first().innerText(),"2");
      await cart.locator('input[autocomplete="given-name"]').fill("Cart preview");
      await cart.locator(".customer-cart-header button").click();await floating.click();
      assert.equal(await cart.locator('input[autocomplete="given-name"]').inputValue(),"Cart preview");
      const send=await cart.locator(".customer-cart-footer > button").last().boundingBox();assert.ok(send&&send.y>=0&&send.y+send.height<=viewport.height,"Send action must stay visible in the cart footer");
    }
    const text=await page.locator("body").innerText();assert.deepEqual(textProblems(text),[],"Suspicious visible text");
    const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),outside:[...document.querySelectorAll(".cash-sessions fieldset > legend")].filter(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.top<b.top||a.bottom>b.bottom||a.left<b.left||a.right>b.right;}).length}));
    assert.ok(geometry.scroll<=geometry.width+1,`Horizontal overflow ${geometry.scroll}/${geometry.width}`);assert.equal(geometry.outside,0,"Cash title outside its card");assert.deepEqual(errors,[],"Browser console errors");
    console.log(`PASS ${name}`);
   }catch(error){failures.push({page:name,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}
   finally{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});await page.close();}
  }await context.close();
 }
 // Existing waiter accounts must get a friendly screen when waiter service is disabled.
 await auth.auth.signOut({scope:"local"});jar.clear();
 const waiter=await auth.auth.signInWithPassword({email:"garcom@restaurante.local",password:env.DEMO_PASSWORD||"Demo@12345"});if(waiter.error)throw waiter.error;
 const policy=await auth.from("service_policy").select("uses_waiter").single();if(policy.error)throw policy.error;
 if(!policy.data.uses_waiter)for(const locale of ["pt-BR","es"])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})).concat({name:"restaurant-locale",value:locale,url:base}));
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  const name=`${locale}-${viewport.width}-waiter-disabled`;
  try{const response=await page.goto(base+"/waiter",{waitUntil:"networkidle"});assert.ok(response?.ok());const text=await page.locator("body").innerText();assert.match(text,locale==="es"?/camarero est\u00e1 desactivada/:/gar\u00e7om est\u00e1 desativado/);assert.deepEqual(textProblems(text),[]);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));console.log(`PASS ${name}`);}catch(error){failures.push({page:name,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}finally{await page.screenshot({path:path.join(output,name+".png"),fullPage:true});await context.close();}
 }
}finally{await browser.close();await auth.auth.signOut({scope:"local"});}
fs.writeFileSync(path.join(output,"results.json"),JSON.stringify({failures},null,2));
console.log(`Screenshots: ${output}`);if(failures.length)process.exitCode=1;
