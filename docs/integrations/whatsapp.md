# WhatsApp ATM-SIG

## Current status — 12 November 2026

Current provider: Fonnte Free, chosen by the owner after the Meta delivery restriction below. No paid plan, auto-order or payment method enabled. The original Meta integration remains a separate inactive prototype.
App ID: 3590430167801807. Business portfolio ID: 4588218968116531.
Test sender: +15551679733. Phone Number ID: 1447598038437900.
WABA ID: 1147389444407499.

The first deployment implements verification and ingress security only. It is NOT a working chatbot. GET /api/whatsapp/webhook supports Meta verification. POST checks raw-body HMAC and bounded payloads, but returns 503 while durable message processing is unavailable. It must not return a successful receipt and discard messages. Do not subscribe real users until the remaining phases pass.

Production configuration: WHATSAPP_VERIFY_TOKEN (Secret), WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID. WHATSAPP_ACCESS_TOKEN is now saved as a production Secret (temporary Meta test token). Pending: WHATSAPP_APP_SECRET (Secret). Never commit tokens, put them in NEXT_PUBLIC variables, or log request bodies/signatures/phone numbers. Tokens belong in Vercel environment settings, not chat or documentation.

## Remaining implementation and acceptance gates

1. Persist a durable inbox and outbox in Supabase. Unique provider message IDs, exclusive processing leases, bounded retries, status callbacks, and recovery for ambiguous deliveries. RLS on every exposed table; no anonymous reads or public service-only RPC execution.
2. Authenticated profile linking: high-entropy single-use code, expiry, hash storage, verified sender ownership, explicit WhatsApp opt-in, unlink/revoke. An arbitrary phone number or chat-supplied account ID must never authorize access.
3. Execute through shared ATM business rules and user-scoped access. Recheck active user, current role, unit, task ownership/reviewer rights per operation. Do not dispatch arbitrary SQL or grant the bot blanket admin action access.
4. Chat menu/wizards: list/detail/create/duplicate tasks; progress/status/comments; WBS; supports; evidence uploads/links; review; deadline requests/approvals; recurring tasks/categories; calendar/report summaries; organizations read-only. Sensitive account/security actions stay on authenticated web pages. Clarify ambiguous task selection, show a preview, require confirmation, and revalidate before commit. No success response until the database commit succeeds.
5. Notifications: mirror actual recipient rows instead of recomputing a wider audience. Only the assigned reviewer receives review alerts. Checkpoints remain 50/80/90. Honor opt-out and channel preference.
6. Free-only delivery: validate provider's current billable categories/windows and account quota before sending. Enforce a persistent global monthly allowance with atomic reservation and safety margin; fail closed when pricing/usage is unknown. No paid utility/template fallback. Keep web push/email available. Account usage includes messages sent outside ATM, so the application counter alone is not proof of remaining free quota.
7. UAT all six roles: allowed and forbidden operations, disabled/unlinked users, evidence checks, stale confirmations, duplicate/out-of-order webhooks, malicious files, expired credentials, quota exhaustion, retries and web synchronization.
8. Release only after real test-phone-to-ATM-to-database-to-web-to-WhatsApp verification. Delivery/read callback evidence is distinct from HTTP acceptance. Web must invalidate/refetch or receive realtime changes. Do not claim end-to-end readiness from ingress tests.

Meta's dashboard currently warns that unpublished apps receive dashboard test events only, and production data requires publication. Check publication requirements before promising an interactive test with real inbound messages. No production number registration or business verification has been completed by this deployment.

## Test and provider setup

Callback: https://atm-sig.vercel.app/api/whatsapp/webhook
GET must return the exact numeric hub.challenge only when hub.mode=subscribe and hub.verify_token matches. Unconfigured endpoints fail closed; unsigned or tampered POST requests fail authentication. The specific callback bypasses cookie login middleware, with authentication enforced inside the handler; other API routes remain unchanged.

Use a verified recipient in Meta's Try it out screen. User completes any OTP/account-security consent themselves. Do not add a payment method or upgrade plans. Keep Meta test-token expiration in mind; production will need appropriate server-side credentials and publication approval.

## First real delivery test

Recipient ownership was verified in Meta. A single dashboard template send was accepted, but its status callback reported FAILED, error 130497: business account restricted from messaging users in the destination country. Do not equate the dashboard send confirmation with delivery. Business Support Home for this WABA shows no reviewable policy issues and Request review is disabled; it does not establish that the country restriction has been lifted. No repeat send was attempted. Do not promise that adding payment, switching templates, opening a 24-hour window, or publication will fix this account restriction.

Alternative evaluated: Fonnte free device offers 1,000 monthly messages and webhook chatbots, but it is an unofficial WhatsApp Web gateway. It requires explicit user choice and linked-device authorization for a dedicated bot number; do not connect personal chat history or switch provider silently. Outbound attachment limitations must be tested before promising feature parity.

## Fonnte account-linking and notifications release

The dedicated ATM-SIG device is connected. A single real message from the ATM production self-test is recorded as sent/delivered in Fonnte history (provider message 192649925). The initial endpoint misclassified tracking metadata as a failure; the adapter now treats status=true as acceptance even without tracking IDs and normalizes numeric/scalar IDs. No retry was performed for that already-delivered message.

This release adds a WhatsApp card to /account. Each authenticated user generates a high-entropy, ten-minute, single-use code and sends HUBUNGKAN followed by that code to the bot. Only its SHA-256 hash is stored. Phone uniqueness, active-user checks, conditional code replacement, and atomic code consumption prevent cross-account linking. No passwords or Supabase sessions are stored for this notification-only link.

Supported chat commands at this stage: HUBUNGKAN, MENU, STOP, MULAI, PUTUS. Task mutations, private queries and conversational task forms are NOT implemented or enabled in this release. The bot states this explicitly and links to the authenticated web app. These remain follow-up work; do not describe all ATM features as available through chat.

Migration 20261112161939_whatsapp_channel adds links, receipt hashes and an outbox, all with RLS enabled and no anon/authenticated grants. Service-only SECURITY INVOKER functions atomically deduplicate incoming messages, link accounts and enqueue replies. Existing notifications provide the exact recipients; review-request notifications additionally recheck the assigned reviewer before enqueue/claim. No historical notification blast: only post-link notifications from the last 24 hours qualify.

The existing thirty-minute push scheduler also drains up to five queued WhatsApp messages. Incoming webhooks schedule an immediate drain after durable acceptance. Only a connected Free device with available quota may send. Claimed sends are not automatically retried if their result is unknown; they remain for reconciliation. Accepted does not mean delivered/read. No provider auto-upgrade/order API is used. Opt-out/unlink cancels pending private notifications. Fonnte inbox storage and group processing stay off.

Production config: FONNTE_API_TOKEN (Secret), FONNTE_TEST_RECIPIENT (Secret), FONNTE_WEBHOOK_SECRET (Secret), FONNTE_BOT_NUMBER (Config), WHATSAPP_CHANNEL_ENABLED=true (Config). The Fonnte webhook uses a random 256-bit capability in the key query parameter because the device webhook configuration does not expose a signing-secret field (the documented secret field belongs to Flow webhooks). Treat the complete callback URL as a secret: do not publish it, log it in application code, put it in chat/screenshots, or use it in a client bundle. Rotate if disclosed. Sender/device/freshness/size validation is additional protection, not a substitute for callback authentication.

Free-plan attachment limitations: direct inbound/outbound attachments require a higher Fonnte package according to provider docs. Keep link/web upload paths rather than silently upgrading or promising file parity.

Validation: 400 tests passed, TypeScript and targeted ESLint passed, optimized production build passed. Database checks confirm RLS=true and anon/authenticated SELECT=false for all three tables, and the migration is recorded. Browser-level phone-to-profile-link and notification-recipient UAT still requires the account owner to send their own linking code; it has not been claimed as passed.

## Task-command follow-up — 13 November 2026 (WIB)

The owner confirmed receiving the real successful-link reply. A read-only database check confirms a non-null linked phone and notifications enabled. This closes the personal-phone linking acceptance gap above; it does not prove every future notification is delivered.

Implemented behind the server-only `WHATSAPP_TASK_COMMANDS_ENABLED=true` switch:

- `TUGAS [page]`: five own tasks per page, including their full IDs.
- `REVIEW [page]`: tasks in Review explicitly assigned to this reviewer. This is a listing, not an approval command.
- `DETAIL <UUID>`: details for an owned task or an explicitly assigned review task.
- `LAPORAN`: status and overdue counts for the sender's own tasks.
- `KALENDER [page]`: own unfinished tasks due today through the next six calendar days, with dates/times in Asia/Jakarta.
- `PROGRES <UUID> <0-100>`: preview only. `KONFIRMASI <12-character code>` commits within five minutes; `BATAL` discards the pending preview. A new preview replaces the old one.

Migration `20261112174755_whatsapp_task_commands.sql` creates a service-only, RLS-protected confirmation table and a service-only SECURITY INVOKER receiver. A command never accepts a chat-supplied user ID. It resolves the active user from the verified phone, serializes on the link row, durably deduplicates receipts, and commits a reply in the same transaction as any mutation. Progress changes require current PIC ownership and role level >=2. Confirmation rechecks the link generation, expiry, current actor/ownership and full task-row version. A changed/reassigned task requires a new preview.

The progress UPDATE executes the existing progress-history, transactional audit and reviewer-notification triggers. The actor context is transaction-local, derived solely from the verified link and restored before reply enqueue. No user password, session token, JWT signing key, or anonymous execution grant is introduced. A rejected trigger rolls back the change before a failure reply is queued. The existing delivery worker rechecks active account, linked recipient and notification opt-in before sending private replies.

STOP and PUTUS discard pending confirmations. Chat task commands require MULAI if notifications have been stopped. The generic help and opt-out acknowledgments remain available without private-task access.

Fonnte requires HTTP 200 to acknowledge a webhook (official provider update: https://docs.fonnte.com/update-12-januari-2026/). The receiver now returns 200 for authenticated validation probes and deliberately ignored payloads, while malformed JSON, unauthorized requests and database failures retain failure statuses. No authentication or sender/freshness checks have been relaxed.

Rollout order: apply and verify the migration, deploy matching code with the switch off, then enable the switch in production and redeploy. Until the switch is enabled, legacy linking and notification commands continue through `wa_receive`; new commands fall back to the old help rather than calling a missing RPC. Never enable the switch before the live database migration is verified.

Supabase access was restored on 13 November 2026 (WIB). The migration is applied to hosted Singapore project vgmllwyvzttnlevorjim and its filename matches the recorded version 20261112174755. Live checks confirm confirmation-table RLS, no anonymous SELECT or authenticated RPC execution, and service-role execution allowed. Activation and real-phone command UAT are tracked below. Creation, review decisions, WBS/support/evidence, deadline workflows and the remaining conversational forms still require follow-up implementation and testing. This is not full ATM-through-WhatsApp feature parity.

## Production activation and web synchronization

PR #29 is merged as 52b845c364f9d930a4b81229d3546f2c11496061. Production deployment dpl_BzRWVSZbbxJzndLxWNisyWKt44nS is READY on atm-sig.vercel.app with region sin1, and WHATSAPP_TASK_COMMANDS_ENABLED=true is scoped to production. Hosted-database service-role tests passed for MENU, task/review/calendar lists, report, detail, progress preview, confirmed progress, existing audit/history attribution and duplicate suppression. The test transaction was rolled back; zero test phone/outbox rows remain, and the original live link remains active.

The authenticated application shell now refreshes server-rendered task views every thirty seconds while visible and online. It pauses while editing a field or opening a modal, excludes creation/review/account forms, and cleans up timers/listeners when leaving task views. This uses the existing authenticated server queries and preserves filters, client state and scroll through router.refresh; it introduces no browser admin credentials or additional data-access policies. It is periodic synchronization, not a claim of instantaneous Supabase Realtime delivery.

Real personal-phone commands after activation and physical delivery of their new replies still require the owner's MENU/TUGAS check. The successful account-link reply was confirmed earlier; it is separate evidence from the subsequent command release.

## Guided menu and web-scope correction — 13 November 2026 (WIB)

The confirmed real-phone commands exposed a scope mismatch: the linked Super Admin had no tasks as PIC or directly assigned reviewer, while the application contained 14 tasks. The initial personal-task queries therefore returned zero. The new service-only `wa_scoped_tasks` helper evaluates the same central `can_access_task_scope` rule as the web using the verified active actor, restores its transaction-local claims, and returns only authorized rows. Manager/SM retain unit hierarchy scope; GM/SA can read all authorized tasks. Review listings include all Review tasks for GM/SA, otherwise only assigned reviews. Reports and seven-day calendars use the same scope. Progress edits remain strictly PIC-only, including for GM/SA.

The old receiver remains available for rollback. Production code switches to `wa_receive_guided` after migration `20261112181649_whatsapp_guided_menu` is verified. The migration adds a service-only RLS-protected conversational state table and service-only SECURITY INVOKER helper/receiver functions. Sessions expire after fifteen minutes, bind to the exact user/phone/link generation, and recheck current access on each selection. Existing five-minute progress confirmations, task-version checks, audit/history attribution, receipt deduplication and atomic outbox commits remain in force. STOP/PUTUS clear conversational state.

MENU now presents formatted, numbered text choices: 1 TUGAS, 2 REVIEW, 3 LAPORAN, 4 KALENDER, 5 SAYA, 6 PROGRES, 7 AKUN, 8 NOTIF. These are typed numeric replies, not a claim of native interactive WhatsApp buttons. A task list stores only the displayed page's authorized IDs; replying with its number opens the task. A PIC can choose the progress action, reply with a percentage and confirm with 1/YA or cancel with 2/BATAL. MENU returns to the main choices; LANJUT/KEMBALI page through the current list. Legacy UUID-based DETAIL/PROGRES/KONFIRMASI commands still work. AKUN identifies the linked ATM account and role; SAYA explicitly distinguishes personal assignments from role-wide access.

The profile card removes the old Periksa koneksi button, which only called router.refresh with no explicit feedback. While a linking code is active, an authenticated server check runs every five seconds while visible and online, stops after ten minutes, and shows the connected state on success. The card shows connection status, guided linking steps and concise bot shortcuts. No provider/API key is sent to the browser.


## Corrected linking destination — 13 November 2026

The owner corrected the linking destination to +62 851-3599-9148. Production WHATSAPP_CONNECT_NUMBER is 6285135999148 and supplies the wa.me link returned by beginWhatsAppLink. FONNTE_BOT_NUMBER remains the independently configured webhook device identifier; changing a user-facing destination must not silently alter the established device-validation rule. Environments without the explicit destination retain the previous fallback. No provider token, linked user phone, notification recipient or webhook secret changes.


## Expanded business operations and feature links — 13 November 2026

The full receiver supports 30 native operations: task create/update/delete/duplicate/status/review/comment/deadline/reassignment; WBS add/toggle; support request/provision; evidence requirement/HTTPS link; deadline decision; category create/update/delete; recurring template create/update/toggle/delete; organization create/update/delete; one/all notification read; reminder response; own profile name. The FITUR/CRUD menu lists single-word commands; selected task details expose numbered actions. Additional features and account/security management use authenticated direct web links. Binary uploads, exports, PWA permissions, Google authorization, passwords and administrative account invitations/role/status changes are handed off to their actual web pages rather than collecting credentials or pretending free-plan media transfer is available.

New action sessions are service-only, RLS-protected, expire after fifteen minutes and bind to the exact verified phone/link generation. A form is sent as field: value lines in one message. It is validated by executing the existing operation inside a subtransaction that is rolled back before preview. No preview task, notification, audit or evidence row is persisted. A confirmation expires after five minutes and is consumed once; YA/1 confirms, BATAL/2 cancels. Existing row versions and current access are checked again before commit.

Operations deliberately switch to PostgreSQL authenticated with transaction-local claims from the verified active actor, so the existing RLS, atomic RPCs and triggers remain authoritative. No new SECURITY DEFINER mutation bridge, signed user JWT, stored password or anonymous execution grant is added. The original service role/claims are restored. Channel-specific audit and the mutation commit together; a safe wrapper rolls back failed operations before queuing an error reply. Receipt deduplication, private outbox recipient checks and the free-device/quota gate remain intact. The bounded sender limit is thirty messages per minute to accommodate forms. STOP/unlink revoke pending private sends and action state.

Every successful mutation includes its affected subject and an authenticated checking URL. Existing lists, reports, calendars, details and new master/support/evidence views also include the corresponding web URL. A deleted task links to the task collection; recurring templates link to /tasks/recurring, categories to /task-templates, organizations to /organizations, notifications to /notifications, and task changes to /tasks/<id>. Logs remain available via AUDIT for authorized roles.

Validation includes a full schema fixture using the existing ATM migrations/RLS/triggers, role/scope denials, preview rollback, stale versions, evidence gates, assigned-reviewer decisions, WBS progress, support recipients, deadline approvals, recurring/category/org CRUD, notification isolation, reminder idempotency, profile constraints, audit failure rollback, and operation execution under a non-inheriting authenticator session. Real-phone operation delivery is distinct from database/API validation and must not be claimed without a corresponding received command and provider result.

Preparation status: 543 tests, TypeScript, targeted ESLint, optimized build and diff checks passed. The proposed migration is 20261113093035_whatsapp_full_operations. Two hosted Supabase confirmation requests expired; a subsequent live schema check confirmed both whatsapp_action_sessions and wa_receive_full are absent. This expansion is therefore NOT applied or enabled in production yet. Keep the PR in draft until the migration can be approved, then verify the hosted operation/actor switch with rollback-only SQL and the real PostgREST authenticator before deploying matching code. Reconcile the migration filename with the version recorded by hosted migration tooling. Do not merge matching route code while its RPC is missing.
