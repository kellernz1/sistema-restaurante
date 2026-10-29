import {resolveTarget,requireTransport} from "./target-safety.mjs";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {createServerClient} from "@supabase/ssr";
import {loadEnvFile} from "./local/lib.mjs";
import {textProblems} from "./check-text.mjs";
import {money} from "../src/lib/money.ts";
import {licenseErrors} from "../src/features/licensing/validation.ts";

const target=resolveTarget();requireTransport(target);if(target.profile!=="disposable")throw Error("Visual tests require an owned disposable target");
const env={...loadEnvFile(path.join(target.root,".env.local")),...process.env};
const base=env.PUBLIC_TEST_URL||env.NEXT_PUBLIC_APP_URL;
if(!base)throw new Error("Set PUBLIC_TEST_URL or start the configured local stack.");
const executable=env.VISUAL_BROWSER_PATH||["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(p=>fs.existsSync(p));
if(!executable)throw new Error("Set VISUAL_BROWSER_PATH to an installed Chromium/Edge executable.");
const output=path.resolve(path.dirname(process.env.TARGET_CONTEXT_FILE),"visual",new Date().toISOString().replaceAll(":","-"));fs.mkdirSync(output,{recursive:true});
const jar=new Map();
const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
const login=await auth.auth.signInWithPassword({email:env.VISUAL_EMAIL||"admin@restaurante.local",password:env.VISUAL_PASSWORD||env.DEMO_PASSWORD||"Demo@12345"});if(login.error)throw login.error;
const table=await auth.from("tables").select("qr_token").limit(1).single();if(table.error)throw table.error;
const payable=await auth.from("orders").select("table_id,tables!inner(table_number,status)").eq("order_type","dine_in").in("status",["open","ready"]).in("tables.status",["occupied","closing"]).neq("payment_status","paid").limit(1).maybeSingle();if(payable.error)throw payable.error;
const cancelled=await auth.from("orders").select("id,order_number").eq("status","cancelled").limit(1).maybeSingle();if(cancelled.error)throw cancelled.error;
const translations=JSON.parse(fs.readFileSync("src/lib/i18n/es.json","utf8"));
const browser=await chromium.launch({executablePath:executable,headless:true});const failures=[];
try{
 for(const theme of ["light","dark"])for(const locale of ["pt-BR","es"])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,colorScheme:theme});
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:base})).concat({name:"restaurant-locale",value:locale,url:base}));
  for(const route of ["/cashier","/cashier/sessions","/cashier/counter","/orders","/kitchen","/admin","/admin/settings","/admin/settings/employees","/admin/settings/security","/admin/settings/license","/admin/audit","/supervisor","/admin/reports","/order",`/t/${table.data.qr_token}`,...(env.INTEGRATION_UI_CATALOG==="true"?["/dev/ui-kit"]:[])]){
   const page=await context.newPage();const errors=[];let expectedLicenseFailures=0;
   page.on("pageerror",e=>errors.push(e.message));page.on("console",message=>{
     if(message.type()!=="error")return;
     // Each deliberately mocked import rejection emits Chromium's HTTP 400 notice.
     // Exempt only that exact resource/status and consume one explicit mock budget.
     if(expectedLicenseFailures>0&&message.location().url===base+"/api/staff/license"&&/^Failed to load resource:.*status of 400 \(Bad Request\)$/.test(message.text())){expectedLicenseFailures--;return;}
     errors.push(`${message.text()} (${message.location().url})`);
   });
   const name=`${theme}-${locale}-${viewport.width}-${route.slice(1).replaceAll("/","-")}`;
   try{
    let visualLicense;
    if(route==="/admin/settings/license"){
      visualLicense={installation_id:"11111111-1111-4111-8111-111111111111",state:"active",plan:"pilot",expires_at:new Date(Date.now()+30*86400000).toISOString(),grace_until:new Date(Date.now()+37*86400000).toISOString(),days_remaining:30,last_online_at:new Date().toISOString(),key_configured:true,renewal_url:"https://license.example/v1/renew",renewal_interval_days:7,features:["delivery","whatsapp"]};
      await page.route("**/api/staff/license",request=>{
        if(request.request().method()==="POST"){
          assert.equal(request.request().postDataJSON().command,"import","Visual acceptance must never renew or configure real licenses");
          expectedLicenseFailures++;
          return request.fulfill({status:400,json:{error:visualLicense.import_error??licenseErrors.signature}});
        }
        return request.fulfill({json:visualLicense});
      });
    }
    const response=await page.goto(base+route,{waitUntil:"networkidle",timeout:30000});assert.ok(response?.ok(),`HTTP ${response?.status()}`);assert.equal(new URL(page.url()).pathname,route,"Unexpected redirect");
    if(route==="/dev/ui-kit"){
      const label=value=>locale==="es"?translations[value]??value:value;
      const palettes=await page.evaluate(selected=>{
        const root=document.documentElement,previous=root.dataset.theme;
        const read=()=>["--canvas","--text-primary","--action-text","--success-text","--warning-text","--danger-text"].map(key=>getComputedStyle(root).getPropertyValue(key).trim());
        const automatic=read();root.dataset.theme=selected;const explicit=read();root.dataset.theme=previous;
        return{automatic,explicit};
      },theme);
      assert.deepEqual(palettes.explicit,palettes.automatic,"Explicit and automatic palettes disagree");
      const fonts=await page.locator(".ui-catalog h1,.ui-catalog h2,.ui-catalog h3").evaluateAll(elements=>elements.map(e=>getComputedStyle(e).fontFamily));
      assert.ok(fonts.every(font=>!/(Georgia|Times)/i.test(font)),"Legacy serif type leaked into the UI kit");
      const statusSizes=await page.locator(".ui-status,.ui-segmented .segment-count").evaluateAll(elements=>elements.map(e=>parseFloat(getComputedStyle(e).fontSize)));
      assert.ok(statusSizes.every(size=>size>=14),"UI status and count labels must be at least 14px");
      const trigger=page.getByRole("button",{name:label("Abrir demonstração do modal"),exact:true});
      // Synthetic label expansion belongs only to this development catalog.
      await page.locator(".ui-catalog-row .ui-button").first().evaluate(e=>{e.textContent=(e.textContent+" ").repeat(2);});
      assert.equal(await page.locator("#catalog-value").getAttribute("aria-invalid"),"true");
      assert.equal(await page.locator("#catalog-value").getAttribute("aria-describedby"),"catalog-value-error");
      const sizes=await page.locator(".ui-button,.ui-link,.ui-dismiss,.ui-segmented button").evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return{w:r.width,h:r.height};}));
      assert.ok(sizes.every(r=>r.w>=44&&r.h>=44),"UI-kit touch targets must be at least 44x44");
      assert.equal(await page.locator("#catalog-name").evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),16);
      await trigger.click();const modal=page.locator(".ui-modal");await modal.waitFor();
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      const header=await modal.locator(".ui-modal-header").boundingBox(),footer=await modal.locator(".ui-modal-footer").boundingBox();
      assert.ok(header&&footer&&header.y>=0&&footer.y+footer.height<=viewport.height,"Modal chrome must fit the viewport");
      await modal.locator(".ui-modal-body").evaluate(e=>e.scrollTop=e.scrollHeight);
      assert.equal((await modal.locator(".ui-modal-header").boundingBox()).y,header.y,"Modal header scrolled with its body");
      await modal.screenshot({path:path.join(output,name+"-modal.png")});
      await modal.locator(".ui-modal-footer button").first().click();await page.keyboard.press("Escape");assert.equal(await modal.isVisible(),true,"Escape must not dismiss a busy modal");
      await modal.locator(".ui-modal-footer button").first().click();await page.keyboard.press("Escape");assert.equal(await modal.isVisible(),false);
      assert.equal(await trigger.evaluate(e=>e===document.activeElement),true,"Modal did not return focus");
    }
    if(visualLicense){
      const label=value=>locale==="es"?translations[value]??value:value;
      for(const[state,remaining,warning]of [["active",30,null],["expiring",7,7],["expiring",3,3],["grace",-1,null],["restricted",-9,null]]){
        Object.assign(visualLicense,{state,days_remaining:remaining,warning_days:warning,clock_suspect:state==="restricted",requires_online:state==="restricted"});
        await page.reload({waitUntil:"networkidle"});await page.locator(".license-panel h2").filter({hasText:label(({active:"Ativa",expiring:"A vencer",grace:"Em tolerância",restricted:"Restrita"})[state])}).waitFor();
        assert.deepEqual(textProblems(await page.locator(".license-panel").innerText()),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
        await page.screenshot({path:path.join(output,name+`-${state}-${remaining}.png`),fullPage:true});
      }
      const panel=page.locator(".license-import"),button=panel.getByRole("button",{name:label("Importar licença"),exact:true});
      await panel.locator("textarea").fill("invalid");await button.click();
      await panel.getByRole("alert").filter({hasText:label(licenseErrors.format)}).waitFor();
      await panel.locator('input[type="file"]').setInputFiles({name:"empty.license",mimeType:"text/plain",buffer:Buffer.alloc(0)});
      await panel.getByRole("alert").filter({hasText:label(licenseErrors.emptyFile)}).waitFor();
      for(const [cause,message]of Object.entries({signature:licenseErrors.signature,installation:licenseErrors.installation,older:licenseErrors.older,missingKey:licenseErrors.missingKey,invalidKey:licenseErrors.invalidKey})){
        visualLicense.import_error=message;await panel.locator("textarea").fill("e30."+"a".repeat(86));await button.click();
        const alert=panel.getByRole("alert");await alert.filter({hasText:label(message)}).waitFor();
        const a=await alert.boundingBox(),b=await button.boundingBox();assert.ok(a&&b&&Math.abs(b.y-(a.y+a.height))<80,"Import error must be next to its button");
        await panel.screenshot({path:path.join(output,name+`-import-${cause}.png`)});
      }
      for(const environment of ["missing","invalid"]){
        visualLicense.public_key_environment=environment;await page.reload({waitUntil:"networkidle"});
        await page.locator(".license-panel").getByText(label(environment==="missing"?licenseErrors.keyEmpty:licenseErrors.invalidKey),{exact:true}).waitFor();
        await page.screenshot({path:path.join(output,name+`-key-${environment}.png`),fullPage:true});
      }
    }
    if(route==="/orders"){
      const card=page.locator(".hub-card").filter({hasNot:page.locator(".hub-status-cancelled")}).first();assert.ok(await card.count(),"Refund visual acceptance requires one existing non-cancelled order");
      const label=value=>locale==="es"?translations[value]??value:value;
      await card.locator("button[aria-label]").click();
      await page.route("**/api/staff/refunds",async request=>{
        const payload=request.request().postDataJSON();assert.equal(payload.command,"quote","Visual test must never register a real refund");
        return request.fulfill({json:{binding:"a".repeat(64),number:123,ticket:24,total:40000,discount:10000,paid:40000,refunded:10000,available:30000,amount:30000,requires_approval:false,lines:[{payment_id:"11111111-1111-4111-8111-111111111111",method:"cash",currency:"PYG",original:30000,amount:30000,rate:null,rounding:0}]}});
      });
      await page.getByRole("button",{name:label("Estornos e cancelamento"),exact:true}).click();
      const modal=page.getByRole("dialog",{name:label("Estornos e cancelamento"),exact:true});
      await modal.getByLabel(label("Motivo obrigatório"),{exact:true}).fill("Visual discounted cancellation");await modal.getByRole("button",{name:label("Conferir estorno"),exact:true}).click();
      await modal.getByText(label("Saldo estornável")+":",{exact:false}).waitFor();
      assert.ok((await modal.innerText()).includes("Gs. 30.000"));
      assert.equal(await modal.getByRole("button",{name:label("Registrar devolução"),exact:true}).isDisabled(),true);
      const bounds=await modal.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1,"Refund dialog exceeds viewport");
      const heading=await modal.getByRole("heading").boundingBox();assert.ok(heading&&heading.y>=bounds.y&&heading.y+heading.height<=bounds.y+bounds.height,"Refund heading is clipped");
      assert.deepEqual(textProblems(await modal.innerText()),[]);await modal.screenshot({path:path.join(output,name+"-discounted-refund.png")});
      await modal.getByRole("button",{name:label("Cancelar"),exact:true}).click();
      if(viewport.width<641)await page.locator(".sheet-close").getByRole("button").click();
      if(cancelled.data){
        // Recover a lost response even when the now-cancelled order disables new returns.
        // Only browser storage is changed; this fake request is never submitted.
        const key=`refund-pending:${cancelled.data.id}`;
        await page.evaluate(key=>sessionStorage.setItem(key,JSON.stringify({command:"execute",request:"11111111-1111-4111-8111-111111111111"})),key);
        const historyCard=page.locator(".hub-card").filter({has:page.locator(`button[aria-label$="#${cancelled.data.order_number}"]`)});
        if(await historyCard.count()){
          await historyCard.locator("button[aria-label]").click();
          await page.locator(".hub-ticket").getByRole("button",{name:label("Consultar envio"),exact:true}).click();
          await modal.waitFor();assert.equal(await modal.getByRole("button",{name:label("Consultar envio"),exact:true}).isEnabled(),true);
          await modal.screenshot({path:path.join(output,name+"-cancelled-refund-recovery.png")});
          await modal.getByRole("button",{name:label("Cancelar"),exact:true}).click();
          if(viewport.width<641)await page.locator(".sheet-close").getByRole("button").click();
        }
        await page.evaluate(key=>sessionStorage.removeItem(key),key);
      }
    }
    if(route==="/supervisor"){
      const text=locale==="es"?translations["Descontos e cancelamentos"]:"Descontos e cancelamentos";
      const action=page.getByRole("button",{name:text,exact:true}).first();
      assert.ok(await action.count(),"Approval modal acceptance requires an unpaid order fixture");
      if(await action.count()){
        let configured=false;
        const label=value=>locale==="es"?translations[value]??value:value;
        // Exercise setup guidance without configuring a real PIN or executing a financial action.
        await page.route("**/api/staff/approvals",async request=>{
          if(request.request().method()==="GET")return request.fulfill({json:{approvers:configured?[{id:"11111111-1111-4111-8111-111111111111",name:"Visual supervisor",role:"supervisor"}]:[],policy:{discount_reasons:[]}}});
          const payload=request.request().postDataJSON();
          if(payload.command==="quote")return request.fulfill({json:{binding:"a".repeat(64),requires_approval:true,operation:{amount:1000}}});
          assert.equal(payload.command,"approve","Visual approval test must never execute an action");
          return request.fulfill({json:{ok:false,code:"pin",attempts_remaining:4}});
        });
        await action.click();const modal=page.getByRole("dialog");await modal.waitFor();
        const fieldStyle=await modal.locator("input").first().evaluate(e=>({font:parseFloat(getComputedStyle(e).fontSize),border:getComputedStyle(e).borderTopColor}));
        assert.ok(fieldStyle.font>=16,"Approval input text must be at least 16px");
        assert.equal(fieldStyle.border,theme==="dark"?"rgb(138, 138, 148)":"rgb(122, 122, 133)","Legacy security styles weakened the modal input boundary");
        assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
        await page.keyboard.press("Shift+Tab");assert.equal(await modal.evaluate(e=>e.contains(document.activeElement)),true,"Focus escaped approval dialog");
        await page.keyboard.press("Tab");assert.equal(await modal.evaluate(e=>e.contains(document.activeElement)),true);
        await page.keyboard.press("Escape");assert.equal(await modal.isVisible(),false);assert.equal(await action.evaluate(e=>e===document.activeElement),true);
        await action.click();await modal.waitFor();
        await modal.screenshot({path:path.join(output,name+"-sensitive-action.png")});
        const bounds=await modal.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1,"Sensitive action modal exceeds viewport");
        await modal.locator('input[type="number"]').fill("1000");await modal.locator("input[list]").fill("Visual setup check");
        await modal.getByRole("button",{name:label("Conferir operação"),exact:true}).click();
        await modal.getByText(label("Nenhum aprovador com PIN cadastrado. Peça ao administrador ou supervisor para configurar o próprio PIN."),{exact:true}).waitFor();
        const confirm=modal.getByRole("button",{name:label("Confirmar ação"),exact:true});assert.equal(await confirm.isDisabled(),true);assert.equal(await modal.locator('input[type="password"]').count(),0);
        await modal.screenshot({path:path.join(output,name+"-no-approvers.png")});
        configured=true;await modal.getByRole("button",{name:label("Atualizar aprovadores"),exact:true}).click();
        await modal.locator("select").selectOption("11111111-1111-4111-8111-111111111111");
        assert.equal(await confirm.isDisabled(),true);await modal.getByLabel(label("PIN de aprovação"),{exact:true}).fill("1234");assert.equal(await confirm.isEnabled(),true);
        await confirm.click();await modal.getByRole("alert").getByText(label("PIN incorreto. Restam {0} tentativas antes do bloqueio.").replace("{0}","4"),{exact:true}).waitFor();
        await modal.screenshot({path:path.join(output,name+"-pin-feedback.png")});
        await modal.getByRole("button",{name:locale==="es"?translations["Cancelar"]:"Cancelar",exact:true}).click();
      }
    }
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
      const label=value=>locale==="es"?translations[value]??value:value;
      await page.getByRole("button",{name:label("Adicionar desconto"),exact:true}).click();
      const discount=page.locator(".counter-discount");
      await discount.locator("select").selectOption("percent");await discount.locator('input[type="number"]').fill("10.12");await discount.locator("input[list]").fill("Visual discount quote");
      const send=page.locator(".counter-total button");assert.equal(await send.isDisabled(),true,"Unapproved discount must block submission");
      const response=page.waitForResponse(r=>r.url().endsWith("/api/staff/counter/discount")&&r.request().method()==="POST");
      await discount.getByRole("button",{name:label("Conferir desconto"),exact:true}).click();
      const quoteResponse=await response;assert.equal(quoteResponse.status(),200);const quote=await quoteResponse.json();
      await discount.getByRole("status").waitFor();assert.ok((await page.locator(".counter-discount-summary").innerText()).includes(money.format(quote.discount)));
      assert.equal(await send.isEnabled(),true);
      if(viewport.width>800){
        const body=await page.locator(".counter-cart-body").boundingBox(),footer=await page.locator(".counter-total").boundingBox(),heading=await page.locator(".counter-cart-header").boundingBox();
        assert.ok(body&&footer&&heading&&body.y>=heading.y+heading.height-1&&body.y+body.height<=footer.y+1,"Cart header/footer must remain outside its scrolling body");
      }
      const preferences=await page.locator(".interface-preferences").boundingBox();
      for(const selector of [".counter-total > strong",".counter-total > button"]){
        const control=await page.locator(selector).boundingBox();
        assert.ok(control&&preferences&&(control.x+control.width<=preferences.x||preferences.x+preferences.width<=control.x||control.y+control.height<=preferences.y||preferences.y+preferences.height<=control.y),`Counter action overlaps preferences: ${JSON.stringify({selector,control,preferences})}`);
      }
      await page.locator(".counter-cart").screenshot({path:path.join(output,name+"-discount.png")});
      // Changing an item discards the grant; never click the actual order submission.
      await page.getByRole("button",{name:label("Aumentar quantidade"),exact:true}).first().click();
      assert.equal(await page.locator(".counter-discount").count(),0,"Changed cart retained approval UI");
      assert.ok(!(await page.locator(".counter-discount-summary").innerText()).includes(label("Desconto")),"Changed cart retained its approved amount");
      // The cashier PIN branch uses browser-only responses; never configure a real PIN or submit a sale.
      await page.route("**/api/staff/approvals",request=>request.fulfill({json:{approvers:[{id:"11111111-1111-4111-8111-111111111111",name:"Visual supervisor",role:"supervisor"}],policy:{discount_reasons:[]}}}));
      let approvalRequested=false;
      const feedbackResponses=[{ok:false,code:"pin",attempts_remaining:4},{ok:false,code:"pin",attempts_remaining:1},{ok:false,code:"locked",attempts_remaining:0,retry_after_seconds:900},{ok:false,code:"limited",retry_after_seconds:30},{ok:true,authorization:"22222222-2222-4222-8222-222222222222"}];
      await page.route("**/api/staff/counter/discount",request=>{
        const payload=request.request().postDataJSON();
        if(payload.command==="quote")return request.fulfill({json:{gross:quote.gross*2,discount:1000,total:quote.gross*2-1000,requires_approval:true,binding:"a".repeat(64)}});
        assert.equal(payload.command,"approve");assert.equal(/^\d{4,6}$/.test(payload.pin),true);assert.match(payload.request_id,/^[a-f0-9-]{36}$/);approvalRequested=true;
        const result=feedbackResponses.shift();assert.ok(result,"Unexpected extra approval request");return request.fulfill({json:result});
      });
      await page.getByRole("button",{name:label("Adicionar desconto"),exact:true}).click();
      await discount.locator('input[type="number"]').fill("1000");await discount.locator("input[list]").fill("Visual PIN branch");
      await discount.getByRole("button",{name:label("Conferir desconto"),exact:true}).click();
      await discount.locator('select option[value="11111111-1111-4111-8111-111111111111"]').waitFor({state:"attached"});
      await discount.locator("select").last().selectOption("11111111-1111-4111-8111-111111111111");
      const authorize=discount.getByRole("button",{name:label("Autorizar desconto"),exact:true});assert.equal(await authorize.isDisabled(),true);
      for(const [index,message]of [label("PIN incorreto. Restam {0} tentativas antes do bloqueio.").replace("{0}","4"),label("PIN incorreto. Resta 1 tentativa antes do bloqueio."),label("PIN deste aprovador bloqueado. Tente novamente em até {0} minutos.").replace("{0}","15"),label("Limite de tentativas atingido para sua conta. Aguarde {0} segundos.").replace("{0}","30")].entries()){
        await discount.locator('input[type="password"]').fill("1234");await authorize.click();await discount.getByRole("alert").getByText(message,{exact:true}).waitFor();
        assert.equal(await discount.locator('input[type="password"]').inputValue(),"");
        if(index===0||index===2)await page.locator(".counter-cart").screenshot({path:path.join(output,name+`-pin-feedback-${index}.png`)});
      }
      await discount.locator('input[type="password"]').fill("1234");await authorize.click();await discount.getByRole("status").waitFor();
      assert.equal(approvalRequested,true);assert.equal(feedbackResponses.length,0);assert.equal(await send.isEnabled(),true);assert.equal(await discount.locator('input[type="password"]').count(),0);
      await page.locator(".counter-cart").screenshot({path:path.join(output,name+"-discount-pin.png")});
      await page.locator(".counter-products button").nth(1).click();assert.equal(await page.locator(".counter-line").count(),2);
      if(viewport.width>800)await page.locator(".counter-cart-body").evaluate(el=>{el.scrollTop=0;});
      await page.locator(".counter-cart").screenshot({path:path.join(output,name+"-items.png")});
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
