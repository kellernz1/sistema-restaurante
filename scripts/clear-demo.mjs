import {guardEntry,resolveTarget,authorizeOperation} from "./target-safety.mjs";
import fs from "node:fs";

import {
  assertResult,
  demoClient,
  DEMO_EMAILS,
  DEMO_MANIFEST,
  DEMO_PHONES,
  readManifest,
} from "./demo-data.mjs";
import { isMain } from "./local/lib.mjs";
await guardEntry(import.meta.url,"clear-demo");


export async function clearDemo({ keepStaff = false } = {}) {
  authorizeOperation(resolveTarget(),"clear-demo");
  const { client } = demoClient();
  const manifest = readManifest();
  const markedOrders = assertResult(await client.from("orders").select("table_id").like("notes", "[DEMO]%"), "read marked demo tables");
  const tableIds = [...new Set(markedOrders.map((order) => order.table_id).filter(Boolean))];

  if (manifest.serviceRequestIds?.length) {
    assertResult(
      await client.from("service_requests").delete().in("id", manifest.serviceRequestIds),
      "delete demo service requests",
    );
  }
  if (manifest.orderIds?.length) {
    assertResult(await client.from("orders").delete().in("id", manifest.orderIds), "delete demo orders");
  }
  assertResult(await client.from("orders").delete().like("notes", "[DEMO]%"), "delete marked demo orders");
  for (const tableId of tableIds) {
    const remaining = assertResult(await client.from("orders").select("id").eq("table_id", tableId).in("status", ["pending_confirmation", "open"]).limit(1), "check remaining table orders");
    if (!remaining.length) {
      assertResult(await client.from("tables").update({ status: "available" }).eq("id", tableId), "release demo table");
    }
  }
  assertResult(await client.from("whatsapp_messages").delete().in("phone", DEMO_PHONES), "delete demo WhatsApp messages");
  assertResult(await client.from("whatsapp_conversations").delete().in("phone", DEMO_PHONES), "delete demo WhatsApp conversations");
  assertResult(await client.from("customers").delete().like("name", "[DEMO]%"), "delete demo customers");

  if (!keepStaff) {
    let page = 1;
    while (true) {
      const listed = assertResult(await client.auth.admin.listUsers({ page, perPage: 100 }), "list auth users");
      for (const user of listed.users.filter((candidate) => DEMO_EMAILS.includes(candidate.email ?? ""))) {
        assertResult(await client.auth.admin.deleteUser(user.id), `delete ${user.email}`);
      }
      if (listed.users.length < 100) break;
      page += 1;
    }
  }

  if (fs.existsSync(DEMO_MANIFEST)) fs.rmSync(DEMO_MANIFEST);
  console.log(`Demo data cleared${keepStaff ? "; staff accounts preserved" : ""}.`);
}

if (isMain(import.meta.url)) {
  await clearDemo();
}
