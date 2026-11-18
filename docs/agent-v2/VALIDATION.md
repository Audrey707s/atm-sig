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

The preview-only `/agent-evaluation` page runs the fixed 120 synthetic planning cases against the real configured model, paced within the free quota. It never invokes business action tools and therefore is not a substitute for database or physical WhatsApp UAT. PASS/FAIL/REVIEW results are retained in that tab's session; no accuracy figure is asserted in advance. The API checks preview environment, same origin, verified active GM/SA identity and fixed case IDs. It is unavailable in production.

The multi-read SQL fix merges displayed task rows and server-held numeric choices, preventing a selection from pointing into only the final group. Additional SQL regression coverage verifies the selected task.

Latest local suite: 925 tests passed across 91 files; TypeScript, lint and build passed. Subsequent live evaluation is still a release gate.
