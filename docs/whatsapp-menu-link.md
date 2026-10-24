# WhatsApp menu link flow

Incoming customer messages now receive a link to `/order`, where customers choose pickup or delivery, browse dish photos, edit their cart, provide contact/address/payment details and submit using the existing validated public order endpoint. These orders retain the existing web source and tracking page; this change does not attach an unverified browser identity to a WhatsApp conversation or add WhatsApp notifications to web orders.

Valid enabled `MESA-TOKEN` messages receive `/t/TOKEN`. Unknown tokens never reveal table links. Customers at the restaurant without a token are directed to their table QR code. Human handoff, opt-out, closed settings and the existing queue remain in use. Old conversational carts cannot be submitted by stale interactive replies.

The simulator renders links as clickable anchors opening in a separate tab. Start at `/dev/whatsapp`, send `menu`, open the returned link, choose products and complete checkout. Verify the pending order in `/orders`, then confirm and follow the normal kitchen/cashier flow. Use the LAN app URL when testing from a phone on the same Wi-Fi. External real WhatsApp customers need an appropriately configured reachable application URL.

Validation: `npm run test:whatsapp`, `npm run lint`, `npm run build`. See `src/features/whatsapp/menu-link.test.ts` for link, stale cart, token, consent and handoff regression checks. The previous conversational state machine remains internal for compatibility but is no longer the incoming handler entry point.
