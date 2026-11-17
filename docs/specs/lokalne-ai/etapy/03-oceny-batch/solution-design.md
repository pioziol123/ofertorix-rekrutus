# Stage 3: Assessments separated from OpenAI Batch — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 3 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.4`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

Normative scope of behaviour: [Requirements](requirements.md), E03-R01–E03-R05. Baseline state: the local directory as of 2026-11-04, including the existing changes; this is not only HEAD. The designed files below are not a statement about an existing implementation.

## Approach and boundaries

Extract lib/matching/task.ts for the instructions/schema and the neutral task, and lib/matching/publication.ts for validation/publication. BatchClient and its archive stay in the OpenAI adapter; store.ts/groups.ts coordinate the existing cycle and commands. A domain group is not the same as a provider file or batch.

## Decision E03-D01 — A separate assessment task and a Batch adapter

**Technical decision:** Moving the whole store to the shared AI module would lose the domain rules. Emulating Batch for the future Ollama is not needed; we keep the protocol only for its actual provider.

Integration points in the current directory: [lib/matching/batch.ts](../../../../../lib/matching/batch.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/archive.ts](../../../../../lib/matching/archive.ts). They show where the change happens, not an obligation to move all of their responsibilities.

## Contracts and invariants

MatchingTask has the contract defined in the review section below, with a schema derived from assessmentSchema. Reading the input versions from matching_requests stays authoritative; do not reconstruct data from the current profile during collection.

The Batch adapter translates the task into the current line {custom_id,method:'POST',url:'/v1/responses',body}. Keep the existing paid Batch constraints, identifiers, files and archive control. A collected line goes through the neutral result normalisation from the review section, which also covers charge and errorCode; the domain checks the schema and the evidence.

Publication locks the request record and atomically writes its result, the assessment revision and the settlement. For a terminal request it returns the already recorded result without another revision. applyMatchingLine stays a compatibility facade until all consumers move to the extracted function. Do not change the currency rules or the manual history.

In this stage, matching_batches is still created as it is now, also for a single assessment. Splitting the code does not yet introduce nullable payloads or a new state machine.

## Migration and rollout

No migration of states or records. The existing waiting_budget/queued/uploading/submitting/submitted and the final states keep their meaning. Recovery and cleanup also cover old records and the current uncommitted archive.

## Verification

All the checks below are a plan, not a result that has been produced. Automated tests with fakes do not prove that live services work.

1. Test of the instructions/schema and of Batch line compatibility, without duplicating tests of simple delegations.
2. Integration: out-of-order, partial errors, duplicate custom_id and repeated delivery.
3. Failures after upload, before/after create, collection of older inputs.
4. Regressions of atomic group budget and archive, access control, cleanup.

| Criterion | What verification must show |
| --- | --- |
| E03-AC01 | Check 1 above; observe the outcome stated in the corresponding Requirements criterion. |
| E03-AC02 | Checks 1, 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E03-AC03 | Checks 2, 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E03-AC04 | Checks 2–3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E03-AC05 | Check 3 above; observe the outcome stated in the corresponding Requirements criterion. |

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Readiness and change control

The current applyMatchingLine, BatchClient, groups and archive were reviewed. The local variant of criteria AC-B1/AC-G4–G7 is created in stage 6; in this stage they do not change meaning. There is no unresolved product decision.

## Contract review — 2026-11-05

Observed: `batchRequest` owns the instructions/schema and the paid size control; `applyMatchingLine` in store.ts combines provider normalisation, validateAssessment, calculate, publishAiRating and settle. Groups call the same function, but own their batch and cleanup. Keep both paths.

`MatchingTask` is an immutable snapshot `{requestId,input,promptVersion,schemaVersion,instructions,output:{name,schema}}`; input has the existing MatchingInput, versions are non-empty, requestId is a UUID. No transport configuration or price list. Batch translates this into the existing custom_id and body. The `assessmentSchema` schema and the instruction text stay owned by matching. The limits on file/200 criteria/paid payload size stay a Batch control, not one for the future Ollama.

Neutral result: `{requestId,outcome:'completed'|'refused'|'incomplete'|'error',text:string|null,usage:{inputTokens:number|null,outputTokens:number|null},responseId:string|null,charge:'metered'|'zero'|'unknown',errorCode:string|null}`. completed contains one content for JSON.parse in the domain. The adapter does not return BatchLine or Batch to publication. `zero` only for the confirmed existing no-charge rule: a failed batch with no files and no line, or batch_expired. A missing line in other circumstances means unknown, never a default zero. metered means usage must be checked against the snapshot, not a cost computed independently.

`publishMatchingResult(client,requestId,result)` locks matching_requests with FOR UPDATE and reads the current state again. For a terminal record it returns the recorded result, without a second settle/revision. Under this lock it checks the currency of the recorded ad_revision_id/profile_version_id according to the existing publishAiRating rule, validates the assessment and writes the cost, history and state in one transaction. If an old result cannot be current, it stays as history; do not swap the input for the current profile. Do not hold SQL during HTTP. The applyMatchingLine facade normalises the existing arguments and delegates; it is not a second place for publication rules.

BatchClient.results still rejects foreign and repeated custom_id; it does not pick an arbitrary line from a duplicate. The raw archive is created before interpretation and keeps the existing operation ID `group_id ?? request.id`. Group state completed means the results were collected, not that all items succeeded; the per-item counters are authoritative. Do not add a parent group execution or execution tables in this refactor.

Regressions: `tests/matching-batch.test.ts`, `tests/matching.integration.test.ts`, `tests/matching-groups.integration.test.ts` and the existing archive tests. E03-AC01: task and validators; AC02: cycle/archive/cleanup; AC03: out-of-order, item errors and funding; AC04: concurrent repetition of a result under the lock, and old inputs; AC05: loss of the create response without another POST. Run check/build and the integrations according to the hand-off; this is a test plan, not their result.

Before coding, refresh the working state and the Beads dependencies. The specification review was done on 2026-11-05; it does not replace test results or control of changes made after the review.

For old pending requests, the recorded request_payload is authoritative; the refactor does not regenerate it from the current instructions/schema. We build the MatchingTask of new requests in the domain, and the adapter translates it into the persisted Batch payload. Reading/cleanup of old artefacts keeps the existing schemas and identifiers. Do not add a migration only to get a new type name in the database.
