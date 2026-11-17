# Stage 5: Ollama gpt-oss:20b and the local profile — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 5 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.6`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

Normative scope of behaviour: [Requirements](requirements.md), E05-R01–E05-R06. Baseline state: the local directory as of 2026-11-04, including the existing changes; this is not only HEAD. The designed files below are not a statement about an existing implementation.

## Approach and boundaries

Add lib/ai/models/ollama.ts implementing the structured model of stage 2. Introduce a versioned configuration in lib/ai/configuration.ts; switching the execution belongs to the coordinator, not to the profile validator. Update .env.example, Compose, README, API/UI readiness and profile recovery. Ollama on the host is the agreed direction for running it; check the connection from the container.

## Decision E05-D01 — A native Ollama adapter and a versioned configuration

**Technical decision:** The OpenAI-compatible protocol is an alternative, but the native API allows explicit handling of Ollama's completion and telemetry. OpenCode is not needed for a single profile proposal.

Integration points in the current directory: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [worker/index.ts](../../../../../worker/index.ts), [.env.example](../../../../../.env.example). They show where the change happens, not an obligation to move all of their responsibilities.

Confirmed 2026-11-05: a separate choice of model and execution per use; [scope of the decision](../../requirements.md#clarification-confirmed-2026-11-05). Server-side configuration in `.env` was confirmed; the exact names and structure are defined by the contract after the review below.

## Contracts and invariants

The exact env and the strict schema for the choice/endpoints are described in the section "Configuration contract after the review" below. Allowed combinations: profile openai/direct or ollama/direct; matching openai/batch (ollama/direct from stage 6); research openai/direct (ollama/agent from stage 8). Unsupported combinations are rejected before data is sent.

The snapshot recorded in configuration additionally contains promptVersion, schemaVersion, runtimeParameters, endpointRef and the model identifier/digest, when available. If the request has a recorded model digest, the worker checks it before execution; a model change under the same tag gives an explicit error instead of silent execution with another version. When the digest is not available, we record null and an explicit absence of such a guarantee in the operation metadata. The endpoint and the secret are resolved through a server-side registry; a change of address under a given endpointRef requires a new version of that entry. A missing old entry blocks execution instead of redirecting the job. Old JSON without version is decoded as legacy, without overwriting it in the database. The OpenAI variant stores the existing prices and limits; Ollama has no price list and no usage quota fields.

POST /api/chat: messages and format from JSON Schema; stream:false to begin with. The adapter normalises the result to the ModelResult of stage 2; the thinking content is not a report. completed requires completion and an acceptable done_reason; the absence of a full result does not publish the proposal. Do not copy maxOutputTokens from the paid configuration to num_predict. The physical window is a recorded runtime parameter. GET /api/tags is used to check that the model is present and to read metadata; it does not prove quality or that the input fits. Handling of overflow belongs to the technical integration contract; we do not run content benchmarks. JSON and evidence control still applies to the actual responses.

The SQL constraint attempt BETWEEN 1 AND 2 concerns the current paid profile policy. Keep it; each manual local execution has a new generation and attempt=1, according to the migration contract below. An invalid format ends the attempt; the absence of charges does not mean automatically looping on an identical error.

A local attempt uses ai_attempts, but the reservation is 0 and it does not check the available paid balance. actual_pln=0 after completion, also with unknown usage; usage=null means no measurement. The runtime/disposition state and the lease belong to ai_executions/the slot; the profile_one_pending_ai index requires the change described below for legacy. Interruption means no publication; a loss of connectivity does not prove that inference stopped on the server. Recovery does not start a second HTTP call when the first one may still be running: it marks the execution as uncertain, and the local cost stays known as zero. An explicit retry records a new attempt immediately; its start waits for the confirmed end of the previous one.

## Migration and rollout

An additive migration of the shared executions/queue/slot and the profile links is required, according to the contract below, without changing old configurations. The web app and the worker get a consistent configuration. The queue must not automatically interrupt the local model after the current 300 s: the lease is renewed, and losing it does not authorise a new inference. Enable only new profiles after checking API/model availability; old OpenAI stays supported. Extend architecture D-05 as an extension.

## Verification

All the checks below are a plan, not a result that has been produced. Automated tests with fakes do not prove that live services work.

1. Test of legacy/v1 configuration, empty env, disallowed combinations and absence of secrets in the snapshot.
2. Ollama fake tests: normalisation, done_reason, missing usage, invalid JSON, refusal/interruption and failures.
3. PG integration: zero local cost with an exceeded budget, configuration change, concurrent claim, duplicate result and cancellation.
4. Worker→Ollama API test: GET /api/tags, empty list/model present/model absent, failure and invalid format; no test generations that evaluate quality. Check technical long runs and interruption on fakes; the user judges result quality in normal use.

| Criterion | What verification must show |
| --- | --- |
| E05-AC01 | Check 1 above; observe the outcome stated in the corresponding Requirements criterion. |
| E05-AC02 | Checks 2, 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E05-AC03 | Checks 1, 3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E05-AC04 | Checks 3–4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E05-AC05 | Checks 2–4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E05-AC06 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Readiness and change control

Configuration, done_reason, overflow and recovery are defined in the SD after the review of 2026-11-05. O-L1 is a technical connection/model test during implementation, not a missing decision before coding. A live test that was not run is not a success.

Before coding, refresh the working state and the Beads dependencies. The specification review was done on 2026-11-05; it does not replace test results or control of changes made after the review.

## Integration sources

Verified 2026-11-04: the [Ollama chat API](https://docs.ollama.com/api/chat) describes the request format and the result; [structured outputs](https://docs.ollama.com/capabilities/structured-outputs) describes passing JSON Schema. Support on the chosen version and model is confirmed only by the pilot.

Update 2026-11-05: we check availability through [GET /api/tags](https://docs.ollama.com/api/tags); the earlier response quality pilot was replaced by the owner's judgement during normal use. Technical tests and validators remain required.

Extension of 2026-11-05: manual check/stop/skip in the [task panel](../../features/panel-zadan/requirements.md). The shared commands and their effect on recovery/publication are defined by the runtime contracts; the panel adds HTTP/UI.

Exception confirmed 2026-11-05: the ban on starting another execution while running/unknown applies to automatic recovery. An explicit retry in the panel is allowed after the old execution's right to publish has been atomically revoked; abort is an attempt, and a late result stays available for viewing. Canonical contract: [task panel](../../features/panel-zadan/requirements.md).

## Shared slot and manual retry — 2026-11-05

Use `ai_local_queue` and a single `ai_local_slots` from the runtime contracts for all local work, not only OpenCode. The slot is assigned to the execution ID, not to a queue delivery; it is released after the confirmed end of inference. On an uncertain HTTP call, do not repeat generate and do not treat a connection abort as the end of the work on the server. The operator can manually restart Ollama according to the instructions; the application does not trigger a restart. The end confirmation and the slot release must have a durable record.

A manual retry can be recorded before unknown is resolved, but it waits for the slot. Copy the previous snapshot, without the current `.env` or profile; the previous result loses publication and stays in the history. Repair generations after a bad format/quotes do not start automatically. Integration tests cover profiles and assessments competing with a stopped/unknown research, a configuration swap before retry and a response error without a second HTTP call. The OpenAI budget and old snapshots stay compatible. See LA-11, LA-16–18.

## Configuration contract after the review — 2026-11-05

The contract below replaces the earlier proposals of names/fields. Three strict JSON env: `AI_PROFILE_EXECUTION_JSON`, `AI_MATCHING_EXECUTION_JSON`, `AI_RESEARCH_EXECUTION_JSON`. Absent (undefined) means legacy *_PRICING_JSON. An empty string, null, unknown fields or an invalid combination mean an error without fallback.

Choice variant v1: `{version:1,provider:'openai'|'ollama',execution:'direct'|'batch'|'agent',model:string,endpointRef:string,endpointVersion:positiveInteger,runtimeParameters:object}`. For OpenAI, runtimeParameters={} and prices/limits come from the corresponding existing *_PRICING_JSON; the model of both configurations must be the same. For Ollama direct, runtimeParameters contains only `{numCtx:positiveInteger}`; there is no maxInputTokens/maxOutputTokens, num_predict or price fields. For Ollama agent, runtimeParameters contains `{numCtx:positiveInteger,runtimeRef:string,runtimeVersion:positiveInteger}`; profile agent and matching agent are not allowed. The stage combinations stay as described above; a path not yet supported gives an explicit error.

The new `AI_ENDPOINTS_JSON` is a strict list `{ref:string,version:positiveInteger,url:string,credentialEnv:string|null}` with a unique (ref,version). An absolute HTTP(S) URL, without password/login/query/fragment; the administrative host network is trusted server configuration, not a UI argument. `credentialEnv` is the name of an env variable; its value never gets into the snapshot. A missing entry or a missing required secret blocks execution. We keep old versions of entries until their requests are finished. For a new URL we create a new version. The adapter factory does not read the current choice for the use instead of the recorded snapshot.

Snapshot v1 adds to the choice: `promptVersion`, `schemaVersion`, the exact `instructions`, `output:{name,schema}`, the immutable input or an FK to its version, `modelDigest:string|null` and `pricing` only for OpenAI (the existing AiConfiguration object). The instruction/schema versions identify the implementation; recording the content protects retry after a code update. JSON without version is decoded as legacy, without updating old rows. An unknown version is an error. This is the storage format of new requests, not a request to modify the owner's `.env` while the documentation is being prepared.

The operator must explicitly provide the initial numCtx; when it is missing, physical resources are not guessed. We check model presence and the digest through tags during preparation and before the claim; retry compares the old digest and does not refresh it. When the digest is really not provided, null means an explicit absence of a model version guarantee, never an automatic choice of another model. Fixed local model: exactly gpt-oss:20b.

## Native HTTP and physical context contract

Baseline version for qualification: Ollama **0.40.14**; this is not a claim about the locally installed version. The [types of the pinned version](https://github.com/ollama/ollama/blob/v0.40.14/api/types.go) define truncate and shift; the [request handling](https://github.com/ollama/ollama/blob/v0.40.14/server/routes.go) distinguishes these options. The chosen integration sends `stream:false`, `truncate:false`, `shift:false`, `options:{num_ctx:numCtx}`, system instructions, user input and `format:output.schema`. It does not trigger an automatic repair or a split of the CV. It does not send num_predict; the adapter does not rely on the default runtime truncation.

Normalisation: `done=true`, `done_reason='stop'`, role assistant and a non-empty message.content give completed. `done=true` with length gives incomplete and a finished runtime; another/empty done_reason does not give success. message.thinking is not content. The counters prompt_eval_count/eval_count independently a safe nonnegative integer or null, responseId=null (do not invent an Ollama ID). A missing done=true or a cut-off/unreadable envelope does not confirm completion; unknown holds the slot. A full received response with done=true proves the end of inference also when the JSON in content fails domain validation.

Mark an input/output overflow error as `context_overflow`, keep the full input and do not publish. The technical test of the chosen version must show a refusal of a too-large context with truncate=false/shift=false, without silent shortening. If the version ignores the options or returns an indistinguishable success after truncation, E05-AC05 is not met and the live path stays disabled. Do not work around this by estimating tokens from the number of characters. This is a protocol test on synthetic data, not a model quality benchmark.

## Executions, migrations and confirming the end

Stage 5 delivers the module `lib/ai/operations/` (queue, slot, log, publication token, shared domain commands) according to the [runtime contracts](../../kontrakty-runtime.md). The panel later adds HTTP/UI; it does not implement the command semantics a second time. Each local proposal has an execution ID and a separate ai_attempts; do not add a parent execution for the queue.

The additive migration is **required**, not optional: the tables ai_executions/local_queue/local_slots/runtime_requests/execution_commands and ai_execution_artifacts (raw direct responses), a nullable `ai_attempts.execution_id UUID UNIQUE` FK and `profile_imports.current_execution_id/current_publication_token`. The local cost record has reserved_pln=0, actual_pln=0, month=null and state=settled after completion, also with unknown usage; the runtime state is held by the execution, not by the cost log. Use a new generation per manual execution and attempt=1, keeping the existing CHECK attempt BETWEEN 1 AND 2 for the paid profile. Do not extend it into an unlimited automatic loop.

Keep the profile_one_pending_ai index for legacy (execution_id IS NULL); control new local executions with a lock on the import record, the current execution and the token; at most one current publishable execution. An old superseded+unknown can still occupy the slot while a new retry is already queued. A manual retry does not create an index conflict, because we explicitly distinguish legacy from execution. Check the constraints and recovery of all consumers, not only CREATE TABLE. Do not change the content of old configurations and costs.

Before sending, record the request ID and the intent, then HTTP outside SQL. An uncertain send is never repeated by recovery. Only the owner renews the lease; losing the lease does not clear the slot. Writing the raw response/telemetry is durable before publication. An old worker can deliver the result to the archive of its request ID, but does not make a new HTTP call or publish after losing its authorisation.

For an unresolved inference, the operator procedure: pause the dispatch of new work, note the blocking execution/request and the identity of the Ollama process/instance, manually terminate the old instance, check that its process is gone and keep the termination confirmation and time. The application's administrative command takes `{executionId,expectedRevision,runtimeInstance,reason,evidence}` and records the resolution under the slot lock; this is not a "release despite uncertainty" button. A new health check or an empty model list alone is not proof of the end. Lack of a reliable identity of the old instance blocks the resolution. A new instance can only be created manually; the application does not restart it. No change to the publication rules for a late result.

Supplementary verification: migration test on legacy queued/unknown, two workers and three types of artificial local jobs, lease expired during HTTP, crash after sending/before writing, cancelled/superseded with a blocking slot, more than two **manual** generations without changing the paid policy. The queue layer can be tested with fakes of future assessments/agent before they are implemented. Run the connection/tags and context test from the worker; record the result and the actual version in Beads. By default the new path stays not enabled for the shared acceptance.

The local adapter extends the set of safe error codes with model_unavailable and context_overflow; it does not extract them from an arbitrary exception message. An unconfirmed response format does not prove the end of the runtime. Connection/read timeout settings must not establish a fixed deadline for the whole inference; the HTTP client must handle long silent generations without automatic retry. Run the test exceeding the current 300 s queue delivery with a fake clock/server, not an LLM benchmark.
