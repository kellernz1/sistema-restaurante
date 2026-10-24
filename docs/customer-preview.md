# Temporary customer preview

The temporary Cloudflare Quick Tunnel forwards only to the loopback customer gateway (`127.0.0.1:3010`), never directly to Next.js or Supabase. The gateway permits the offsite menu, checkout endpoint, product images, static assets and token-based tracking. Staff login, staff APIs, WhatsApp simulator, database and Studio are not exposed by this tunnel. Requests do not forward cookies, authorization or server-action headers. Existing application quotas remain active with shared proxy identity; no network DNS settings or application environment URLs were changed.

The running URL and process IDs are stored in the ignored `.local-secrets/customer-preview.json`. Logs and the downloaded official Cloudflare executable remain ignored. A process-local API helper resolves the Cloudflare provisioning hostname using DNS 1.1.1.1 because the system resolver returned NXDOMAIN; upstream HTTPS certificate validation remains enabled. The gateway itself is `scripts/local/customer-preview-gateway.mjs`.

To end sharing without stopping the restaurant app, run `npm run local:share:stop`. `npm run local:stop` also stops the preview. The URL is temporary and requires the computer, internet, local app and tunnel to stay running. It is not a permanent deployment. Submitted orders use the current restaurant database and normal order flow.

Validation: `node --test tests/customer-preview-gateway.test.mjs`. The public preview was checked for menu HTML/static assets/API success and staff/login/simulator denial. The preview route allowlist intentionally supports only the offsite `/order` customer flow, not table links.
