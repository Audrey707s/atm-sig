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
