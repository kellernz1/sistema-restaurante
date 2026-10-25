# Printing architecture — block 4A

Block 5 adds closed-session reports to the cashier destination, with the same browser/file-test drivers and 58/80 mm document engine. Report jobs enforce session ownership. See [cash sessions](cash-sessions.md).

Current reliability rules: [printing-reliability.md](printing-reliability.md) supersedes the old marker/review behavior below with forwarded units versus copy counts, unified guards, audited decisions/admin archive, persisted browser requests, deadlines/heartbeat and clean-database acceptance.

## Scope and transport boundary

No printer model or connection is known. **Physical compatibility has not been validated.** This block provides document generation, a durable queue, browser delivery and development file output. It installs no printer, USB adapter, Windows service, network transport or silent printing configuration.

`src/features/printing/document.ts` defines text (bold, double size, alignment), rules, QR and cut blocks. One kitchen layout and one receipt layout feed both HTML and pure ESC/POS rendering. `driver.ts::PrintDriver` accepts an immutable job, document and bytes and returns `sent`, `failed` or `uncertain`; TCP and spooler implementations must implement this contract in 4B. `browser-driver.ts` opens the authenticated job snapshot in an iframe and invokes the browser dialog. `scripts/printing-file-driver.mjs` writes exclusive `.bin` ESC/POS and `.json` document files to `.local-secrets/print-output/`, which is git-ignored. File output is local/development-only in the application and worker; no arbitrary filesystem path is accepted from staff or public requests.

`scripts/print-worker.mjs` polls Supabase directly every three seconds with the server-only secret key. `local:start` launches it beside the app and WhatsApp worker; `local:stop` stops all three. `npm run print:worker` is available for troubleshooting; `--once` processes at most one eligible job. Multiple worker processes may exist, but PostgreSQL admits only one active transport through the shared lease. File processing needs no kitchen page or Next.js HTTP request. Polling resumes after database errors; after a database restart, no in-flight job is automatically redelivered. The worker catches connection errors without logging secrets or order documents.

Browser auto-processing is opt-in per browser in the staff queue panel and requires a visible staff page. Cashier, kitchen and admin pages share one queue panel and alert. Manual requests can also prompt the browser processor. A browser dialog ending means only a browser handoff, not verified printing; cancelling the dialog can look like success. Network/spooler write acceptance will likewise not prove paper output without model-specific acknowledgement.

## Database and state machine

Migrations `202610250002` through `202610250009` introduce `print_devices`, logical `print_destinations` (`kitchen`, `cashier`), `print_jobs`, `print_item_state` and a singleton `print_processor_lease`, followed by review/privacy/lifecycle and manual-supersession guards. Both destinations initially point to one browser device. Admin may create more devices and map destinations independently. New jobs snapshot device configuration; changing a device affects **future jobs**. Existing jobs keep their original configuration. An explicit reprint uses the original content with the destination's current device settings, allowing recovery after driver configuration changes.

Normal transitions:

```
pending -> processing -> uncertain (persisted before any transport effect) -> sent
                      -> failed (generation failed before delivery)
processing interrupted -> uncertain
uncertain / failed -> manual review; optionally a NEW reprint job
```

Every claim serializes on the global lease, which lasts two minutes. Tokens fence completion; an expired processing claim becomes uncertain. New claims pause while any **unreviewed uncertain** job exists. There is no automatic retry for failed or uncertain delivery. This intentionally favors a missing ticket requiring staff review over duplicate preparation. Browser acknowledgement times out after 90 seconds, but OS dialogs and suspended processes can outlive a timeout. Staff must verify/stop the previous processor before recovery; no software lease can prove that an unreachable operating system or printer stopped. A still-live lease prevents review/reprint of its uncertain job.

The panel offers **Conferido, sem reimprimir** after staff confirmation, or **Reimprimir** after confirmation. Review is idempotent and changes only review metadata; the original result remains in history. Reprint requests use UUID idempotency keys, actor binding and immutable content, and produce a clearly marked copy. Completed sent jobs cannot be changed into failed jobs. A successful file write followed by lost DB acknowledgement remains uncertain and is never written automatically again. Files use exclusive creation, never overwrite an earlier attempt, and may contain a partial artifact requiring inspection.

Manual full-order requests supersede any still-pending jobs of the same document kind, so they cannot later dispatch a second automatic copy. Reprinting a specific pending job supersedes that pending original only and preserves its ADICIONAL flag. Row locks serialize this decision against processor claims; active processing rejects manual replacement. Uncertain jobs still require explicit review and are not silently cleared by a full-order request.

RLS remains enabled. Admin alone updates device/destination configuration. Active admin/cashier can read both destinations, claim browser work and review/reprint. Kitchen staff can read/process/review kitchen jobs only; kitchen snapshots omit the payment ledger. Global error counts reveal no payment content. File claims require the service role and may serve both destinations on one device. With the browser driver, run cashier receipt processing in a cashier/admin session. Waiters retain narrow kitchen preview/request access but cannot collect payments, configure devices or process the automatic queue. Queue SELECT grants exclude claim tokens/owner IDs; public endpoints cannot read jobs or request printing. The browser's claim RPC returns its own claim capability. SQL performs authorization independently of HTTP validation. Rate keys, payment history and order totals remain unchanged.

## Snapshot capture, additions and payments

Deferred order/item triggers capture the final transaction state, after order creation, item insertion and any upfront payment. Kitchen capture starts only for confirmed open/ready/out-for-delivery orders. `print_item_state.reserved_quantity` prevents concurrent/deferred triggers from scheduling the same quantity twice. A subsequent new item or positive quantity increment creates a separate **ADICIONAL** job containing only that delta, with ticket/name/time. `printed_quantity` and `printed_at` record acknowledged transport quantities (not verified paper output), while job snapshots retain the full history. Reservations are kept after failure/uncertainty: recovery is explicit, never another automatic original.

Already queued text/notes/prices/payment snapshots never change when the menu or live order changes. A kitchen additional shows its delta items and labels the money as the **order total**, rather than pretending the delta is the whole order. Name, ticket, table/service type, order notes and item notes are preserved. Receipt payment originals, applied historical rate, change in Gs and QR use the recorded ledger, never today's FX rate.

An automatic kitchen job still pending after its order closes/cancels is retired as reviewed failure without dispatch. Explicit reprints remain a staff decision and are marked as copies.

The cashier destination defaults to `on_demand`. `on_payment` creates one automatic original receipt on full payment, atomically with payment/order changes. Repeated updates cannot create another original. On-demand receipt printing goes through the same queue and driver as kitchen jobs. Later explicit copies are marked REIMPRESSÃO/REIMPRESIÓN.

**Cancellation notices are deferred.** Removing/reducing an already reserved or printed item does not emit ITEM CANCELADO in 4A. The existing authorization/deletion paths do not provide a stable cancellation event with reason and original item history. Synthesizing cancellation on every update/delete risks false notices during replacement, rollback or cleanup. Staff must communicate cancellations to the kitchen. Adding a real cancellation ledger/notice is a separate, explicit change; it is not claimed as implemented here.

## Width, encoding and test page

Paper choices: 58/80 mm; defaults 32/48 normal-width characters per line, configurable 24–64. Double-size text wraps at half that width. HTML uses a 48/72 mm printable region and scales its monospace font to the configured columns. Browser paper selection and margins still require manual setup; an HTML preview does not calibrate a thermal driver. ESC/POS uses `ESC @`, `ESC t`, bold/alignment/double size, QR model 2 and `GS V` cut. Unsupported cut/QR commands, font metrics and buffers must be checked against the actual model.

Character tables: CP860 (default command index 3) or CP850 (default index 2), with a separately editable ESC/POS index 0–255 because vendor mappings differ. The complete single-byte tables are stored locally in `codepages.ts`. Text is NFC-normalized; controls are stripped from text blocks to prevent injected printer commands. Characters absent from the selected codepage, including most emoji, become `?`. Codepage choice does not affect QR URL bytes. QR stores the existing random public tracking token; no customer phone/address is embedded.

The admin **Imprimir página de teste** action queues a real test document and its `/print/jobs/<id>` preview. It contains `ã õ ç á é í ó ú ñ ¿ ¡`, maximum-width rulers, large bold text, Gs formatting and QR. Test both widths and both tables. No compatibility with an actual printer, scanner, cutter or Windows driver has been established.

## Windows transport choice for 4B

| Option | Advantages | Limitations / questions |
| --- | --- | --- |
| Network TCP 9100 | Direct raw bytes; no browser; simple local-agent transport when the printer supports it | Needs confirmed LAN/Ethernet/Wi-Fi support, reserved printer IP, ESC/POS dialect and firewall scope. A successful socket write is not paper confirmation; partial writes are uncertain. Do not expose this port publicly. |
| Windows RAW spooler / shared printer | Fits a USB-connected Windows printer; integrates with an installed local/shared queue | Requires queue/driver name, Windows account permissions and a local native bridge. RAW data must already be valid for that printer. Spooler acceptance is not proof of paper output; shared-queue connectivity adds failure modes. |
| Browser with `--kiosk-printing` | Small deployment change when a browser/OS driver already prints correctly | Depends on browser policy/version, profile, selected/default printer and an active page. Little outcome visibility. Do not assume the flag works before testing; none is installed or activated by this block. |

Conditional recommendation: for the described single notebook, prefer a small Windows RAW-spooler agent **if the chosen device is USB-only and accepts ESC/POS RAW**. Prefer TCP if a documented network ESC/POS interface is available. Use the current browser driver as fallback/pilot verification, not as evidence of unattended hardware reliability. This is an architecture choice pending equipment details, not a printer purchase recommendation.

Primary references: [Microsoft RAW data type](https://learn.microsoft.com/windows-hardware/drivers/print/raw-data-type), [Microsoft print spooler](https://learn.microsoft.com/en-us/windows/win32/printdocs/print-spooler), [Epson command/character reference](https://download4.epson.biz/sec_pubs/pos/reference_en/index.html), [Epson QR model command](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lparen_lk_fn165.html). These describe interfaces; they do not certify an unknown printer.

Before 4B obtain: exact brand/model/firmware and manual; connection (USB, serial, Ethernet/Wi-Fi); installed Windows queue/driver name and account; advertised ESC/POS compatibility; paper width and printable dots/characters; supported encoding indices; QR/cutter support; availability of status queries and out-of-paper reporting; whether the one printer is physically convenient for both destinations; required copy count; offline/recovery behavior and permission to install a local agent. Test accents, QR scanning, cut/feed, long notes, loss of power/network, paper-out and duplicate avoidance with actual equipment.

## Migration and manual acceptance

Back up and stop all processors/app before applying migrations, regenerate types, lint/build and restart with `local:start`. Old pending jobs migrate to new pending snapshots; old sent history migrates to sent; old interrupted/error jobs become uncertain and require review. Existing legacy items are reserved to avoid automatically duplicating the original. A snapshot reconstructed from legacy data reflects the live order at migration time, **not proof of the historical paper contents**. The previous queue's claim/manual RPC grants are revoked, its order trigger removed and `/api/staff/kitchen-print` returns 410 so stale tabs cannot dispatch twice. Refresh all old staff/receipt pages.

1. Admin → Settings → Printing: save a named file device, choose 58 mm/32 columns and CP860; point both destinations to it. Keep receipt `on_demand`.
2. Review migrated uncertain jobs only after checking prior test output/stopping prior processors. Use the review-without-reprint action if appropriate. This is intentionally not automatic.
3. Queue a test page. With no staff page open, inspect ignored `.local-secrets/print-output/<job>.bin` and `.json`; the worker log is in `logs/print-worker.*.log`. Sent means test files were written. Repeat at 80 mm/48 columns and CP850.
4. Create/confirm an order with several items and notes. Check one original, then add another item to an unpaid open order through the existing supported staff/table flow. Confirm the additional contains only the new item. Upfront-paid counter totals remain immutable; this block does not bypass that financial rule.
5. Request receipt printing from its preview. Verify total, saved Pix amount/rate, change, name, ticket and tracking QR. Enable `on_payment`, pay another order, and verify one original receipt. Repeating the payment key must not create another receipt.
6. Reprint a job; verify the REIMPRESSÃO heading and original item snapshot. Simulate an interrupted attempt only in the local test environment; confirm no automatic replay and visible warning on cashier/kitchen pages. Review it before proceeding.
7. Switch to browser for **new** jobs, activate one staff browser and queue a test. Choose Save as PDF. Check controls are absent from output and both widths remain legible. Actual dialog, mobile and physical acceptance is manual.
8. For restart acceptance, stop/restart Supabase while the file worker runs. It must log unavailability, reconnect and leave any in-flight attempt uncertain for review. Automated tests inject connection/acknowledgement failures; a live power-loss/hardware test is still required.

Out of scope: TCP/spooler drivers, silent printing, model calibration, shifts, manager approval, waiterless QR policy, WhatsApp ready notices, fiscal invoices and pre-bills. No commit or push is part of this block.

## Validation performed (2026-10-25)

Local backup preceded migration application, and database types were regenerated. Lint and the production build passed. Tests passed: 12 native tests (including five print-engine tests), 37 WhatsApp Vitest regressions, all 14 SQL suites plus a real two-session PostgreSQL print-lease contention test, and six HTTP tests. SQL covers delta snapshots, full-payment receipt uniqueness/history, uncertainty/no-replay, reviews, claim fencing, role/RLS boundaries and payment privacy. HTTP covers admin device creation/update, secure previews, immutable additions, concurrent idempotent reprint requests, on-demand receipt idempotency and kitchen denial of payment receipts. Connection/acknowledgement loss was injected into the processor test, and the file driver wrote exclusive temporary artifacts in unit tests.

No real thermal printer, Windows spooler/TCP transport, browser print dialog, physical QR scanner, live power cut or live Supabase restart was exercised. Interactive PDF/print layout, physical encoding/QR/cut, and a live restart remain manual acceptance. Legacy uncertain jobs were preserved for staff review, not silently cleared. No commit/push was made.
