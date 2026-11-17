# Stage 6: Local single and group assessments — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 6 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.7`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

Normative scope of behaviour: [Requirements](requirements.md), E06-R01–E06-R06. Baseline state: the local directory as of 2026-11-04, including the existing changes; this is not only HEAD. The designed files below are not a statement about an existing implementation.

## Approach and boundaries

The new local executor uses the MatchingTask/publication of stage 3 and the adapter of stage 5. store.ts/groups.ts choose the route from the snapshot. The worker delivers short units of observation/claim; durable progress is in PostgreSQL. Extend readMatching and the assessment components with local states, without Batch fields for local execution.

## Decision E06-D01 — Durable state of each local assessment

**Technical decision:** One long call for the whole group makes partial success and restart harder. Publication stays shared with Batch, and execution is separate.

Integration points in the current directory: [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/matching/groups.ts](../../../../../lib/matching/groups.ts), [lib/matching/model.ts](../../../../../lib/matching/model.ts), [app/components/OfferMatching.vue](../../../../../app/components/OfferMatching.vue). They show where the change happens, not an obligation to move all of their responsibilities.

## Contracts and invariants

matching_requests keeps ad_revision_id/profile_version_id/input and the operation ID. For local execution, request_payload is null (no OpenAI payload) and no matching_batches is created. The current field is already nullable; do not add an unnecessary migration of this column. Add running and cancelling to the active states and cancelled to the final states; the existing unknown covers an uncertain outcome of execution. Each new state must be included in the relevant partial pending indexes and recovery queries.

Local transitions: queued→running→completed|failed|unknown; queued→cancelled; running→cancelling→cancelled if the stop was confirmed, otherwise unknown. The cost of local inference is always known as zero, regardless of the state. A local unknown with unresolved activity blocks a new assessment for the same ad until it is cleared up, also when the existing pending index did not cover unknown. The safeguard must work atomically in the command and after a lease is lost. claim/lease uses a conditional update and an owner token; publication rejects an old token and the result of a cancelled operation. Do not hold a transaction during HTTP.

A group stores the command_id and members with an unambiguous request ID; local execution does not require a batch identifier. The aggregated state is determined by the table after the review below (in particular unknown takes precedence); separate counters completed/failed/cancelled/unknown/excluded prevent confusing completion with full success. On cancellation, the group accepts no new claims and keeps results already published. unknown must be cleared up before a retried item starts; the manual retry can be recorded earlier.

Confirmed 2026-11-05, batching of new local assessments: at most 20 items per group. A larger command is split automatically in the order of the given offers: 30 → 20 + 10, 40 → 20 + 20, 41 → 20 + 20 + 1. Do not reject the excess and do not send it again on retry. Items and results are still individual; the group size limit does not set concurrency or an inference quota.

Durable contract (details after the review below): a parent request with command_id UUID UNIQUE and an ordered list of unique offerIds; groups have parent_command_id and ordinal with UNIQUE(parent_command_id,ordinal), and members have a fixed request ID. Persist the split and membership atomically before enqueue. Repeating a command_id with the same list returns the same groups; a different list under this ID gives a conflict. The queue carries identifiers, not the full large command. Present the list of parent results and groups with separate state counters. The data schema and API were resolved in the addendum after the review below. Do not rewrite or retroactively split existing groups and active OpenAI batches.

## Migration and rollout

New migrations of states, parent/membership, current tokens and activity indexes; use the lease of the shared module from stage 5; test on old active records. Add the local variant of AC-B1/AC-G4–G7 to the canonical matching requirements/SD, without changing its meaning for Batch. Enable after the local profile, first manually with a few assessments and a group.

## Verification

All the checks below are a plan, not a result that has been produced. Automated tests with fakes do not prove that live services work.

1. Compare validation of the same assessment after Batch/Ollama normalisation.
2. Group integration: success+error+excluded, out-of-order, duplicate command and duplicate result.
3. Restart, lease loss and a cancellation/publication race; old results do not displace current ones.
4. Migration with an active batch, read API/UI of both executors, zero budget locally, splitting a command of 20/21/30/40/41 into groups of up to 20, idempotency of the split.

| Criterion | What verification must show |
| --- | --- |
| E06-AC01 | Check 1 above; observe the outcome stated in the corresponding Requirements criterion. |
| E06-AC02 | Check 2 above; observe the outcome stated in the corresponding Requirements criterion. |
| E06-AC03 | Checks 2–3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E06-AC04 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E06-AC05 | Checks 3–4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E06-AC06 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Readiness and change control

The parent command API and the group state on unknown are defined by the SD addendum of 2026-11-05. The stop strategy and the shared slot come from stage 5. There is no open product decision.

Before coding, refresh the working state and the Beads dependencies. The specification review was done on 2026-11-05; it does not replace test results or control of changes made after the review.

Extension of 2026-11-05: manual check/stop/skip in the [task panel](../../features/panel-zadan/requirements.md). The shared commands and their effect on recovery/publication are defined by the runtime contracts and the SD addendum below.

Exception confirmed 2026-11-05: the ban on starting another execution while running/unknown applies to automatic recovery. An explicit retry in the panel is allowed after the old execution's right to publish has been atomically revoked; abort is an attempt, and a late result stays available for viewing. Canonical contract: [task panel](../../features/panel-zadan/requirements.md).

## Shared slot and manual retry — 2026-11-05

Use `ai_local_queue` and a single `ai_local_slots` from the runtime contracts for all local work, not only OpenCode. The slot is assigned to the execution ID, not to a queue delivery; it is released after the confirmed end of inference. On an uncertain HTTP call, do not repeat generate and do not treat a connection abort as the end of the work on the server. The operator can manually restart Ollama according to the instructions; the application does not trigger a restart. The end confirmation and the slot release must have a durable record.

A manual retry can be recorded before unknown is resolved, but it waits for the slot. Copy the previous snapshot, without the current `.env` or profile; the previous result loses publication and stays in the history. Repair generations after a bad format/quotes do not start automatically. Integration tests cover profiles and assessments competing with a stopped/unknown research, a configuration swap before retry and a response error without a second HTTP call. The OpenAI budget and old snapshots stay compatible. See LA-11, LA-16–18.

## Resolved API and group state — review 2026-11-05

The section below replaces the earlier proposals of the parent contract and the sentences requiring unknown to be resolved before a manual retry is recorded. Recording a retry is allowed immediately; its **start** requires a free shared slot.

The existing `POST /api/matching` takes a strict `{commandId:UUID,offerIds:UUID[]}`. Keep the existing acceptance limit of 1–100 and the rejection of duplicates/invalid IDs; this is a limit of a single HTTP message, not a limit on using Ollama. Split local groups by 20 in the input order, before filtering out excluded/reused. A split of 21/30/40/41 gives 20+1/20+10/20+20/20+20+1 respectively. The new parent has no model execution or slot of its own: executions belong only to individual assessments.

In the command transaction, under a lock on commandId, first look for the ID both in the old matching_groups and in the new command table, **before** reading the current configuration. A duplicate after a `.env` change returns the old result/routing, never new groups. For a local parent, the fingerprint covers the ordered offerIds; a different order is a different payload and gives 409 for the same ID. For historical Batch, keep the existing set comparison. Persist the groups and the queue atomically; a write/enqueue error rolls back the whole new command.

Local HTTP 202 response: `{execution:'direct',commandId,parentId,state,groups:[{groupId,ordinal,state,items:[{requestId,offerId,state,reused}]}],counts}`. The parentId UUID is separate from commandId, ordinal starts at 1. Repeating the command returns the same identifiers and the current progress view. Legacy OpenAI keeps the existing status/body; the client recognises both variants. The new `GET /api/matching/commands/:parentId` reads the same aggregate, with no control actions on the parent. The single `POST /api/offers/:id/matching` keeps its contract and uses one request/execution instead of a fictional group/Batch.

New table `matching_commands`: id UUID PK, command_id UUID UNIQUE, fingerprint, ordered_offer_ids UUID[], immutable configuration JSONB, created_at. New in matching_groups: nullable parent_command_id FK and ordinal with UNIQUE(parent_command_id,ordinal). The command_id of an existing group stays a UUID; for a local subgroup it is a separate, durably generated ID. Do not use the parent commandId in each subgroup (it would violate UNIQUE). A missing parent for legacy is valid. Membership and order are stored in an explicit table `matching_group_members(group_id,ordinal,request_id,offer_id,reused)` with PK(group_id,ordinal), UNIQUE(group_id,offer_id); the existing items JSON stays readable, do not migrate history retroactively.

New local requests add current_execution_id/current_publication_token. request_payload **is already nullable** (migration 1770000000007); locally null and no matching_batches. ai_attempts.execution_id from stage 5 links each manual attempt to its execution; request.attempt_id points to the current attempt, and older ones are kept through the execution. The index of active matching_requests takes into account running/cancelling and local unknown for the current execution; an explicit retry updates the execution of the same request instead of creating a second request that bypasses the index. Reject a new request with new inputs while the current job is uncertain, with an explicit active-work conflict; a manual retry with the old snapshot stays possible.

When accepting a group, keep the existing eligible/excluded/reused rules and the validation of input versions. reused points to an actual existing request, not a new generation. The view shows the shared execution; a group action deduplicates request/execution IDs so it is not triggered twice. Do not change the input of a reused request to the current profile.

The aggregate is computed from the **current** executions of the members and the blocking runtime state:

| Condition, in order of precedence | Group/parent state |
| --- | --- |
| Any member has an unresolved runtime unknown, including an old superseded one holding the slot | unknown |
| No unknown, and there is a runtime running/cancelling/waiting_user or processing has started and items are pending | running |
| There are queued items, but no execution has started | queued |
| No pending/active/uncertain work | completed |

completed means the items are resolved, not that all of them succeeded. Separate counters completed/failed/cancelled/skipped/unknown/excluded/queued/running; the sum covers each item exactly once, according to its current disposition/result. `blockedByExecutionId` points to the actual slot, even when the current retry is queued. A terminal format error after a full done does not block other items. An item's unknown blocks the global start also of the next group, not only a repetition of the same offer. Stop/skip of a group cuts off publication of unfinished members and new claims; it does not remove completed results.

During implementation, extend the canonical matching documents with the local variant of AC-B1/AC-G4–G7 and reading of both HTTP responses. Regressions: `tests/matching-groups.integration.test.ts`, `tests/matching-ratings.integration.test.ts`, `tests/matching-list.integration.test.ts`, `tests/matching-archive.integration.test.ts`. Tests of the new routes can be created separately. E06-AC02/03 must check a duplicate after a configuration change, the split order, a concurrent commandId and two workers. AC05: unknown on different groups, stop/skip/retry against publication; AC06: old Batch >20 and old archive operation IDs. No requirement for a live generation to evaluate quality.

The group migration also adds `revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)` and `dispatch_allowed boolean NOT NULL DEFAULT true`; group commands increase revision, and stop/skip block further claims of unfinished items. Reading aggregates computes the state from the members, without changing revision on each progress step. Recording a group retry and its exact target list are atomic according to the shared contract; completed items are not retried.

For new executions, unknown means an unresolved runtime, not an irreversible end of publication. When a full result of the same request is later confirmed, reconciliation can publish it only under the still current token and disposition=active. Do not treat matching_requests.state=unknown alone as a reason to reject a correctly correlated late response. superseded/cancelled/skipped always stay without publication; a result after a completed publication does not create a second revision. The idempotency rule of old Batch from stage 3 stays compatible for legacy.
