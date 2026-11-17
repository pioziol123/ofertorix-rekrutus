# Local agent execution contracts

Technical design, 2026-11-05. It implements the approved LA-07–LA-21 and PZ-01–PZ-08. It is a shared part of the SDs of stages 7/8 and the panel, not a description of finished code. When it conflicts with older SD proposals, this contract applies; the product requirements remain superior. Beads: `oferty-pracy-334.16`.

## Boundaries and identifiers

| Owner | Responsibility |
| --- | --- |
| Companies module | Research goal, reuse/refresh, validation, the version of the current report and publication. |
| Operations module | User commands, executions, the queue, the global slot, history and the publication block. |
| OpenCode adapter | HTTP, session, messages, observation, abort, collecting the result and accounting. No rules for assessing a company. |
| Browser bridge | Linking the execution to Chrome, allowed tools, saving observations and intervention. It does not hold the conversation with the model. |
| OpenCode | Conversation, choice of tools and synthesis with Ollama `gpt-oss:20b`. |

`operationId` is the existing research UUID. A new `executionId: UUID` identifies one execution; an explicit retry creates another one. `attemptId: UUID` points to a separate cost record, not a session. `commandId: UUID` deduplicates a user command. `sessionId: string` is an opaque OpenCode identifier. Do not convert it to a UUID. A new research execution has its own session and Chrome profile; a direct profile/assessment execution does not have these resources.

The existing `company_research` and its index of one pending operation per company are not a global agent queue. We add executions under the operation instead of creating a second active operation for the same company. The UI groups their history. The operation/execution UUID must not come from a model argument.

## Durable state model

The table names below are a target design to be matched to the current migrations; the meaning and the constraints are the contract.

| Record | Required data and constraints |
| --- | --- |
| Domain operation | For the new path: `current_execution_id UUID NULL` and `current_publication_token UUID NULL`, updated atomically on the first execution/retry. For legacy both are null, and the existing path runs without rewriting history. The current operation state maps from the active execution, never from the late result of a previous one. |
| `ai_executions` | `id UUID PK`, task type and ID, `supersedes UUID NULL`, `configuration JSONB`, `disposition`, `publication_allowed boolean`, `publication_token UUID`, `revision bigint`, `created_at`, `finished_at NULL`. A new retry: a new record and token; the previous one remains. |
| `ai_agent_sessions` | `execution_id UUID PK/FK`, `session_id text UNIQUE NULL`, `creation_key UUID UNIQUE`, `runtime_version text NULL`, `directory text`, `runtime_state`, `observed_at NULL`, `stop_confirmed_at NULL`, `error_code NULL`. Health fills in the version before create; without it we do not start. Before create, session_id=null. |
| `ai_local_queue` | `execution_id UUID UNIQUE/FK`, increasing `queue_sequence bigint UNIQUE`, state `queued/claimed/finished`, dates. FIFO selection by sequence, without relying on a timestamp. |
| `ai_local_slots` | Exactly one row `id='local-ai'`, `execution_id UUID NULL/FK`, `generation bigint`, `lease_owner UUID NULL`, `lease_until NULL`. Only this row entitles local AI work in the installation; it covers direct Ollama and OpenCode. OpenAI is outside this slot. |
| `ai_execution_commands` | `command_id UUID PK`, canonical payload and fingerprint, `execution_id`, `action`, `expected_revision`, state `accepted/applied/failed/unknown`, result and dates. We save the command and the intent in the same transaction. |
| `ai_runtime_requests` | Execution, local request UUID, kind `generate/create/start/resume/abort`, fingerprint, `remote_message_id NULL`, state and response. The uniqueness of the local request protects against a repeated effect after a duplicate delivery. |

`runtime_state` is the application's observation, not a copy of the provider's enums: `not_started/creating/ready/running/waiting_user/cancelling/stopped/finished/unknown`. `finished` means the runtime has ended its work; validation separately decides whether the report succeeded. `disposition=active/cancel_requested/cancelled/skipped/superseded` expresses intent, not actual occupancy. Do not set stopped on the basis of cancelled/skipped.

We do not replace the states of all old tables with a shared enum. The panel read maps old and new records. Migrations are additive; old snapshots and OpenAI Batch remain readable. `ai_attempts` keeps its role as the cost log.

## Queue and global slot

1. On acceptance, save the execution, the immutable configuration and the queue position; a pg-boss delivery is a signal to process the durable state.
2. In a short transaction, lock the slot row, then the oldest eligible position. If the slot is occupied, do not start anything. If it is free, assign the execution ID, increase generation, and save claimed and the lease owner. On a DB error, do not perform HTTP.
3. After commit, start direct Ollama for the profile/single assessment, or prepare the browser environment and the OpenCode session for research. Each mutating worker action checks the current owner and generation. An old worker that has lost the lease does not start new requests. Do not hold an SQL transaction during HTTP or model work.
4. The lease can be taken over to observe the same execution. Lease expiry does not clear the execution ID. The worker that takes over first reconciles the saved requests and the session. Two workers must not initiate create/start/resume at the same time; an uncertain request that was sent remains in the journal, and generation does not undo its effect at the provider.
5. Free the slot only after positive confirmation that the runtime work has ended: for direct Ollama, after receiving the full finished answer or a confirmed end of the request according to the operator procedure; for OpenCode, after the session ends, the bridge calls are closed or resolved, and the Chrome context of that execution has ended. Save the proof of completion and the release in one short transaction. Publication of the result may happen later, with its own lock.

`waiting_user`, `cancelling`, `unknown` and superseded while the runtime is still working occupy the slot. A retry may already be queued, but it does not start. Stop/skip before claim removes the position from the waiting list without starting the model. No priorities, no reordering and no limits on task length. The direct profile and each single Ollama assessment occupy the same slot; OpenAI stays outside it.

A 204 on start, a 200 on abort, SSE silence, a missing key in the status map or server health alone does not confirm that a specific execution has ended. Technical gate T02 below defines the combination of status, messages and finished tools for the pinned version. Uncertainty blocks the queue; the panel shows the blocking execution. We do not offer "free despite uncertainty". The application does not repair infrastructure: it does not restart services or reconfigure the network. Following the instructions, the operator may manually end the dedicated OpenCode/bridge/Chrome, and for an uncertain direct request manually restart Ollama. The procedure must establish that the old process/request has ended and record the resolution of the execution; a healthy API after the restart alone is not enough. A manual restart of Ollama also interrupts the work of other tools that use it. A late result still does not get the right to publish.

## OpenCode HTTP adapter

```ts
type SessionRef = { executionId: string; sessionId: string; directory: string }
type RuntimeObservation = {
  state: 'ready' | 'running' | 'waiting_user' | 'cancelling' |
    'stopped' | 'finished' | 'unknown'
  observedAt: string
  errorCode: string | null
  stopConfirmedAt: string | null
}
```

The adapter offers `create`, `start`, `inspect`, `requestAbort`, `resume`, `collect`. Mutations take a durable request ID; `inspect/collect` only read. The values above are an application contract. Read the exact bodies/enums from `/doc` of the pinned version, not from memory or from SDK examples alone.

| Adapter operation | HTTP mapping |
| --- | --- |
| Health/version | `GET /global/health`. |
| Create | `POST /session` with the creation key correlation in the title; recovery through `GET /session` and verification of the directory/correlation. |
| Start | `POST /session/:id/prompt_async`; persisted message ID, explicit model and dedicated agent. |
| Inspection/result | `GET /session/:id`, `/session/status`, `/session/:id/message` and the specific message. SSE only speeds up observation. |
| Abort | `POST /session/:id/abort`, then inspection. |
| Resume | Resolution of the specific pending intervention in the bridge; if continuing needs a new OpenCode message, a separate record of resume/message ID and reconciliation as for start. |

The [official server documentation](https://opencode.ai/docs/server/) describes the session API, async prompt and abort. This confirms that the operations are available, not that they are exactly-once. The [generated types v1.19.5](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/gen/types.gen.ts) show directory in the request context and an optional messageID; they are a reference point, not approval of this version for deployment.

Create sequence: save creating and the creation key → POST → save the session ID → start. If the response is lost, search for the exact correlation in the full list of sessions of that directory, taking into account the pagination of the pinned version. A single unambiguous result can be attached; zero, many or an incomplete list gives unknown. Do not repeat create just because no result was found.

Before start, save the message ID in the format the runtime requires and the input fingerprint. If the response is lost, check this message and its replies in this session. Do not assume that a repeated POST with the same ID is idempotent; T01 must examine this. No resolution gives unknown, without a new start. Treat resume the same way. After an accepted 204, observe; do not send the prompt a second time.

The final result is the final assistant answer linked to the saved start/resume, after confirmation that the work has ended. Reject reasoning, tool messages, partial fragments and a random last JSON from the history. In the first implementation, the final text is to contain one `researchDraft` JSON; no repair loop in the application. An invalid format ends the execution with an error, keeping the material. `validateResearch` in the Companies module checks the evidence and the report conditions before publication. We do not silently enable automatic repair attempts from the runtime's schema mode.

## Chrome and the MCP bridge

OpenCode remains a permanent separate service, with a durable data directory and its own configuration, without the owner's accounts and plugins. For an execution, the application prepares an empty working directory and a configuration context with the dedicated MCP. All session and MCP calls have the same trusted directory. Before the start we check context isolation in T03. We do not pass the directory from the UI or the prompt.

In the execution context we register a local MCP bridge with an immutable execution ID and a short-lived technical credential. The bridge starts the pinned `chrome-devtools-mcp` over stdio, connecting it through private CDP to headless Chrome in a dedicated container. Chrome has an explicit user-data-dir profile per execution. The user handles intervention through an authenticated, ready-made DevTools with a preview of the same tab. The [qualification](kwalifikacja-runtime.md) defines the network and control channel mechanism. Do not use automatic attaching to a personal Chrome. The profile must survive intervention and resumption of the same execution. After a confirmed end and durable saving of the material, the working profile with cookies/cache can be removed; cleanup must not remove the archive, the OpenCode session data or the profile of an active execution. At the end, release the processes and detach the context, keeping the history/sessions and material. Verify the disposal mechanism and Chrome shutdown in T03.

Chrome DevTools MCP actually performs the browser operations. Our bridge passes on selected tools and saves the results; it does not reimplement Chrome automation. Saving the transcript after completion alone is not enough to assign trustworthy IDs to evidence.

The bridge filters `tools/list` and checks `tools/call`; it does not rely only on hiding tools in the agent configuration. The initial set is navigation/tabs, click, fill, press_key, wait_for and take_snapshot. It takes the detailed schemas from the pinned version. It does not expose upload, arbitrary evaluate_script, console/network/performance, extensions, WebMCP or filePath arguments. It takes screenshots itself on the required events; it does not give the model writes to an arbitrary path. It does not add secrets to results. The other built-in OpenCode tools, delegation and interactive questions are disabled. The additional intervention tool is described below.

Each bridge process has its execution pinned at start; it does not fetch "the current execution ID" on each call. It also checks the slot/generation and the right to use tools. Invalidating the context blocks new calls; old responses that are finishing go only to the old execution. A slot change does not redirect an old tool to a new Chrome. The technical channel for saving the archive to the application is authenticated and is not a web tool of the agent.

The [Chrome MCP configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md) describes its own profile, a visible mode and connection to a browser; the [tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) describes a snapshot based on the accessibility tree, and screenshots. A snapshot is a read fragment, not a guarantee of the full page text. Missing content/a partial read is explicit. The [OpenCode MCP configuration](https://opencode.ai/docs/mcp-servers/) supports a local process with an environment. We disable statistics and CrUX according to the [Chrome MCP README](https://github.com/ChromeDevTools/chrome-devtools-mcp), and we pin the version.

Network verification is separate from tool filtering. The Chrome process gets controlled egress: public HTTP(S), with no private/local addresses, also after DNS, redirects, iframes and in additional resources. A proxy without protection against bypass does not meet LA-09. The allowed administrative connections of OpenCode/Ollama/the bridge do not open these addresses to visited pages. The chosen design is a headless Chrome container with egress enforced by nftables and a controlled proxy, according to the qualification; a test on the target Docker/macOS is gate T04; a prompt or a URL list alone does not replace it.

## Archive and evidence

Each call has a durable identifier within the execution and a fingerprint of the name and arguments. Save the intent before the action, and save the response before passing it to OpenCode. If saving the response fails, it must not be given to the model as trustworthy evidence. We do not blindly replay uncertain actions. A repeated finished call returns the kept result; the same ID with a different payload gives a conflict.

Archive: execution ID, session ID, tool call ID, artefact type, time, SHA-256 and the content/identifier of the durable object. Evidence additionally has a non-negative local integer ID, URL, title, accessedAt, `kind=search_snippet/page`, `readStatus=complete/partial` and the exact text returned to the model. The store assigns the ID atomically, not the model. Uniqueness of `(execution_id, evidence_id)` and immutability of the record; a retry does not inherit the evidence identifiers of the previous execution. The executor passes to the validator only evidence from public pages that this execution read (kind=page), mapped to the existing `ResearchEvidence`; a snippet remains only archive/navigation material. Publication rejects a claim based only on a snippet, even when the quote is verbatim.

A fragment, address or title of a Google result alone is not enough to publish a fact/opinion and does not give page evidence. A search snippet remains a fragment of a Google result and keeps both the results URL and the URL of the source it points to. An opened page creates page evidence only after an actual read; the quote must appear in the saved text. We do not attribute a found snippet to the content of a page that was not read. We do not carry over OpenAI's `citedEvidence(...).slice(0,40)` as a global limit on agent material.

Conversations, events, tools, evidence, reports and diagnostics have indefinite retention. We do not guarantee recovery of lost raw SSE events if the runtime has no replay: the gap must be explicit, we recover messages through the API and tools through our own archive. We do not generate fictional events. Chrome profiles are removable working state that needs local protection; after the end and saving of the material they can be cleaned up, including cookies/cache. We do not export cookies and credentials to the report archive. Lack of disk space is an explicit infrastructure error, not a reason to silently delete history.

## Intervention and panel commands

A block on one page first prompts the agent to try the remaining public sources it found. We skip pages that require an account, without waiting for a sign-in. When public work is still blocked (for example a Google CAPTCHA), the bridge exposes `request_intervention({reason, pageId})` with a closed reason: `consent/captcha/access_block/other`. This is not the OpenCode question tool or consent to new permissions. It saves the intervention ID and a screenshot, or an explicit screenshot error. The call waits for resolution through the panel; it does not start further reads. The session and the slot stay occupied, without an automatic deadline. Page text alone cannot approve an intervention.

| Action | Durable effect | Action outside the transaction |
| --- | --- | --- |
| check | Check command and the latest observation with its date. | Inspection of the existing execution, without create/start. Direct Ollama without an ID has no remote inspection: show this capability as unavailable. |
| stop | Publication withdrawn; cancel_requested, or cancelled before start. | Abort of the specific session, then confirmation of the state. |
| skip | Publication withdrawn, skipped; the rest of the group can logically proceed. | Abort attempt. An occupied agent slot remains until the confirmed end. |
| retry | In the same transaction: old publication_allowed=false and disposition=superseded, new execution/token/supersedes and queued with a copy of the existing input, configuration, instruction version and schema, without reading the new `.env` configuration or a new profile. | Abort attempt on the old one. The new local execution waits for a free slot. |
| resume | In waiting_user, save the resolution of the specific intervention ID and the command; do not change the execution/session ID. | Resolve the existing pending tool, not a new start. Before continuing, confirm that the existing Chrome is available. |

Endpoint design in the existing API: `GET /api/ai/tasks`, `GET /api/ai/tasks/:id`, `POST /api/ai/tasks/:id/commands`, `GET /api/ai/commands/:commandId`. The ID in the panel points to the task/scope; the payload also unambiguously points to the execution ID. POST: `{commandId, executionId, expectedRevision, action, scope:'item'|'group', interventionId?}`. interventionId is required only for resume. A group action expands into a saved list of executable commands for the members. Resume concerns a specific execution with an intervention, not the whole group. No actions on the parent request.

POST returns 202 with the command ID and the saved intent; it does not claim that the runtime has performed the action. An identical commandId/payload returns the existing result. A changed payload or a stale revision: 409 without effect; an invalid scope/action/intervention: 422. The duplicate check comes before the revision check, so that a repeated response does not turn success into a conflict. Everything is under the current authorisation of the private application. GET of the details shows disposition, runtimeState, observedAt, adapter capabilities, the queue/blocking execution ID, the intervention, history and late responses without publication.

In the publication transaction, lock first the operation, then the execution, in the same order as commands. Publish only when the current operation token points to it, publication_allowed=true and disposition=active. Persist the result and the change of the current report atomically. If publication won earlier, stop/skip does not undo it. If retry/stop/skip won, keep the result with the reason it was not published. A late response of the old execution alone does not update the new token.

## Technical gates and hand-off

The following is the implementer's verification work, not new product questions or a model benchmark. The official sources were checked on 2026-11-05; local services and live scenarios were not run as part of this specification.

| Gate | Required evidence | Blocked scope |
| --- | --- | --- |
| T01 | Pinned versions and `/doc`; create/list correlation, message format, lost response on start/resume, handling of a duplicate message ID. Ambiguity must give unknown. | Enabling the live agent; mocks and earlier refactors can be built. |
| T02 | Reliable detection of the end and interruption of direct Ollama and of OpenCode sessions/tools; the shared slot for both paths, worker restart and the manual operator procedure; no automatic service restarts. | Freeing the slot and automatically starting the next live agent. |
| T03 | Configuration/MCP isolation through directory; immutable execution ID context, a new clean Chrome, resumption of the same one, ending processes without removing history. | Live browser tools. |
| T04 | Test of all Chrome traffic in the target environment: DNS/IPv6/redirect/iframe/subresource/WebSocket and attempts to bypass egress. | Public research with untrusted pages. |
| T05 | Evidence archived before being returned to the model, quotes from the right execution, an explicit SSE gap, a partial snapshot, screenshot and intervention, a duplicate resume. | Report publication and acceptance of LA-12/13/15. |

Record the results in Beads for the relevant stages and in a short report of versions/scenarios. Do not mark passed on the basis of documentation. After an error, fix the integration or describe the specific discrepancy; changing the approved rules needs a conversation with the owner. Implementation plan and how the local model enters the work: [hand-off](przekazanie-lokalnemu-modelowi.md).

## Addition after grill-me: profile, assessments and completion rules

The shared queue/slot is created as early as stage 5 for the direct profile; single assessments join in stage 6, and OpenCode in stage 8. Do not create a second slot or a separate agent limiter. A group of up to 20 is up to 20 queue units, not one prompt or a right to 20 parallel generations. The existing per-operation/per-item lock complements the global slot; it does not replace it. Passing a group to the queue keeps the input order; no additional priority. In the current release, a paused intervention also blocks the profile and assessments.

Direct generate saves the intent before HTTP, and the result before publication. Keep the raw direct answer, also one rejected by the validator, as an execution ID artefact available in the history; do not base inspection only on the final proposal/assessment. After an uncertain send, it does not repeat the request; the local API cost is still zero, and runtime_state=unknown occupies the slot. Do not map direct onto an OpenCode session and do not invent a session ID. A new retry can be saved in unknown, but it waits for the confirmed release of the shared slot.

After invalid JSON, quotes, schema or report, the local execution ends with an error and keeps the raw answer. Do not start a new generation automatically, including as a format repair. Safe reads of the state/existing results can be repeated without creating an inference. A retry copies the old snapshot, and new data needs a new request; freshness validation still does not let an old assessment displace an assessment of newer input. A validation error does not prove that the model is busy: after the full end of inference is received, the slot can be freed and other tasks can run.

The research instructions cover the existing categories. Each must be attempted and described with a finding from a page that was read, or with an explicit unknown; missing information does not force endless searching. We do not introduce a limit on rounds/tokens/time. A lack of basis for a correct report ends with an explicit lack of data, without replacing the old report. Public tools receive only the company name, domain, country, position and technologies from the ad; do not pass them the owner's professional profile, experience, preferences or employment history. Build the tool input from the allowed data; do not rely only on instructions in the prompt.

Verification: mixed direct/agent requests in two workers never generate in parallel; an unknown direct execution also blocks research, and a waiting_user research blocks direct. A retry after a change of `.env` and the profile keeps an identical snapshot; an invalid result does not call the model a second time automatically. A snippet does not pass as the source of a claim. Removing the working Chrome profile after the end keeps all durable material, and active/intervention profiles are not cleaned up.

One shared deployment of the epic includes the panel and these rules. Signing in to services and parking sessions while freeing resources to run the next task are out of scope; the future task `oferty-pracy-281` depends on acceptance of this release. Do not implement parking or signing in as part of the current resume.

## Clarification of the shared record after the review — 2026-11-05

This section settles technical details left open in older drafts. Implementation of the shared queue and commands belongs to stage 5; matching integrates it in 6, sessions/the bridge in 7/8, and the panel adds HTTP transport and the UI. Do not create a shared large module that owns domain validators.

### Links, versions and locks

One execution of a profile/single assessment/research has one ai_attempts with `execution_id UUID UNIQUE NULL` FK. One operation can have many executions; historical attempts without an execution_id remain valid. Neither the group nor the parent of an assessment command has a model execution. The fields current_execution_id and current_publication_token are created on the relevant domain record (import/request/research). ai_executions additionally stores the immutable `input_snapshot JSONB`, `instructions text`, `output_schema JSONB`, `prompt_version`, `schema_version`, `result_status NULL|completed|failed`, `error_code NULL`, `runtime_state`, `runtime_observed_at NULL`. The session state is a detailed observation, not a competing owner of the right to publish. A change of the observation, disposition, current execution and permissions increases revision in the same transaction.

Runtime/disposition are separate from the validation result and the cost. The queue can be finished after a failed validation if the end of inference was confirmed. The slot can be occupied after superseded/skipped. The execution's `finished_at` must not pretend to be a confirmed runtime end; that is a separate stop_confirmed_at/proof artefact. A failure to archive the full answer blocks publication. The proof of completion and the raw result must be saved durably; unavailability of the store does not entitle loss of material or a new generation.

Fixed lock order: a group command locks first the group, then all operations in `(task_type,operation_id)` order, then their executions; a single command/publication locks first the operation, then the execution. Short slot transactions do not include domain locks or HTTP; updates that need both phases save a durable intent and finish the phases separately. The dispatcher locks the slot, selects FIFO and checks eligibility; if after the claim a command withdraws publication/permission to start, the worker checks again before HTTP and finishes without a new inference. Do not use the opposite lock order in recovery.

The slot row exists from the migration onwards. `generation` and the request journal prevent new actions by an old worker, but do not undo HTTP that was already sent. When the lease is lost, the result of the same request may be archived as an observation; changes to the current result always check the token and the current execution. Lack of a new lease never means a free slot. For race trials, use two independent PG connections and barriers, not only sequential calls.

### Item/group commands and legacy history

The POST `/api/ai/tasks/:id/commands` contract has two strict variants, which replace the earlier shared requirement of an executionId for a group:

- item: `{commandId:UUID,scope:'item',executionId:UUID,expectedRevision:nonnegativeInteger,action:'check'|'stop'|'skip'|'retry'|'resume',interventionId?:UUID}`;
- group: `{commandId:UUID,scope:'group',expectedRevision:nonnegativeInteger,action:'check'|'stop'|'skip'|'retry'}`; :id points to the group UUID, not the parent command. There is no single group executionId. The server freezes the list of members and the current execution IDs/revisions in the transaction.

For a group, expectedRevision concerns the group revision, which increases on control commands and membership changes, not on each progress step. In the transaction, the server locks the group and the member operations in the fixed order, and saves the current states and the list of executions actually covered by the action. Items finished since the UI was displayed are skipped according to PZ-07, with an explicit reason in the command result. Publishing a single item needs neither a group lock nor a change of its revision, which removes the reverse lock order. The item expectedRevision still protects each execution.

The group command and the child intents are created atomically; a deterministic child command ID or a unique `(parent_command_id,execution_id,action)` protects against a second effect. No members eligible for the action gives 202 with an empty list and the reasons for skipping. Do not start a new retry of finished items through a group action; a separate item retry after success remains new history, without undoing the published result. Stop/skip of a finished item gives a saved no-op `already_published`; it does not undo publication. check on a finished item reads the result. resume needs waiting_user and the exact interventionId; the other actions do not accept interventionId. We check for a duplicate before the revision; the same commandId under a different :id/scope/payload is 409. A missing object is 404, an invalid payload/action is 422, and lack of private access follows the existing authorisation.

ai_execution_commands must contain `target_kind:'item'|'group'`, `target_id UUID`, a nullable execution_id for the group parent and a nullable parent_command_id; do not force an execution for a group. The result has `{commandId,state,targets:[{executionId,status,reason}]}`. accepted/applied means the intent was saved/the local actions were applied; it does not confirm a physical stop. An uncertain remote action has unknown and a history of observations.

The legacy read also covers a missing execution ID. In the panel stage, add a lazy link `ai_legacy_execution_links(task_type,operation_id,attempt_id,execution_id)` with a unique identity key and an FK. Before the first mutating command, under the domain lock, we create an execution that mirrors the existing attempt, without new paid HTTP, without rewriting the historical configuration and without OpenAI occupying the local slot. From then on, all publication/recovery paths of this legacy task also check this guard. A read alone does not create new records.

A legacy retry reconstructs the instructions and the schema only from a recognised, versioned definition that matches the saved attempt, or from the Batch payload archive. If it cannot be reconstructed, the current prompt is not used: capability retry=false, explicit code `snapshot_unavailable`; the user can create a new request. An active old paid call with an unknown outcome must not be sent again automatically. An explicit retry is a new cost attempt that needs the usual OpenAI reservation; a lack of funds does not give the old execution back the right to publish. A remote Batch abort only when the whole scope of the batch belongs to the selected group; item stop/skip withdraws only that item's publication. Old groups >20 remain readable with their own scope; do not split them retroactively.

### Panel read and artefacts

`GET /api/ai/tasks` has the filters type=profile|matching|research, provider, state, groupId and limit, 50 by default, range 1–100, keyset cursor `(created_at,id)`, descending. An invalid cursor/filter is 422. Response `{items,nextCursor}`. Record `{id,type,subject,groupId,parentId,provider,model,disposition,resultStatus,runtimeState,observedAt,error,revision,currentExecutionId,capabilities,queue}`; nullable fields are null, not guessed. queue contains the sequence and blockingExecutionId or null; do not promise a completion time. capabilities are explicit check/stop/skip/retry/resume with allowed and reason. A legacy view without an execution has currentExecutionId=null; a mutating command first fetches/prepares the guard through the server endpoint for command details, not through a model request. For a consistent item payload, add `POST /api/ai/tasks/:id/execution-link` — an idempotent authenticated preparation of the legacy guard, without inference; it returns executionId/revision.

The details add the history of executions/commands, the intervention, late responses and artefact links with pagination by ID. A separate authenticated GET `/api/ai/executions/:executionId/artifacts/:artifactId` checks ownership, does not accept a file path and does not reveal secrets. Display text/HTML without executing it (escaped/plain text), and files as safe attachments; a screenshot image may be rendered. Durable artefacts live in a repository store/volume, with an atomic write, SHA-256 and metadata in PG; not in the removable Chrome profile. For availability after a crash, write the object before the metadata transaction, and confirm completeness with the hash; an orphaned file does not become evidence just by existing.

## Qualification before stages 7/8

The [runtime qualification](kwalifikacja-runtime.md), task `334.21`, delivers a manifest of pinned versions, proof of the headless/intervention channel and network isolation. It is a dependency of stage 7; it does not block the earlier refactors. Base set: Ollama 0.40.14, OpenCode 1.19.5, chrome-devtools-mcp 1.12.0 and Chrome for Testing 157.0.8103.38. They are chosen for verification, not checked locally. Without a positive result, do not enable public research, and do not use latest or a personal Chrome as a workaround.
