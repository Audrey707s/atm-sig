# ATM conversational agent v2 — staged implementation

Status: branch/preview implementation. Production promotion requires the live acceptance gates below. Unit/SQL tests do not establish LLM accuracy.

## Verified existing architecture

Web: authenticated `/api/assistant` → `requestAssistant` → `atm_ai_turn` → `wa_safe_operation`/`wa_apply_operation` → existing RLS, transactions, task-bundle RPCs and triggers. WhatsApp: authenticated Fonnte webhook → linked identity and receipt check → same `requestAssistant`; explicit linking/STOP/MULAI/PUTUS and native forms remain available. The old planner is deterministic; merely changing its prompt could not fix general language understanding.

The real catalog exposes 31 operations. Existing regression tests exercise all 31 through web and WhatsApp disposable PostgreSQL fixtures. These are executor tests, not proof that an LLM correctly selects every operation. Passwords, email changes, invitations/role assignment, OAuth, file upload and binary exports stay in authenticated web flows. The agent must not invent tools for these.

## Implemented path

- Native Groq tool calling with AI SDK, bounded `plan_atm` tool, allowlisted role-specific catalog, internal schema validation, maximum five planned steps and no model-authored success response.
- Default model `openai/gpt-oss-20b`, configurable server-side `ATM_AGENT_MODEL`. Only the existing owner-confirmed free plan and existing key are used. No paid fallback or account rotation. Provider errors use the deterministic executor path; general language understanding cannot be guaranteed when free inference is unavailable.
- Shared orchestration across both channels; backend remains authoritative. The UI supplies a request UUID, WhatsApp uses its validated receipt identity.
- Private per-user/channel/conversation sessions; backend-produced draft/context snapshots are restored when switching threads. Recent window bounded to 12 entries, compact verified-state summary, active task/PIC, read filters and pending batch. Scope/link changes invalidate memory.
- Request claim and 60-second lease serialize one actor/channel. The fence prevents expired model work from executing. A busy webhook returns retryable failure; delivery order is database claim order, not a guarantee of chronological order for delayed network messages.
- Terminal execution, audit, WA receipt/outbox and cached reply share one SQL transaction. Request ID reuse with another payload fails. Finalized replay returns the actual stored result, not a second mutation.
- Existing task matching remains authoritative; added scoped candidate retrieval with exact/substring/full-text matching and bounded model context (30 candidates), conservative fuzzy title/PIC resolution, confidence and ambiguity preservation. No vector index has been added. A bounded candidate set is not exhaustive semantic search across a large installation.
- Exact low-risk priority/progress-below-100 updates may commit directly. SQL repeats this classification. Fuzzy, destructive, high-impact and multiple writes retain confirmation.
- Batches validate every operation and snapshot, lock existing targets, execute all writes in one subtransaction and roll all back if any write/audit fails. Dependent transitions that are invalid in the starting state require staged conversation; they are not silently forced through business gates.
- Private traces record operation/model/token counts/latency/outcome, never message text, phone, key or tool arguments. Private bounded messages are stored separately. Thirty-day purge runs daily at 02:17 WIB when pg_cron is installed; lazy cleanup also runs per active user.

## Feature flag

`ATM_AGENT_V2=off` (default) uses the previous chatbot. `canary` selects actual Super Admin roles. `on` selects all users. A number 1–100 selects a stable actor hash percentage. No flag grants role permissions.

## Required live acceptance before production

1. Apply the additive migration and verify advisors/grants.
2. Enable only the preview branch and sign into the preview as an existing test user.
3. Execute the 120 role/conversation cases in `conversation-uat.json` against disposable data. Their initial `liveResult` is `NOT_RUN`; they are not reported as passed.
4. Measure intent and unambiguous resolution accuracy separately from executor tests. Targets: >=95%; unauthorized and false-success cases: 0. Track ambiguity/clarification, model failures and missing evidence separately.
5. Verify six roles, actual browser and actual Fonnte deliveries, linked identity changes, retry/concurrent requests, database failure, long conversation, prompt injection and rollback.
6. Only then promote canary, observe traces and expand. Free-provider quotas and provider outages remain real constraints.

Known limitations requiring further live validation: model-selected fields/operations; semantic retrieval beyond the candidate window; delayed-message ordering; long-context summarization beyond verified state; full 120-case live evaluation; physical WhatsApp delivery. Existing backend coverage must not be described as all these acceptance gates passing.

## Rollback

First set `ATM_AGENT_V2=off` and redeploy. Existing chatbot tables, catalog, business functions and web features were not replaced. Retain new private tables while diagnosing to preserve audit/replay evidence. A destructive schema rollback is optional after retention/export decisions, using the reviewed script `rollback.sql`; it removes only v2 orchestration objects and its own cron job.
