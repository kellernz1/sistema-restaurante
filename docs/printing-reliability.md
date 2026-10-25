# Printing reliability — block 4A.1

## Upgrade and request guard

Migration `202610250010_print_reliability.sql` upgrades 4A. Back up, pause processors/app, apply, regenerate types, build and refresh staff pages. Both request paths use the private `assert_print_document_idle`: global lease -> order -> document jobs. Job-ID reprints and full-order prints reject any processing sibling or uncertain sibling with a live lease. Test documents without orders are scoped to the job ID. Two-session PostgreSQL tests verify a competing request waits and then rejects both states/paths. Authorization, RLS, historical payment privacy and request UUID binding remain enforced in SQL.

## Units and copies

`forwarded_quantity` replaces `reserved_quantity`: it counts item units reserved in committed kitchen snapshots, **not verified paper output**. Additions use positive deltas beyond those units. Pending/uncertain attempts retain reservations so another order edit cannot silently resend them. Cancellation/decrease reconciliation remains outside this block.

`printed_copies` counts acknowledged kitchen documents containing the item, once per job regardless of quantity. A reprint of a two-unit item adds one copy and zero units. `delivery_counted` prevents repeated acknowledgements/human confirmation from counting again. The migration rebuilds copies from sent jobs and removes `printed_quantity`. A human `printed` decision may acknowledge an uncertain original once while retaining its original uncertain transport status and recording the decision separately.

## Deadlines and heartbeat

- File-worker RPCs: 10-second deadline, with AbortSignal on the actual Supabase query.
- File driver: 30-second deadline; supported file writes receive AbortSignal. Partial/ambiguous output remains uncertain and is never automatically resent.
- Browser HTTP commands: 10 seconds; existing iframe/browser acknowledgement limits remain separate. JavaScript cannot forcibly dismiss a blocking OS print dialog.
- File heartbeat: instance UUID, version `4A.1`, driver and timestamp, updated in the poll loop and every 10 seconds during delivery.
- Browser heartbeat: only while explicitly enabled on a visible staff page or during an explicit processing attempt. Staff identity is bound to the instance.
- Freshness window: 30 seconds. Pending-age alert: configurable 10–3600 seconds, default 60, in Settings → Printing. A kitchen browser cannot satisfy cashier receipt processing.

Authenticated `/api/staff/printing/health` returns status, workers/versions/last seen, threshold and aged pending work lacking an eligible active worker. `/api/health` remains limited to app/database reachability. Cashier/kitchen show the missing-worker alert separately from failed/uncertain-job review alerts. A healthy worker may be intentionally paused behind uncertainty, which still requires staff review.

The worker retries connection errors without recreating its process or replaying uncertain jobs. On 2026-10-25, a guarded live test restarted **only the PostgreSQL container**, without reset/volume deletion. The same worker instance/PID resumed heartbeat in **4 seconds**. Reproduce with `node scripts/local/verify-print-reconnect.mjs --confirm-local-db-restart`: it requires local mode, a running worker and no active pending/processing/uncertain jobs. This is not a full notebook power-cycle or physical in-flight printer test. Unit tests also inject unavailable RPCs, lost acknowledgements and a driver that never completes.

## Audited decisions and recovery

`print_job_reviews` records request UUID, job, operator, decision (`printed`, `reprint`, `discard`), timestamp and resulting reprint job when applicable. Staff cannot write this table directly. Job metadata identifies the latest reviewer/decision. Same-key retries are idempotent; changed actors/decisions are rejected. Reprints also audit originals/replaced pending work.

Only admin may discard/archive. The operation preserves content/status, sets `archived_at` and records `discard`; it creates **no print job and no transport call**. Claim/finish/reprint exclude archived work. Both review/archive use the document-idle guard. An expired processing attempt is classified uncertain through normal queue maintenance before human recovery. Staff must verify the previous process stopped before confirming uncertainty.

The panel filters/counts each state and has **Mostrar arquivados**. Archived previews omit reprint controls. An explicitly requested new document from an order is a separate staff action; archive itself never schedules it.

The browser writes the complete request and UUID to per-target `sessionStorage` **before POST**. Reloading the same action offers **Consultar envio**, repeating that exact payload. Confirmed responses remove it; uncertain responses retain it. Definitive validation/authorization errors permit review without blindly retaining an invalid request. Disabled storage blocks new submission with a message. Storage is per tab/browser and supplements PostgreSQL idempotency.

## Legacy jobs handled

Before archive: **8 pending, 4 failed, 0 processing/sent/uncertain**. All twelve matched retired legacy queue IDs and used the browser driver. The no-send plan was explained before execution. The active local admin profile discarded them through the audited RPC; that action did not edit orders/items/payments/quantities. The ignored manifest `.local-secrets/print-archive-4a1.json` retains selected IDs and request keys.

| Job ID | Original state | Decision |
| --- | --- | --- |
| 5d5a7a50-d11a-4901-98c3-349a86139ee7 | pending | archived/discard |
| 8d35cb6a-32a1-4701-b2d9-f7c41b1fe843 | failed | archived/discard |
| 6c76cc5d-b9ef-466b-82ed-e33c0037bc9f | pending | archived/discard |
| 67e6c4fe-2d9c-430c-bc5b-06893864611a | failed | archived/discard |
| 89945496-9737-4d12-926a-be3a54be4e62 | failed | archived/discard |
| 5f5fb714-cb54-41f1-a42f-d645565448a3 | pending | archived/discard |
| 6613cf14-d5f2-4625-bded-b6e242483d70 | pending | archived/discard |
| 3c7303c1-c161-4f74-bd76-f96e7f9c50e9 | pending | archived/discard |
| da2c8b74-6f34-4be8-8cb9-8abc3118a957 | pending | archived/discard |
| a44b10ec-c77a-42e0-a7e6-8f982fa4427b | pending | archived/discard |
| 2c2e4732-7e42-4ea8-a261-c7cf5b134422 | pending | archived/discard |
| 0f2e0bdc-3085-4dff-b4be-b27d54618325 | failed | archived/discard |

Afterward: **zero active jobs in every state**, twelve archived jobs and twelve discard audit records. No output was sent. Existing jobs retain their driver snapshot when settings change. None of these archived jobs can dispatch when a future real driver is selected. Real drivers remain unimplemented; only future work or explicit permitted reprints use newly configured destinations.

## Clean installation

`npm run db:validate-clean` creates a random `mesa_clean_<24 hex>` database from `template0` in the existing local PostgreSQL cluster. It never resets, restores over, migrates or deletes the development database. It copies only Supabase Auth pre-data definitions, never users/application data, establishes base grants/Realtime publication and applies every project migration in version order. Synthetic staff users and the project seed support the complete SQL suites. Every concurrency script honors this database target.

Cleanup accepts only that exact generated temporary name, never `postgres`, `_supabase` or templates. It changes no environment file, network port or cluster role. This validates application PostgreSQL migrations/RLS/functions against Supabase prerequisites. It does not provision a second GoTrue/PostgREST/Realtime HTTP stack and does not replace first-machine/LAN acceptance.

Validation on 2026-10-25: **33 migrations**, seed, **15 SQL suites** and real counter/processor/document concurrency cases passed in a separate database, which was removed afterward. SQL also passed on the upgraded local database with processors paused. Lint/build, **15 native tests**, **37 Vitest regressions** and **6 HTTP tests** passed. HTTP covers authenticated health, admin-only policy/archive, audit/idempotency, archived-list behavior and archived reprint refusal, alongside counter/payment/printing regressions.

## Manual checks and limits

1. Refresh staff pages. In Settings → Printing save the stale-pending alert threshold (default 60 seconds).
2. With the file worker stopped, queue an isolated test document. After the threshold, cashier/kitchen should show the missing-worker alert. Restart the worker and check heartbeat/processing recovery. Do not interrupt real hardware output as part of this software test.
3. A simulated active processing/uncertain lease must block both reprint paths; SQL tests exercise this without physical output.
4. Confirm uncertain work was printed, request an explicit reprint, or as admin archive without sending. Check reviewer/decision/time. Cashier/kitchen cannot archive.
5. Interrupt a request response in local testing, reload and use **Consultar envio**. Verify UUID reuse and no extra queued copy.
6. Inspect the twelve old jobs under **Mostrar arquivados**; they must not return to the active queue.

No commit/push was made. TCP/spooler drivers, silent printing, cancellation notices, shifts, manager approval and fiscal invoices remain out of scope. Physical printer acceptance and a full power-cycle remain pending.
