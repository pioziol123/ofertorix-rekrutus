# Triage and match assessment — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-03/AC-03, R-12/AC-12, R-13/AC-13, R-14/AC-14.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Data ownership and contracts

| Entity / group | Relevant fields and invariants |
| --- | --- |
| Assessment / RatingRevision | Profile version, the full set of ad versions and selected data, model/prompt/schema version, components/justifications, weights and the result, author `ai/owner/system`. Freshness and the pointer to the current assessment are separate from the history. |

## Qualification and input

SD proposal: before triage we check the must-have requirements locally on versioned data. The result is a confirmed match, a confirmed conflict or an unknown, with evidence. A conflict excludes the offer from automatic assessment, but does not remove the record and does not set the owner's own decision. Triage uses only the input versions of the profile and the ads; the shared adapter gives it no web access.

## Conflicting variants

**Confirmed after the Q7–Q8 correction:** a variant that meets the requirement makes that criterion count as met. The result keeps the identifiers of all variants and evidence, a pointer to the variant that is the basis of the match, and a discrepancy marker. We do not turn the discrepancy into `unknown` and do not block the offer only because the second variant does not match. Meeting the criterion is not a confirmation that the more favourable variant is the only true information.

We do not combine unrelated variants into an invented package of conditions, and we do not skip other must-have requirements. The rule applies to variants of the same criterion; interpreting several interdependent packages requires examples during further clarification.

## Calculation and freshness

**Confirmed Q6:** completeness is weighted by the importance of the assessable criteria; full technologies 40% and experience 25%, with the rest unknown, give 65%. The rating takes only the assessable part into account. Q9 confirms taking partial completeness within a component into account; knowing some of the conditions does not mean knowing all of them. The details of the technical representation of criteria and internal weights below remain an SD proposal for review.

**Technical proposal for the calculator, consistent with Q6 and Q9:** each component has a list of explicit criteria; unknown ones have no assessment. The component rating is the average of the assessments of its assessable criteria. The overall rating is the sum of `weight × component rating` divided by the sum of the weights of the assessable components. Completeness is the weighted proportion of assessable criteria to all explicitly defined criteria of the components. An empty component does not give 100% completeness; a total basis of zero gives `rating=null`. Before implementation, review the exact formula, the criterion units and the internal weights: a change in the number of criteria or a partially recognised component affects the meaning of the result.

A manual assessment creates a revision; it does not modify the history or the AI components without a trace. A new AI assessment can become current despite a manual predecessor. Changing the weights alone creates a new calculation with the same AI results and a weights version. Company research does not silently update triage.

## Pay comparison

**Confirmed Q10:** it is enough for the expected minimum to be reachable within part of a comparable salary range; the pay is not guaranteed by that. The criteria and examples are maintained in R-13, not as a separate view filter rule.

SD proposal: for a known upper bound and a comparable unit we check `upper >= expected_minimum`. If the lower bound is below the minimum, we also return a partial coverage marker; with an unknown lower bound we show that this information is missing instead of guessing the coverage. A missing upper bound requires assessing the known data: a lower bound at least equal to the minimum confirms the criterion is met, while a lower bound below the minimum without an upper bound is not enough to confirm it. Variants tied to different contracts are assessed as whole variants, without combining the amount of one with the contract of another.

## Hand-off to research

After the assessment is completed we check the configurable rating and completeness thresholds and the separate must-have result. The output is a qualification, not a second company profile. The research module itself decides whether to reuse an existing report. A change of result does not update the own decision or the application.


## Commands

Logical names, not frozen endpoints. Shared validation/version/response contract: [architecture](../../architecture.md#shared-command-contract).

| Command | Input and effect |
| --- | --- |
| ReassessOffer | Offer id, profile and data version; a request, an update/waiting state while keeping the old result. |

## Integration with other features

[profile](../profil/requirements.md), [offers](../oferty/requirements.md), [operations](../operacje/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Control criteria with unknowns and a must-have conflict; a repeatable calculator, a weight change without the API, a manual assessment replaced by AI, a late result for an old profile. Check the number of calls and the freshness. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-02, O-05, O-06 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.

## Design of the on-demand stage — 2026-11-03

Confirmed: equal weights of criteria within a group. The groups keep 40/25/20/15. Calculator: the average of known assessments in a group; the overall rating is the average of these groups weighted by their weights; completeness is the sum of the products of the group weight and the share of known criteria. An empty group has 0% completeness. Criteria that are explicitly indifferent in the profile are skipped. Unfilled expectations stay unknown. A technology absent from the profile is not assessed as a lack. More technology criteria do not change the total weight of the group.

Implementation of the stage: `lib/matching/model.ts` (criteria, calculator, evidence), `batch.ts` (bounded OpenAI transport), `store.ts` (durable run). The new tables `matching_requests` and `matching_batches` reference immutable profile/ad versions. `ai_attempts` gains the ability to hold an independent matching operation without import_id; the existing CV handling limits its queries to operation_type=profile. The reservation still locks the month row, which serialises the spending of both features. The `AI_MATCHING_PRICING_JSON` configuration uses the same unit contract as the CV, but contains Batch rates, without guessing half the price.

Before the network call we save upload/submitting; if the batch creation response is lost we mark it unknown and do not send again. No automatic retry of creation is a deliberate cost to availability, given there is no exactly-once guarantee. The user sees diagnostic identifiers; a retry is an explicit new request. A pg-boss recovery pool reads known batches every minute (without the worker waiting for 24h) and recreates a missing delivery. An advisory lock per request prevents concurrent receipt. A partial result of a terminal batch is mapped by custom_id and validated independently of the batch state; unknown/duplicated IDs are a contract error. Missing usage or an ambiguous error leaves the cost unknown.

The transport has a fixed host api.openai.com, no redirect/retry, a time limit of 60 s and a response limit of 8 MiB. JSONL has a limit of 2 MiB/100 requests. We pass only the professional data of the profile, without CV sources, skill identifiers and contacts, and the projected content of the offer; no raw CV file and no web tools. store=false in Responses. Input files expire after 48h, output files after 7 days; cleanup after receipt tolerates 404 and is retried in the background. The provider's limits were verified in the [Batch guide](https://developers.openai.com/api/docs/guides/batch), [create batch](https://developers.openai.com/api/reference/resources/batches/methods/create) and [upload file](https://developers.openai.com/api/reference/resources/files/methods/create) on 2026-11-03.

Verification of AC-B1–B6: synthetic inputs and a substituted transport, PostgreSQL in an isolated schema, a check that there is no double sending/reservation, restart/unknown, partial responses, loss of freshness. A paid trial is not part of the offline acceptance.

Implementation clarification: we save the full Responses request in request_payload before the queue, together with prompt_version=matching-v1 and schema_version=1. A change in the instruction code no longer changes pending requests. Cost statuses are maintained by the shared ledger; the file for an unknown batch creation stays until it expires after 48h, because deleting it could interrupt active work. Invalid JSONL/identifiers or a lost terminal result file end the request with an error, keeping the cost unknown; transient download errors are resumed.

Local configuration 2026-11-03: the same model as the CV, gpt-6-luna, explicit conservative Batch rates of 0.10 USD/1M input and 0.375 USD/1M output, a buffer exchange rate of 5 PLN/USD, a limit of 200000 bytes of input and 6000 tokens of output. This is an upper estimate, not a measured cost. The [model and long context thresholds](https://developers.openai.com/api/docs/models/gpt-6-luna) confirm the standard 0.10/0.50 USD, higher rates above 272K and 50% for Batch. The configuration keeps a buffer relative to shorter inputs. No paid trial was made.

## Acceptance of the on-demand stage — 2026-11-03

Implemented AC-B1–B6: tables and migrations 6/7, the transport, versioning of the exact request, the shared budget, the queue, reading and history in the details. Tester: 64 tests of the new area (34 model, 17 transport, 13 PostgreSQL) PASS. The whole pnpm check: 306 tests PASS, 99 integration tests skipped by default; separately the profile regressions 27 and offers 4 and the final 13 matching tests were run, PASS. Build PASS. Locally the migrations were applied, the worker is healthy, the UI shows an active button and a reservation of 0.11125 PLN. In the real database 0 matching requests: no paid trial was made; the response quality of the chosen model has not yet been confirmed on a real offer.

The further scope is tracked separately: 8kt.2 (listing and bulk batches), 8kt.3 (manual assessments and weight changes). Do not consider the whole R-03/R-12–R-14 feature completed by this stage. Recognising free-text must-have requirements still requires a manual check.

## Design of the 8kt.2 extension — 2026-11-03

`matching_groups` owns the shared run and the remote files; `matching_requests.group_id` links the items. The existing `matching_batches` and the single path remain compatible. The new queue `offer-matching-group` handles a per-group lock and recovery every minute. Single recovery does not handle group items; the history reads the batch identifier from the shared run.

The command POST /api/matching contains offerIds (UUID[], 1–100, no duplicates) and commandId (UUID). Saves in one transaction, a command lock and offer locks in ID order; a repeated commandId with a different list is a conflict. Each new item uses the existing preparation of input versions; we do not duplicate pending items. The shared batch covers only new, locally admitted items. At most 2 MiB of JSONL; a group that is too large is rejected before commit, without silently splitting or skipping offers.

The shared reservation uses the existing serialised ledger and a savepoint: either all new items get a reservation and the queued state, or the reservation is rolled back and waiting_budget is set. Each has its own month, configuration and amount. After upload and before create we durably save the state of the group and its members. An unknown creation does not trigger a retry. Terminal results are downloaded once per read; each unsettled member gets independent validation, settlement and a result in a transaction. A restart may download the file again, but skips completed members. Cleanup only after all members reach a terminal state; it does not touch the data of an uncertain active batch.

Reading the list decorates the existing readOffers with one query for the latest requests and the latest successful assessments. We do not add a dependency of the base projection on the AI tables, so the existing adapters and the reader stay independent. We extend Filters with rating/completeness/components and state. Parameters 0–100, no value disables the filter, no assessment is not zero. The frontend keeps selections explicitly and sends a concrete list of IDs; the commandId stays the same after a network error until the selection changes or acceptance is confirmed.

Verification: extended filter tests and isolated PostgreSQL tests of grouping, command/offer deduplication, the atomic budget, different results within one batch and resuming receipt. No paid trials; we keep the tests of the single path and the CV.

### Acceptance of 8kt.2

Implemented AC-G1–G7: reading assessments on the list, freshness and components, filters 0–100 and sorting, selecting up to 100 offers with a cost preview, idempotent groups and separate settlements. Migration 8 applied locally, the queue registered and the worker restarted. Tests: 318 default PASS; separately PostgreSQL tests: 11 groups, 13 single assessments, 6 list, 27 profile, 4 offers PASS. Type check/lint/build PASS. Command and offer UUIDs are normalised to lower case before comparison; a test confirms idempotency and the rejection of duplicates regardless of case.

In the UI the following were checked: selecting 20 offers on page 1, keeping the selection on page 2 and extending it to 40, a correct preview of 4.45 PLN, clearing the selection after a filter change, and the rating filter without pay currency/period. API: sorting 200, threshold 0 excludes no assessment, invalid threshold 400, foreign Origin 403, invalid selection 422. No real analyses were sent; in the database 0 groups and 0 requests. The acceptance checks the flow on substituted responses, with no evidence of the model's quality on a real offer.

While testing the data limit, the complexity of the e-mail redaction regex for long strings without separators was also fixed; the synthetic regression of 200000 characters and 50 profile tests PASS. What still remains is 8kt.3 (manual assessments and weight changes), and free-text must-have requirements need checking by the owner.

## Design of 8kt.3 — 2026-11-03

`matching_rating_revisions` owns the result history, independent of the history of AI requests. A revision contains the result, the calculation, an input snapshot, the profile/ad/weights versions, the author of the operation and the author of the assessment itself (`assessment_author`, kept on a system recalculation). `matching_rating_heads` points to the current revision per ad. Each successful AI completion publishes at most one revision per request_id; an old response is archived without promotion when a current assessment for the current inputs exists. The AI author can replace a manual result for the same current inputs.

`matching_weight_versions` and the singleton `matching_weight_head` store the global percentages. New publications/manual assessments/weight changes are serialised by a shared transactional advisory lock. Recalculation creates system revisions of the current heads, copies the result without changing the content and points to the predecessor and to the version it is based on. The calculator accepts an explicit weights object; the history does not depend on the current setting. Migration 9 copies existing completed assessments, preferring the result for the current input when choosing the head.

The POST for a manual assessment contains commandId, expectedRevisionId (null only when there is no head), profileVersionId, adRevisionId, assessment and reason. A repeated commandId with different content is a conflict. The server checks the versions and the full set of criteria, and does not accept unknown IDs or a numeric assessment with the unknown state. A separate owner validator allows assessing an unknown with the owner's own justification without AI quotes; supplied quotes must still occur in the snapshots. This is not a loophole in validating the model's response. An empty form is based on the current versions; an old assessment does not automatically fill in changed criteria.

The weights POST contains commandId, expectedVersionId and four percentages. Sum 100, zero allowed. In one transaction the version and the recalculated heads are created; errors roll back everything. A concurrent edit gets 409. None of the commands uses the Batch transport, the queue or the cost ledger.

Verification: a unit tester of the calculator and isolated PostgreSQL; a manual assessment without AI, conflict and idempotency, unknown/null, recalculation and old weights, AI returning after a manual correction, an old input not displacing the current result, consistency of the list with the details and no new attempts/reservations.

### Verification of the manual assessments stage — 2026-11-04

Deployed migration 9 and the forms for the owner's own assessment and the global weights. The list and the details read the shared head of the assessment history. Safe retrying also covers saving identical weights (separate command confirmations, no new weights version). The form is not reset when an AI result arrives; a stale save requires explicitly loading the data.

Validation: `pnpm check` (323 tests), 77 isolated integration tests of matching/profile/offers, `pnpm build`; the tester additionally confirmed 102 tests of the whole matching area. In the browser the following were checked: a weights sum of 101% blocking the save, loading the current weights and the own assessment form. No fictitious assessment was saved in the user's data and no new AI analyses were sent.

20 earlier batch upload errors were found in the database. A separate task `oferty-pracy-5t4` covers diagnosing the transport and keeping a safe error code; those requests were not retried.
