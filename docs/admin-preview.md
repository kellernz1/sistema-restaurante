# Temporary staff preview

The staff preview is a separate temporary HTTPS tunnel protected by an access code and the application's normal staff authentication. Its ignored state file is `.local-secrets/admin-preview.json`. Share the URL and access code privately with the testing team; the code does not replace employee credentials. Gate sessions expire after four hours.

The loopback-only gateway on port 3013 forwards the app and a restricted Supabase Auth, REST and Realtime endpoint through the same HTTPS origin. Browser sessions retain the original Supabase cookie key so server authentication and RLS continue to apply. Administrative Auth APIs, Studio, PostgreSQL and WhatsApp simulator/worker endpoints are not exposed by this gateway. Customer preview access does not grant staff access.

The computer, application, Docker and tunnel must remain running. Tests use the current local database: changes to products, orders and settings persist. This is a temporary testing URL, not production hosting. Browser-based thermal printing still requires a printer connected to the tester's computer and browser interaction.

To revoke the staff link, run `npm run local:admin-share:stop`. This leaves the customer preview running. `npm run local:stop` revokes both previews and stops the local stack. A new tunnel must be provisioned after stopping; keep generated credentials, binaries and logs out of Git.
