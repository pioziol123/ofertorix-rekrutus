# Task management panel — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Beads: `oferty-pracy-334.15`. Scope PZ-01–PZ-08 approved; the implementation has not been carried out. Basis: [Requirements](requirements.md), [runtime contracts](../../kontrakty-runtime.md), the state of the code to be checked before UI changes.

## Boundaries and contract

The panel is part of the current Nuxt app. The application API authorises the command and passes it to the operations module, which uses the executor adapter. The UI does not connect to OpenCode. We do not control raw pg-boss jobs; the list covers AI tasks of profile, assessments and research.

The canonical design of the endpoints, the commandId/executionId/expectedRevision/action/scope/interventionId payload, HTTP statuses, durable intent and deduplication is in the section "Intervention and panel commands" of the [runtime contracts](../../kontrakty-runtime.md). We do not define a second variant of the payload in this file. This is a design of new endpoints, not a description of existing routes.

## State and reading

Mapping per domain, without forcing a new enum on all tables. The view separates the logical disposition, the last observed runtime state with its date, the current result and the adapter capabilities. skipped+running and superseded+unknown are possible. The list and details show the model/provider, errors, group, queue/blocking execution and the command history. Late responses are available with the reason why they were not published.

For direct Ollama, the absence of a remote execution ID means no remote inspection; show this explicitly. check does not start a control generation. Stop tries to interrupt the local connection, but does not declare the server stopped without confirmation. OpenAI Batch keeps its cycle: an item action only revokes that item's publication; remote cancellation of the whole batch requires the corresponding group scope.

## Publication, retry and resumption

The command and intent in a short transaction; HTTP outside the transaction; a separate record of the observation. Publication checks the token and the disposition under the same lock as the commands. An already published result is not withdrawn by stop/skip.

An explicit retry is allowed for running/unknown: publication of the old execution atomically revoked, new ID/token/supersedes and the queue. A new OpenCode agent waits for the confirmed release of the global slot. The old one's response stays recorded, with no effect on the current report. The cost and history of both executions stay independent.

Resume only for a specific pending intervention; it continues the same session and Chrome. A duplicate command does not send a second continuation. Unknown requires inspection, not a new start. We test the intervention against the contract of the operations module/the stage 8 bridge; the UI does not run the agent loop.

## Verification

| Criterion | Scenario |
| --- | --- |
| PZ-01/05 | The logical disposition and the runtime are visible separately, also a failed check, the queue and a blocking skipped+unknown. |
| PZ-02 | check does not create a session/inference; runtime unavailable and direct without remote inspection. |
| PZ-03/04 | Stop/skip before start and during work; late result/cost; the place is not released by the click alone. |
| PZ-06 | Retry of running/unknown: new execution queued, old publication blocked, start only after the slot is released. |
| PZ-07 | 30 items as 20+10, item/group without an action on the whole parent request; actions do not undo completed items, compatibility with old Batch >20. |
| PZ-08 | Duplicate and changed payload, revision conflict, race with publication, duplicate resume and loss of the response. |

Additive migrations, indefinite history. Full integration of the panel depends on stages 6 and 8; earlier mock-ups/the read layer do not mean acceptance of the whole. Stage 8 tests intervention without a ready UI, to avoid a dependency cycle. The panel is required before acceptance in stage 9. No table or endpoint in the design is proof that a migration was run or that the runtime works.

## Panel agreement after grill-me

LA-11 and LA-16–18: the panel is required in the shared deployment of the whole epic. Waiting and the blocking execution ID concern one shared queue of local profile, assessments and research. Stop/check/retry are task control, not service repair; do not add an automatic infrastructure restart or a button that skips runtime uncertainty.

PZ-06 requires a copy of the old input/instructions/schema/model/parameters on a manual retry, even after a change of profile and `.env`. New data requires a new request. A format/evidence/report error is visible and does not start an automatic repair generation. PZ-01/05/08 cover mixed local tasks and a durable resolution after manual handling of a failure according to the instructions. Login and parking of sessions with moving on to further tasks stay in backlog item 281; the current resume concerns only an intervention in public access.

## Execution review — 2026-11-05

The panel specification was prepared for implementation as part of `334.20`, after stages 6/8. The full item/group payload, nullable legacy execution, capabilities, pagination and reading of artefacts have one place: the clarification in the [runtime contracts](../../kontrakty-runtime.md). Do not force a group executionId or direct the UI to the provider API. The domain commands are created in stage 5; the panel integrates them with the old executors and the existing Nuxt authorisation.

Owners of the changes: a new `lib/ai/operations/read.ts` and view adapters per domain; routes `server/api/ai/`; the tasks page in the existing app/pages and the list/details components. The final names of the new files are a local choice; the contracts and the ownership of rules stay fixed. The UI layer refreshes the view after a command and shows the acceptance status and the last runtime observation separately; resending after a lost response uses the same commandId. On 409 it refreshes the state and does not retry with a new ID without the user's decision.

Do not add a bulk "retry all" on the parent command. Group retry skips published items and shows the list of items actually retried/skipped. For a reused item, show the shared request so that the scope of the action is visible. The unknown state of an old superseded execution can block a queued retry and the whole queue; the details give the ID and the instructions for manual resolution. No remote inspection for direct is a capability, not an error repaired with a generation.

Legacy handling is a full part of the task: lazy links and publication guards must be used in profile/ai.ts, matching publication/store/groups and companies/research.ts; blocking the button alone does not protect against a background result. The cost of an old attempt is settled independently of the right to publish. A Batch item action does not interrupt the other elements of the batch. Do not reconstruct a missing old prompt from the current code without a recognised version.

| Criteria | Minimum set of tests |
| --- | --- |
| PZ-01/05 | Read API for legacy and the three new domains, stable cursor, queue/blocking ID, cancelled+running and superseded+unknown, no secrets. |
| PZ-02 | check updates the observation, a failure keeps the date of the previous one; direct does not run generate. |
| PZ-03/04/08 | Two PG connections: command versus publication in both orders, duplicate command and changed target/payload; exactly one revision or no publication. |
| PZ-06/07 | Retry after a change of env/input, group 20+10 without a parent action, completed items skipped, legacy >20 and the Batch part still works. |
| PZ-08 and resume | Invalid interventionId, 409 revision, restart/loss of the response, no second resume/start; 401/404/422 and protection of foreign artefacts. |

Add HTTP/read/commands tests on isolated schemas and a test of the key UI flow; use the existing patterns of the profile HTTP tests. For artefacts, check HTML as text and no traversal, and for history a late result without publication. Check/build and integrations with RUN_INTEGRATION=1 are required; a UI screenshot and the intervention scenario as acceptance evidence, without an LLM content benchmark. No mock-up replaces a race test in the database.

Chrome variant after clarification: headless in a container. During an intervention, the panel provides an authenticated link to the ready DevTools of the relevant tab. This is the owner's channel, with no model access to the administrative CDP and no personal accounts. The qualification and the UI test must show preview/input and "Wznów" (Resume) of the same session; a screenshot alone does not satisfy the intervention.
