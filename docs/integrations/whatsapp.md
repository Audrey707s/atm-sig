# WhatsApp ATM-SIG

## Current status — 12 November 2026

Provider: official Meta WhatsApp Cloud API. No paid plan or payment method enabled.
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
