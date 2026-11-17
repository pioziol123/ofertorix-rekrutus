# Stage 8: OpenCode as the research agent with gpt-oss:20b — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Beads: `oferty-pracy-334.9`. Product choices approved; live integration is not confirmed to work. Before implementation, check the current code, dependencies and technical gates.

Basis: [Requirements](requirements.md), [cross-cutting requirements](../../requirements.md), [runtime contracts](../../kontrakty-runtime.md). E08-R01–E08-R06 stay stable. The runtime contracts are a shared normative part of this SD, stage 7 and the panel; below are the scope and integration of the stage.

## Approach and boundaries

A dedicated `opencode serve` as a separate local service. The worker uses an adapter in the designed `lib/ai/opencode/`; OpenCode connects to Ollama `gpt-oss:20b` and uses the Chrome DevTools MCP bridge from stage 7. `ResearchExecutor` integrates the result, and the companies module validates and publishes the report. The application does not run its own conversation/tool loop. Profile and assessments use the direct model adapter.

## Baseline state and integration points

Investigated 2026-11-05: [research.ts](../../../../../lib/companies/research.ts) stores commands, UUID operations, cost attempts and the result. `executeCompanyResearch` has a lock per operation; there is no global OpenCode slot and no retry executions with a publication token. Recovery turns an interrupted running into unknown. [worker/index.ts](../../../../../worker/index.ts) handles the queue and recovery. [research-model.ts](../../../../../lib/companies/research-model.ts) owns the schema and validateResearch. These are the existing working files, not only HEAD.

`company_research` has constraints on states and on one active operation per company; do not add new states without an additive migration. Do not create a second company operation to bypass the index: executions and supersedes belong under the same operation. `ai_attempts` stays the cost log; we store the session ID separately.

## E08-D01 — Session API and a durable request log

Headless HTTP chosen, not the CLI, as the target transport. The create/start/inspect/requestAbort/resume/collect adapter implements the section "OpenCode HTTP adapter" of the runtime contracts. We record the creation key and the session ID before the prompt; start/resume have a durable request ID and message ID. A lost response requires inspection, without a blind retry. Check the version and body against `/doc` of the chosen runtime.

SSE is a supporting observation; after the connection drops, we reconcile the specific session and messages. The end of the stream or idle is not a report success. We require a final JSON assigned to the correct message and validateResearch on the evidence of this execution. An invalid response stays recorded as an error; there is no application loop of automatic corrections.

## E08-D02 — One active agent and a durable queue

Because of the computer's resources, a shared global FIFO queue of profile, single assessments and research was confirmed. The slot is assigned to the execution ID, not to a pg-boss delivery. Lease expiry does not free the place. A resuming worker takes over observation of the same session. Unknown, cancelling and an intervention block further starts until the end is positively confirmed and the old browser environment is closed.

An explicit retry immediately revokes publication from the old execution and records a new queued execution; abort is a separate action. The new agent waits for the slot to be freed. This replaces the earlier proposal to start without waiting for the abort. Direct Ollama for profile/assessments uses the same slot. We do not impose quotas on rounds/tokens or a deadline for the whole session.

## E08-D03 — Services, isolation and retention

Ollama and OpenCode are separate local services, started with prepared commands/a script; addresses and server credentials in `.env`. OpenCode has dedicated data/config, without personal repo rules, plugins and accounts. Default permissions are deny; only the stage 7 bridge tools are allowed. The API connection is authenticated, available to the application/worker, with no direct access from the UI. The directory and MCP context are assigned to a specific execution according to the runtime contracts.

We keep session data, conversations, tools, events, evidence and reports indefinitely, without secrets and without destructive rotation. The process version can change without deleting the data volume. The SSE gap stays explicit; we do not pretend to replay if the runtime does not support it. Lack of disk space gives an error, not automatic cleanup.

## Migration and rollout

The records of shared executions/queue/slot/requests are created from stage 5; here the OpenCode session and its link to the existing shared slot are added. Publication under a token is described once in the runtime contracts. Additive migrations; keep the old OpenAI states and snapshots and the domain indexes. Update the canonical company research and operations documents before enabling the new path. Do not redirect pending requests after a `.env` change.

Prepare explicit connection configurations from the web/worker containers to the services on the host, plus durable runtime data and archive. Do not assume that the worker's localhost is the host. The configuration of tools and OpenCode/MCP dependencies has pinned versions. Do not download the model and do not enable the cloud automatically.

## Verification and readiness

| Criterion | Verification plan |
| --- | --- |
| E08-AC01 | Model gpt-oss:20b from GET /api/tags, explicit local provider, no OpenAI and no fallback; OpenCode health/version. |
| E08-AC02 | T01/T02/T03; two workers, two companies, restart and an expired lease; at most one agent and the correct session. |
| E08-AC03 | The final result of the correct message, bad JSON, invented evidence/URL/quote, missing findings; old report available. |
| E08-AC04 | No work quotas, abort versus publication, unknown blocks the queue, retry queued until the confirmed end of the old one; intervention and idempotent resume. |
| E08-AC05 | Attempted shell/files/delegation, a foreign MCP context, an old tool after a slot change; a technical refusal, not only a prompt. |
| E08-AC06 | Zero local cost and unknown usage, archive despite an error, restart/process replacement keep the data. |

Gates T01–T05 are described in the [runtime contract](../../kontrakty-runtime.md). This is a plan of checks, not results that have been produced. Fakes do not prove live operation. We do not require a model quality benchmark. Stage 8 can test commands/intervention without a ready panel UI; the panel integrates these contracts after stages 6/8, before acceptance in 9. For implementing behaviour, use the project workflow implement-with-tester.

## Verification of the grill-me additions

Test E08-AC02/04 with a profile and an assessment pending alongside research: shared slot, no parallel work, also after a lease is lost. E08-AC03 tests a snippet not accepted as evidence and a report with unknowns after an attempt to check the categories. E08-AC06 allows deleting a finished Chrome profile after archiving, but not the session materials. The failure test requires no automatic infrastructure repair; the manual procedure is part of the operator instructions. Sources that require login are skipped; parking sessions is outside the current scope.

## Completion of the execution design — 2026-11-05

Baseline versions and qualification: [334.21](../../kwalifikacja-runtime.md). Headless Chrome in a container and private DevTools keep manual intervention, the session state and the blocking slot. Do not create a new profile after clicking "Wznów" (Resume). Check permissions and channels technically; the official documentation does not prove the isolation of this installation.

Server configuration `AI_RUNTIMES_JSON`: a strict list `{ref:string,version:positiveInteger,endpointRef:string,endpointVersion:positiveInteger,runtimeLockRef:string,dataRoot:string,workspaceRoot:string}`. The ref/version pair is unique; the endpoint points to the versioned registry from stage 5, runtimeLockRef to an approved qualification manifest. dataRoot/workspaceRoot are absolute directories of the dedicated service prepared by the operator, not paths from the UI/model. A missing entry/data/version blocks execution without using the current default runtime. Keep ref/version and the manifest hash in the snapshot; do not update them on retry. HTTP credentials are resolved through credentialEnv on the server side and never get into the prompt or artefacts.

The new `ai_agent_sessions` and event data are created in this stage on the foundation of stages 5/7. directory = a safe subdirectory of workspaceRoot generated from the execution UUID; the creation_key correlation has its own UUID and a technical title, not company data. In the companies module, link company_research.current_execution_id/current_publication_token and ai_attempts.execution_id additively. On a manual retry, we create an execution under the same company operation, without a new company_research that bypasses the pending index. Keep older research and the mapping of report versions. Only validateResearch + publication under the token lock changes the current report.

Do not hold one transaction or one pg-boss delivery for the whole research. The agent orchestrator has a short `advance(executionId)` that performs create/start/inspect/collect with a log; pending/waiting_user schedules further observation of the existing session. Do not extend the synchronous StructuredModel with tools/sessions. Map the collect result to completed/failed/unknown/cancelled and draft/evidence/accounting from the stage 4 research interface. Local accounting has an API cost of zero and separate nullable usage; the absence of a paid search engine does not create a fictional cost. Any future paid tools require a separate design/reservation; they are not enabled in this release.

Requests: write prepared together with the fingerprint and message ID; after commit, check generation, mark sent and make the HTTP call; record the response. The failure window between sent and HTTP is deliberately conservative: reconciliation, not a second start. A lost create is checked with a full list/correlation; ambiguity is unknown. For start/resume, inspection points to a specific recorded message. Do not extract "the last message with JSON" from an arbitrary session. We store SSE with deduplication if it has a stable ID; the absence of replay is a gap visible in the archive, not a fictional continuity.

T02 for the end requires all at once: an assigned final message after the given start/resume with a completed time/state according to /doc, confirmed inactivity of this session, no ongoing bridge calls/interventions and a closed Chrome context. The final report must be one JSON; a separate domain validation can reject it. Idle/an empty status map, an HTTP 200 abort, an SSE drop or a missing session alone is not proof. When the pinned version does not allow the end to be recognised, keep unknown and prepare a manual termination of the dedicated instance with process evidence; do not start further work.

The qualification and adapter tests also check that there is no implicit automatic generation repairing JSON, no transport retry of an inference with an unknown outcome and no input truncation. The physical context parameters must match the snapshot and the actual runtime configuration. Do not guess SDK option names; the qualification result contains the checked settings. If the chosen version does not give the required behaviour, the stage is not finished — fix the integration or come back with a specific discrepancy, without weakening the LA rules.

Minimum tests: create response lost, start 204 lost, duplicate message ID, poll after restart, two workers/lease, abort accepted but still running, pending tool after idle, retry/publication race, lost tab on resume, stale generation/foreign evidence and disabled tools. HTTP/PG fakes prove the application's behaviour; T01/T02/T03/T05 on actual versions prove the protocol. E08-AC01–06 and no quality benchmark stay unchanged. A ready panel is not a dependency of the implementer: the tests use domain commands and bridge interventions, which prevents a cycle.
