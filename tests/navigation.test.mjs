import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { operationDestinations, isCurrentDestination, displayBusinessDate } from "../src/features/auth/navigation.ts";
import { administrationGroups } from "../src/features/auth/administration-destinations.ts";

test("navigation projects all roles and all eight effective mode combinations without granting access", () => {
  const translations=JSON.parse(fs.readFileSync(new URL("../src/lib/i18n/es.json",import.meta.url),"utf8"));
  for (const counter_enabled of [false,true]) for (const dine_in_qr_enabled of [false,true]) for (const uses_waiter of [false,true]) {
    const modes={counter_enabled,dine_in_qr_enabled,uses_waiter};
    for (const role of ["admin","cashier","kitchen","supervisor","waiter"]) {
      const entries=operationDestinations(role,modes), ids=entries.map(entry=>entry.id);
      for(const entry of entries)assert.ok(Object.hasOwn(translations,entry.label),`Missing Spanish destination: ${entry.id}`);
      assert.equal(new Set(entries.map(entry=>entry.href)).size,entries.length);
      if(role==="kitchen")assert.deepEqual(ids,["kitchen"]);
      if(role==="supervisor")assert.deepEqual(ids,["approvals"]);
      if(role==="waiter")assert.deepEqual(ids,uses_waiter?["tables","orders"]:[]);
      if(["admin","cashier"].includes(role)) {
        assert.equal(ids.includes("counter"),counter_enabled);assert.equal(ids.includes("ready"),counter_enabled);
        assert.equal(ids.includes("tables"),dine_in_qr_enabled);assert.equal(ids.includes("qr"),dine_in_qr_enabled);
        assert.ok(ids.includes("orders"));
        assert.ok(!ids.includes("approvals"));
      }
    }
    const groups=administrationGroups(modes);assert.equal(groups.length,6);
    for(const group of groups){assert.ok(Object.hasOwn(translations,group.label));for(const entry of group.destinations)assert.ok(Object.hasOwn(translations,entry.label),`Missing Spanish administration destination: ${entry.id}`);}
    const links=groups.flatMap(group=>group.destinations);assert.equal(new Set(links.map(link=>link.href)).size,links.length);
    assert.equal(links.some(entry=>entry.id==="codes"),dine_in_qr_enabled);
  }
});
test("counter ready navigation is in-place, with active anchors and distinct general creation", () => {
  const entries=operationDestinations("cashier",{counter_enabled:true,dine_in_qr_enabled:true,uses_waiter:false},"/cashier/counter");
  const ready=entries.find(entry=>entry.id==="ready");assert.equal(ready.href,"/cashier/counter#cashier-ready");
  assert.equal(isCurrentDestination(ready,"/cashier/counter","#cashier-ready"),true);
  assert.equal(isCurrentDestination(ready,"/cashier/counter",""),false);
  const shell=fs.readFileSync(new URL("../src/features/auth/staff-shell.tsx",import.meta.url),"utf8");
  assert.equal((shell.match(/<PrintQueue /g)||[]).length,1);assert.equal((shell.match(/<CashSessionBar /g)||[]).length,1);
  assert.doesNotMatch(shell,/CashierNavigation/);
  const nav=fs.readFileSync(new URL("../src/features/auth/workspace-navigation.tsx",import.meta.url),"utf8");
  assert.match(shell,/document\.querySelector\("\.counter-discount"\)/);assert.match(shell,/onClickCapture=\{guardNavigation\}/);assert.doesNotMatch(nav,/sessionStorage|localStorage/);
});
test("business-day header projects configured midnight/cutoff without changing server boundaries",()=>{
  assert.equal(displayBusinessDate(Date.parse("2026-10-29T06:59:00Z"),"America/Asuncion","05:00"),"2026-10-28");
  assert.equal(displayBusinessDate(Date.parse("2026-10-29T08:00:00Z"),"America/Asuncion","05:00"),"2026-10-29");
  assert.equal(displayBusinessDate(Date.parse("2026-10-29T03:01:00Z"),"America/Asuncion","05:00"),"2026-10-28");
  assert.equal(displayBusinessDate(Date.parse("2026-10-29T08:00:29Z"),"America/Asuncion","05:00:30"),"2026-10-28");
  assert.equal(displayBusinessDate(Date.parse("2026-10-29T08:00:30Z"),"America/Asuncion","05:00:30"),"2026-10-29");
});
