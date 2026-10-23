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

export async function clearDemo({ keepStaff = false } = {}) {
  const { client } = demoClient();
  const manifest = readManifest();

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
