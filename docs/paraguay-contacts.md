# Paraguay and Brazil customer contacts

## Library and shared normalization

`libphonenumber-js` 1.13.15 is pinned in package.json/package-lock.json. Its `max` metadata supports strict validity and fixed/mobile distinction. It is a runtime dependency with bundled metadata, TypeScript support and no runtime network calls. This adds more client metadata than `min`, deliberately, to avoid lax validation and unsafe Brazilian landline/mobile merging. There is no external phone-validation subscription or CDN. Reference: https://github.com/catamphetamine/libphonenumber-js#readme.

`src/lib/phone.ts::normalizePhone` is the shared application normalizer for public checkout, cashier schemas, simulator/server action, signed WhatsApp webhook ingestion, customer lookup and browser address-storage keys. Server schemas independently validate the submitted number using the restaurant default or explicit `phone_country`; they do not trust browser normalization. Incoming normalized identities still pass the database's existing transactional order/pricing/role checks.

An admin edits **Atendimento → País padrão dos telefones** in Settings. The initial database default is PY. The shared `PhoneInput` shows Paraguay (+595) and Brazil (+55) simultaneously in its selector and uses the restaurant default initially. Local numbers obey the selected country; length never changes the country. Pasting an explicit +595/+55 updates the visible selection. An explicit international `+` is authoritative. A calling code without `+` is recognized only for the selected country, after metadata validation. Valid explicit international numbers from other countries remain compatible with the old E.164 interface; the country selector offers only PY and BR.

Both country buttons are always visible. Selecting another country while an explicit international value is present clears that value, avoiding a mismatch between the displayed country and an old calling code.

Spaces, parentheses, periods and hyphens are removed. Letters, extensions and short/invalid numbers fail. PY domestic trunk zero is handled by library metadata. BR local numbers require DDD. Canonical E.164 is stored in customers/orders and used by rate limits and lookups.

| Input | Selection | Canonical identity |
|---|---|---|
| 0981 123 456 | PY | +595981123456 |
| +595 981 123456 | PY | +595981123456 |
| 595981123456 | PY | +595981123456 |
| 981123456 | PY | +595981123456 |
| (11) 91234-5678 | BR | +5511912345678 |
| +55 11 91234-5678 | either | +5511912345678 |
| 11912345678 | BR | +5511912345678 |
| +55 11 1234-5678 | either | +5511912345678 |
| 123 / letters / 11912345678 with PY | PY | rejected |

## Brazilian ninth digit and transport safety

For BR, an eight-digit subscriber number is mapped to a nine-digit mobile only if the original is not a metadata-valid fixed/fixed-or-mobile line and adding the initial 9 produces a valid mobile. A valid eight-digit landline is always kept separate: +551123456789 is not the same contact as +5511923456789. This conservative rule means ambiguous aliases are **not automatically merged**. Phone-format equivalence does not prove ownership.

Signed Cloud API inbound `messages[].from` and status recipient IDs use the shared canonical identity for conversations, queue leases, customer lookup and notifications. A separate `whatsapp_conversations.provider_recipient` preserves the original inbound digits for actual sending, rather than sending to an arbitrarily modified ID. The service-only `remember_whatsapp_recipient` verifies identity equivalence and only accepts newer observations. Raw recipients are stored with the queued inbound event and remembered during processing; duplicate/stale events do not create another conversation or silently retarget another customer. Status events do not replace the transport recipient. Outbound serialization preserves that recorded ID. Ambiguous outbound errors retain the existing manual-review/no-resend behavior.

The local simulator accepts the same country/normalization rules and retains an explicitly entered international alias for mock transport. `WHATSAPP_PHONE_NUMBER_ID` is the provider's business-number ID, not a country prefix. Register the restaurant's real +595 number in Meta and configure that ID/credentials normally; the application never prepends +55 to a business number.

The official Meta pages https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components and https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages could not be retrieved during this work (unavailable/429). Therefore the eight/nine-digit variation is handled defensively as a requested integration scenario, not claimed as a universal documented Meta guarantee. Live receiving, sending, delivery callbacks, the chosen API version and the actual +595 business account must be verified with Meta. No real messages were sent by automated validation. Non-phone/business-scoped identifiers are outside this block.

## Addresses and opt-in reuse

Written delivery address is free text: street and number may be entered together in `street`; the separate number, reference, complement, neighborhood and city remain available. A usable written street or validated GPS/map link is required. UF and CEP are no longer required or shown in customer/cashier entry. Legacy `state`/`zip_code` remain compatible optional text columns; omitted/blank compatibility fields become SQL NULL on new address rows. Map-only orders continue to store their destination in the order snapshot without forcing a written address record. Road quote requirements and map-link validation are unchanged.

Reuse remains opt-in on the same browser, with keys based on canonical E.164. Safe legacy Brazilian aliases are checked only in that browser's local storage. A different normalized phone never reuses the key. No public customer/address search by phone was introduced. WhatsApp lookup remains server-only and follows verified incoming identities.

## Test-data migration and rollout

Stop app/WhatsApp worker, back up, apply `202610240007_paraguay_contacts.sql`, regenerate database types, build and restart. Existing test numbers without an explicit country follow the previous **BR (+55)** behavior; changing the new restaurant default to PY does not reinterpret historical locals as Paraguay.

The migration structurally canonicalizes existing identities, merges colliding customers into the oldest record, repoints addresses/orders, normalizes order phones and cashier request payloads, and merges conversation aliases. Latest conversation state/context wins, while human-pause and opt-out flags are OR'ed to avoid losing consent safeguards. Queue messages retain IDs and point to the canonical conversation. Previous transport digits are retained. Prices, quantities, monetary payments, delivery distances and rate history are not changed. Historical financial response snapshots remain untouched.

Database `phone_identity` supplies a structural canonicalization boundary and legacy migration rules; full metadata validation is in the single application helper. It is not a replacement for libphonenumber and must not be exposed as a public validation endpoint. Server-only order creation remains service-role restricted. RLS and existing staff-role checks are preserved.

## Validation and manual acceptance

Run native `tests/phone.test.mjs`, affected offsite/cashier/delivery validation tests, Vitest, lint, build and all SQL tests (including `paraguay_contacts_test.sql`). The optional `tests/contacts-http.test.mjs` requires a local isolated mock server, `CONTACT_HTTP_TEST=true`, seeded Supabase credentials, a non-Pix enabled method, accepting pickup, configured temporary webhook ID/secret and a worker secret. It creates/cleans only its own pending test orders, contacts and conversations. Do not run it against real WhatsApp.

Manual checks: select PY in checkout, type 0981 123 456; repeat with +595981123456. Select BR and use (11) 91234-5678, then its safe legacy alias. Confirm the same customer is reused. Enter an Asunción street/reference without UF/CEP, and separately use only a map pin. Save an address with consent, re-enter an equivalent phone on the same browser and verify reuse; a different number must not load it. Change the admin default to BR and open a fresh customer/cashier page; the initial selector must follow it. Repeat in Spanish. In the simulator send from both international aliases and verify one conversation; then perform the equivalent real API test with controlled numbers before deployment.

Validation on 2026-10-24: local database backup before migration, migration applied and types regenerated. Production build and lint passed; 40 native tests, 37 Vitest tests and all 11 SQL suites passed. Five HTTP tests passed against a temporary mock server: contact/alias checkout and signed webhook behavior, three language cases and existing payment API authorization regression. The temporary server was stopped and test contact/order/conversation fixtures were removed. Actual Meta transport/delivery, interactive browser/mobile/GPS acceptance and browser local-storage behavior still need manual acceptance; local address-key equivalence was unit-tested. No commit or push was made.
