# Validation checkpoint — 19 November 2026 WIB

Branch: `feat/context-agent-v2`.
Implementation commit: `80ed496d3d0bae5e8e3658e97e7995c5f217c7c3`.
Preview: https://atm-k46ifkn7j-audrey707s-projects.vercel.app
Production was not promoted. Preview branch has `ATM_AGENT_V2=on`; production defaults to the previous path.

| Check | Verified result |
|---|---|
| Automated suite | 902 passed, 89 files |
| TypeScript | `npx tsc --noEmit` passed |
| ESLint | `npm run lint -- --quiet` passed |
| Production build | `npm run build` passed |
| Vercel preview | READY for implementation commit |
| Additive hosted migration | `20261118173956_conversational_agent_v2` applied |
| Hosted database read | claim + executor read returned `read_ok=true`, entire smoke transaction rolled back |
| Security advisors | Same 3 WARN categories before/after; no new warning category |
| SQL fixtures | Legacy 31-operation web/WhatsApp execution retained; added v2 lease, replay, conversation isolation, six-role permission, stale work, atomic batch and database failure tests |
| Real-model recognition/resolution | NOT EVALUATED; no 95% accuracy claim |
| 120 role/conversation UAT cases | Prepared; all `liveResult=NOT_RUN` |
| Browser preview | Reached login page; existing production session is not shared with preview hostname |
| Real WhatsApp v2 end-to-end | NOT RUN; original Fonnte production webhook remains unchanged |

The 902 passing tests are software regression/policy/executor checks, including mocked orchestration boundaries. They are not 902 real-model conversations or physical WhatsApp deliveries. The read-only hosted smoke is not a production CRUD UAT.

Remaining release gate: sign in to the preview, run representative real-model conversations and disposable fixture UAT, investigate failures, measure the target metrics, then verify Fonnte before expanding the production rollout. Do not promote merely because the local regression suite passes.

## Live browser findings after preview sign-in

Signed in as GM; tested the actual Groq runtime, not a mock. Three read-only utterances did not return the expected visible tasks:

- `tolong buka task nata`: model combined an explicit PIC with `mine_open`.
- `tampilkan semua tugas milik Nata, termasuk yang sudah selesai`: model put `pic:nata` into the title query and selected a personal/open mode.
- `lihat tugas "Ada deh" milik Sevtuari`: model invented a `title:... AND pic:...` query syntax which the backend does not support.

No business data was changed. This is a failed live recognition/resolution checkpoint, not an acceptance pass. Trace metadata verified the configured `openai/gpt-oss-20b` provider was invoked.

Follow-up patch adds field descriptions and read examples, normalizes an explicit PIC away from implicit personal scope, recognizes the observed internal owner-filter representation and honors explicit inclusion of completed tasks. The legacy default-open postprocessing no longer overrides a validated model plan. These fixes require redeployment and another live run. Use the stable branch preview alias for future iterations so its login is retained across deployments.

## Stable-preview GM retest

On the stable branch URL, `tolong buka task nata` returned the correct owner-qualified task page. `lihat tugas "Ada deh" milik Sevtuari` returned the correct singular task. The typo `mengerjkan paper punya nata` resolved to Mengerjakan paper belonging to Nata. These were actual model calls and read-only browser checks.

`yang tadi tenggatnya kapan?` reached the fallback path when the provider call failed, and fallback did not understand the reference. Follow-up changes add a quota-independent read of an already-verified singular task and reduce provider context to title/PIC candidate pairs. The escalation attempt did not change role or data; its fallback wording remains generic.

The preview-only `/agent-evaluation` page runs the fixed 120 synthetic planning cases against the real configured model, paced within the free quota. It never invokes business action tools and therefore is not a substitute for database or physical WhatsApp UAT. That original browser-loop implementation retained results in the tab session; it has now been replaced by the server queue described below. No accuracy figure is asserted in advance. The API checks preview environment, same origin, verified active GM/SA identity and fixed case IDs. It is unavailable in production.

The multi-read SQL fix merges displayed task rows and server-held numeric choices, preventing a selection from pointing into only the final group. Additional SQL regression coverage verifies the selected task.

Latest local suite: 925 tests passed across 91 files; TypeScript, lint and build passed. Subsequent live evaluation is still a release gate.

## Persistent evaluator revision — 19 November 2026

The old evaluator could stop when its tab closed, timers were throttled, or a request hung. Model schema failures also lacked useful persisted detail. The revised evaluator stores the run and all 120 fixed case IDs in private Supabase tables and dispatches a preview-only authenticated worker from pg_cron/pg_net every minute. It runs at most two provider attempts per minute globally. The browser only reads status and submits start/pause/resume commands; it can be closed.

- Leases, fenced completion, bounded fetches and five-attempt recovery prevent one lost request from blocking the run forever. Transient failures use backoff; schema/plan FAIL advances to the next case. Configuration errors pause visibly.
- PASS, FAIL, REVIEW and infrastructure ERROR remain separate. An exhausted provider retry is never counted as PASS. Every saved result has the server-stamped full source revision. A new deployment pauses runs belonging to a different revision.
- Owner/active-role checks and service-only RPCs protect progress. The worker bearer secret is preview-branch-only and held in private database configuration, not source or browser state. Migration `20261119102602_persistent_agent_evaluation` was applied; its one-minute cron job is active. Security advisory WARN categories are unchanged.
- Old session-only results are not imported as verified server results or erased. Retry retains the server attempt history. Runs expire after 30 days.

Final local checks for this queue revision: **951 tests passed across 94 files**, TypeScript passed, ESLint had zero errors (two existing unused-variable warnings), production build passed. Queue tests cover retry, expired leases, stale completions, ownership, revoked roles, revision changes, crash exhaustion, permission grants, configuration failure and UI restoration/unmount behavior.

Hosted worker and real-model results must still be observed after deployment. The queue repair does not prove the 120 planning cases passed, 95% model accuracy, real CRUD UAT or physical WhatsApp delivery. Production remains held until those release gates pass.

### Preview scheduler access follow-up

The first hosted callback returned Vercel protection HTTP 401. After the owner explicitly approved a two-hour preview access window, a temporary alias-scoped share token was created. Its Vercel auth cookie is retained only in private worker configuration. A second issue was identified: the new cron path was missing from the machine-to-machine proxy exclusions and was being sent through the cookie-login flow. The proxy now lets this exact route reach its existing constant-time worker-secret verification; production still returns 404.

Migration `20261119104401_agent_evaluation_preview_access` adds private headers and an explicit access expiry. At expiry the cron pauses active runs with a visible reason rather than reporting continued progress. No global Vercel protection setting was disabled. Targeted follow-up checks: 137 tests passed (including expired-access pause and proxy/worker auth); TypeScript passed. Actual queued model results still require hosted observation.

### Hosted worker recovery

Private-cookie server access passed Vercel protection. Actual PostgREST execution then exposed pg_safeupdate enforcement absent from the fixture runtime: the heartbeat UPDATE had no WHERE clause. Migration `20261119105036_agent_evaluation_safe_worker_heartbeat` scopes the heartbeat by its existing value without granting service access to worker secrets. The authenticated hosted worker callback subsequently returned HTTP 200 with the exact deployed revision and processed=0 while the run was paused. Safe stage/error-code diagnostics were added without logging credentials or conversation data. A final real-model run and autonomous cron progress remain required observations.

### Autonomous progress verified

The hosted run advanced from two to four completed real-model PASS cases on the next pg_cron invocation, with no browser start/resume action. Browser reload restored four results from the server. The full suite after access/proxy/heartbeat fixes passed 954 tests across 94 files; TypeScript passed. This is initial progress evidence, not a completed 120-case evaluation.

A final scheduling adjustment uses a UTC calendar-minute bucket (two attempts per minute), avoiding unnecessary skipped cron rounds caused by a rolling 60-second boundary. Expiry remains enforced at the approved two-hour deadline; provider backoff can extend the run beyond that window, in which case it pauses with its saved progress.

## Late-evening recovery and grounding revision — 19 November 2026

The c575e34 baseline stopped at 44 completed cases (23 PASS, 21 FAIL) after model quota throttling and expiry of preview access. The owner explicitly authorized renewing the private Vercel cookie configuration. The same run was resumed, reaching 48 completed cases (24 PASS, 24 FAIL). No result was erased or reclassified as PASS. Empty manually restarted runs remain in history. Migration `20261119135648_agent_evaluation_restore_active_run` makes the default status lookup prefer a resumed active run over a newer empty paused one. Its 128 database tests passed.

For preservation across the next preview deployment, baseline scheduling is pinned to its original immutable deployment. The baseline must not be mixed with results from a changed planner. Temporary automation access remains bounded by its recorded expiry.

Observed failures informed a separate planner revision: operation labels and real field descriptions, explicit denied-operation instructions (never substitute another allowed tool), required internal owner field, bounded field-name enum, missing-value instructions, canonical percentage values and deterministic generation. Grounding drops invented priority/progress/status values and negated old priorities, preserves explicitly confirmed draft values, and keeps an explicit corrected task title ahead of stale contextual flags. An unresolved owner pronoun no longer broadens task resolution. Model tool-schema errors are classified as planning FAIL with bounded validation codes rather than retried as infrastructure outages.

Full software regression: 963 tests passed in 94 files; TypeScript passed; targeted ESLint passed. These are software tests; the changed model prompt still requires actual provider/browser and WhatsApp evaluation. Production remains held. Model weights were not trained, and free-provider availability remains bounded by real quotas.
