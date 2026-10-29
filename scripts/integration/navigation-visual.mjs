import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveTarget, requireTransport, targetPath } from "../target-safety.mjs";
import { databaseSql } from "../target-operations.mjs";
import { integrationContext } from "./context.mjs";
import { operationDestinations } from "../../src/features/auth/navigation.ts";
import { administrationGroups } from "../../src/features/auth/administration-destinations.ts";
import { textProblems } from "../check-text.mjs";

// Called by test:visual only; real Auth, modes and server guards in its owned stack.
export async function navigationVisual({ browser, auth, jar, env, output, failures }) {
  integrationContext(); const target = resolveTarget(); requireTransport(target); assert.equal(target.profile,"disposable");
  output=targetPath(target,output);
  const translations=JSON.parse(fs.readFileSync(path.join(target.root,"src/lib/i18n/es.json"),"utf8"));
  const base=env.PUBLIC_TEST_URL;
  const prior=JSON.parse((await databaseSql(target,"select json_build_object('counter',p.counter_enabled,'waiter',p.uses_waiter,'tables',s.dine_in_qr_enabled) from public.service_policy p cross join public.restaurant_settings s;")).trim());
  const report={modeRoleCases:0,visualCases:0,denials:0,publicCases:0,failures:[]};
  const roles=[{role:"cashier",email:"caixa",route:"/cashier"},{role:"kitchen",email:"cozinha",route:"/kitchen"},{role:"supervisor",email:"supervisor",route:"/supervisor"},{role:"admin",email:"admin",route:"/cashier"},{role:"admin",email:"admin",route:"/admin",administration:true},{role:"waiter",email:"garcom",route:"/waiter"}];
  async function modes(counter,waiter,tables) { await databaseSql(target,`update public.service_policy set counter_enabled=${counter},uses_waiter=${waiter};update public.restaurant_settings set dine_in_qr_enabled=${tables};`); }
  async function login(email) {
    await auth.auth.signOut({scope:"local"});jar.clear();
    const response=await auth.auth.signInWithPassword({email:`${email}@restaurante.local`,password:env.DEMO_PASSWORD});
    if(response.error)throw Error("Disposable navigation login failed");
  }
  const widths=[{width:1366,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:844}];
  async function scenario(actor,mode,theme,locale,viewport,full) {
    const name=`navigation-${actor.administration?"administration":actor.role}-${Number(mode.counter_enabled)}${Number(mode.uses_waiter)}${Number(mode.dine_in_qr_enabled)}-${theme}-${locale}-${viewport.width}`;
    const context=await browser.newContext({viewport,colorScheme:theme==="system"?"dark":theme});
    await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})).concat({name:"restaurant-locale",value:locale,url:base}));
    await context.addInitScript(theme=>{localStorage.setItem("mesa-certa-theme",theme);},theme);
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
    try {
      await page.goto(base+actor.route,{waitUntil:"networkidle"});await page.locator(".staff-operational-header").waitFor();
      assert.equal(await page.locator(".interface-preferences").count(),0,"Staff preferences must not float");
      assert.equal(await page.locator(".cashier-workspace-nav").count(),0,"Duplicate cashier navigation");
      assert.ok(await page.locator(".print-queue").count()<=1);assert.ok(await page.locator(".counter-queue").count()<=1);
      assert.equal(await page.locator(".cash-session-bar").count(),["admin","cashier"].includes(actor.role)?1:0);
      assert.equal(await page.locator(".staff-print-health").count(),["admin","cashier","kitchen"].includes(actor.role)?1:0);
      const toggle=page.locator(".workspace-toggle");if(await toggle.isVisible())await toggle.click();
      if(actor.administration)await page.locator('#workspace-destinations [data-destination="overview"]').waitFor({state:"visible"});
      const expected=actor.administration?administrationGroups(mode).flatMap(group=>group.destinations):operationDestinations(actor.role,mode,actor.route);
      await page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('#workspace-destinations [data-destination]')].map(el=>el.dataset.destination).sort())===JSON.stringify(ids),expected.map(entry=>entry.id).sort(),{timeout:10000});
      assert.deepEqual((await page.locator("#workspace-destinations [data-destination]").evaluateAll(elements=>elements.map(e=>e.dataset.destination))).sort(),expected.map(entry=>entry.id).sort());
      if(actor.administration)assert.equal(await page.locator("#workspace-destinations h2").count(),6);
      if(actor.role==="waiter"&&!mode.uses_waiter){const disabled="O atendimento com garçom está desativado. Fale com o administrador.";assert.equal(await page.locator(".table-grid").count(),0);assert.ok((await page.locator(".staff-content").innerText()).includes(locale==="es"?translations[disabled]:disabled));}
      if(full) {
        // Stress only test DOM; restaurant copy and translations are never rewritten.
        if(locale==="es")await page.locator("#workspace-destinations a").evaluateAll(elements=>elements.forEach(el=>{const text=el.textContent;el.textContent=text+" · "+text.slice(0,Math.ceil(text.length*.3));}));
        const rectangles=await page.locator(".staff-operational-header a:visible,.staff-operational-header button:visible,.staff-operational-header summary:visible").evaluateAll(elements=>elements.map(el=>{const b=el.getBoundingClientRect();return {w:b.width,h:b.height};}));
        assert.ok(rectangles.every(r=>r.w>=44&&r.h>=44),"Header targets must be 44px");
        await page.screenshot({path:path.join(output,name+".png")});
        if(await toggle.isVisible()) {await toggle.focus();await page.keyboard.press("Escape");assert.equal(await toggle.getAttribute("aria-expanded"),"false");assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);}
        const account=page.locator(".staff-account-menu summary");await account.focus();await page.keyboard.press("Enter");
        assert.equal(await page.locator("#appearance-theme").isVisible(),true);assert.equal(await page.locator("#interface-language").isVisible(),true);
        await page.screenshot({path:path.join(output,name+"-account.png")});await page.keyboard.press("Escape");assert.equal(await account.evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press("Tab");
        if(["admin","cashier"].includes(actor.role))assert.equal(await page.locator('.session-shortcut[href="/cashier/sessions"]').isVisible(),true);
        report.visualCases++;
      } else report.modeRoleCases++;
      const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)}));
      assert.ok(dimensions.scroll<=dimensions.width+1,`Navigation overflow ${dimensions.scroll}/${dimensions.width}`);
      assert.deepEqual(textProblems(await page.locator(".staff-operational-header").innerText(),{suspiciousQuestion:true}),[]);assert.deepEqual(errors,[]);
      if(!full) {
        const denied=await context.request.get(base+(actor.role==="admin"?"/api/staff/does-not-exist":"/admin/settings"),{maxRedirects:0});
        if(actor.role!=="admin"){assert.ok([303,307,308].includes(denied.status()),"Hidden admin route must still redirect at the server");report.denials++;}
        if(["kitchen","supervisor","waiter"].includes(actor.role)){const cash=await context.request.get(base+"/api/staff/cash-sessions");assert.equal(cash.status(),403);report.denials++;}
        if(["admin","cashier"].includes(actor.role)&&!mode.counter_enabled){const counter=await context.request.get(base+"/cashier/counter");assert.ok(counter.ok());assert.ok((await counter.text()).includes("O atendimento de balcão está desativado."),"Direct counter URL must retain the server's disabled-mode response");report.denials++;}
        if(actor.role==="waiter"&&!mode.uses_waiter){const result=await auth.from("orders").select("id").limit(1);assert.equal(result.error,null);assert.deepEqual(result.data,[]);report.denials++;}
      }
    } catch(error) {const issue={page:name,error:error.message};report.failures.push(issue);failures.push(issue);console.error(`FAIL ${name}: ${error.message}`);}
    finally {await context.close();}
  }
  try {
    for(const counter of [false,true])for(const waiter of [false,true])for(const tables of [false,true]) {
      await modes(counter,waiter,tables);const mode={counter_enabled:counter,uses_waiter:waiter,dine_in_qr_enabled:tables};
      for(const actor of roles){await login(actor.email);await scenario(actor,mode,"system","pt-BR",widths[2],false);}
    }
    for(const actor of [...roles,{role:"waiter",email:"garcom",route:"/waiter",disabled:true}]) {
      await modes(true,!actor.disabled,true);await login(actor.email);const mode={counter_enabled:true,uses_waiter:!actor.disabled,dine_in_qr_enabled:true};
      for(const theme of ["light","dark","system"])for(const locale of ["pt-BR","es"])for(const viewport of widths)await scenario(actor,mode,theme,locale,viewport,true);
    }
    // Navigation preserves the editor and its in-memory discount owner via local ready anchors.
    await modes(true,true,true);await login("admin");
    const context=await browser.newContext({viewport:widths[0]});await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})));
    const page=await context.newPage();await page.goto(base+"/cashier/counter",{waitUntil:"networkidle"});
    await page.locator(".counter-products button").first().click();await page.getByRole("button",{name:"Adicionar desconto",exact:true}).click();
    await page.locator('.counter-discount input[type="number"]').fill("1000");
    await page.locator('a[data-destination="ready"]').click();await page.waitForURL(url=>url.hash==="#cashier-ready");assert.equal(new URL(page.url()).pathname,"/cashier/counter");assert.equal(await page.locator(".counter-discount").count(),1);
    await page.locator('a[data-destination="orders"]').click();assert.equal(new URL(page.url()).pathname,"/cashier/counter");assert.equal(await page.locator('.counter-discount input[type="number"]').inputValue(),"1000");
    await page.locator(".session-shortcut").click();assert.equal(new URL(page.url()).pathname,"/cashier/counter");assert.equal(await page.locator('.counter-discount input[type="number"]').inputValue(),"1000");
    await page.getByRole("button",{name:"Remover desconto",exact:true}).click();await page.locator('a[data-destination="orders"]').click();await page.waitForURL(base+"/orders");
    await page.goto(base+"/cashier/counter",{waitUntil:"networkidle"});await page.locator(".counter-line").first().waitFor();
    await page.goto(base+"/admin/settings#settings-payments",{waitUntil:"networkidle"});await page.waitForFunction(()=>document.querySelector('#settings-nav-payments')?.getAttribute('aria-pressed')==='true');
    await page.locator("#settings-nav-delivery").click();await page.waitForURL(url=>url.hash==="#settings-delivery");
    await page.locator(".workspace-toggle").click();await page.locator('a[data-destination="delivery"]').waitFor({state:"visible"});assert.equal(await page.locator('a[data-destination="delivery"]').getAttribute("aria-current"),"page");
    await page.locator('a[data-destination="approvals"]').click();await page.waitForURL(base+"/supervisor");await page.locator(".workspace-toggle").click();await page.locator('a[data-destination="approvals"]').waitFor({state:"visible"});assert.equal(await page.locator('a[data-destination="approvals"]').getAttribute("aria-current"),"page");
    await context.close();
    await auth.auth.signOut({scope:"local"});jar.clear();
    for(const theme of ["light","dark","system"])for(const locale of ["pt-BR","es"])for(const viewport of widths) {
      const context=await browser.newContext({viewport,colorScheme:theme==="system"?"dark":theme});await context.addCookies([{name:"restaurant-locale",value:locale,url:base}]);await context.addInitScript(value=>localStorage.setItem("mesa-certa-theme",value),theme);
      const page=await context.newPage();const apiRequests=[];page.on("request",request=>{if(request.url().startsWith(env.NEXT_PUBLIC_SUPABASE_URL))apiRequests.push(request.url());});
      await page.goto(base+"/order",{waitUntil:"networkidle"});assert.equal(await page.locator(".staff-header,.workspace-navigation,.cash-session-bar").count(),0);assert.equal(apiRequests.length,0);assert.equal(await page.locator(".interface-preferences").count(),1);
      const denied=await context.request.get(base+"/cashier",{maxRedirects:0});assert.ok([303,307,308].includes(denied.status()));report.denials++;report.publicCases++;
      await page.screenshot({path:path.join(output,`navigation-public-${theme}-${locale}-${viewport.width}.png`)});await context.close();
    }
  } finally {await modes(prior.counter,prior.waiter,prior.tables);await auth.auth.signOut({scope:"local"});jar.clear();fs.writeFileSync(path.join(output,"navigation-results.json"),JSON.stringify(report,null,2),"utf8");}
  console.log(`Navigation: ${report.modeRoleCases} mode/role cases, ${report.visualCases} themed/responsive cases, ${report.publicCases} public cases, ${report.denials} server/RLS refusals, ${report.failures.length} failures.`);
}
