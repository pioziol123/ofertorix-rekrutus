# Background operations and cost control — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-24/AC-24, R-25/AC-25, R-26/AC-26, R-29/AC-29.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Data ownership and contracts

| Entity / group | Relevant fields and invariants |
| --- | --- |
| Operation / Attempt | Type, target, input versions, trigger `manual/automatic`, state, checkpoint, dedup key, generation, attempts and error. This is the durable source of status, not a pg-boss job record. |
| BudgetMonth / Reservation / Usage | Month, limit, reservations and spending; each paid attempt linked to the model, price list version, limit, usage, currency/conversion rate and the provider's identifier. |

## Execution and transactions

Proposed states of a durable operation: `queued`, `running`, `waiting_budget`, `needs_attention`, `succeeded`, `superseded`. An attempt has a separate execution state and a settlement state `reserved/settled/unknown/released`. Substantive success can coexist with a cost still to be clarified; we do not pretend that everything is one status.

The dedup key contains the type of work, the target and the input versions. For an on-demand refresh it contains an additional generation, so that an explicit new execution is not blocked as an old duplicate. The retry button of an existing operation continues its checkpoint; it does not pretend to be a new independent process.

1. In a transaction, save the mutation, the history event, the operation and the pg-boss job with the operation identifier. The queue's SQL integration must use the same connection and transaction; if that is not ensured, the sending must not be described as atomic. An alternative for a separate review: transactional outbox.
2. The worker locks/claims the operation and the generation. If it is already completed or stale, it ends the technical job without a repeated effect.
3. Before a paid stage, a short transaction locks the budget record, checks the limit and creates a reservation for the attempt. Then commit.
4. The network call outside the transaction. Save the request/response id, limits and usage without secrets; do not assume that a request id proves there was no second charge.
5. Save the result and the settlement atomically with the checkpoint. Update the pointer to the current result conditionally, only if the generation and the input versions are still correct. An old result may remain historical, but it does not replace the new one.
6. If a worker is lost, check the checkpoint and the attempt state. After an uncertain call do not release the reservation; a retry requires separate funds. A failure after receiving the response but before the durable save may require a retry and a repeated charge — there is no exactly-once guarantee for AI.

The currently checked [pg-boss documentation](https://pgboss.io/introduction) describes a long-lived instance per process and its own schema. The [jobs options](https://pgboss.io/api/jobs), read on 2026-10-31, have two retries by default and the heartbeat turned off; this does not automatically match the application's contract. We do not rely on the default settings.

SD proposal: retries of paid stages are controlled by the durable operation (at most one additional automatic attempt after a transient error); a technical redelivery does not reset the counter. The active heartbeat and expiry are explicit. Pending application operations recreate missing queue jobs, so pg-boss retention cannot silently lose work waiting for budget. A retry after 429/5xx/timeout applies a delay and the provider's information; authorisation/configuration errors require attention. There is no endless JSON repair.

**Priority:** a shared queue of paid stages with manual priority higher than automatic research. Work without funds does not occupy the executor; it resumes after a month/limit change event. A new manual operation does not interrupt a long active one. The priority rule is checked when the next job is fetched, not only in order of creation.

## Budget and limits

The cost log stores the price list in force at the attempt and the PLN conversion rate adopted. This is the application's accounting, not a guarantee that it matches the invoice, taxes or other use of the account.

The reservation must cover the determined upper bound of the given attempt: input, output, tools and any separate formatting. A prompt saying "do not exceed" is not a control. If the API gives no technical limit on a given cost, that variant of the paid stage is not ready to be enabled. Before launch, set the limits on tokens, sources, search and rounds and how they are enforced, not only an estimate of the average.

`available = limit - settled spending - active reservations` for the agreed month, with concurrency control. The surplus of a reservation is released after a reliable settlement. An unknown cost stays active; the panel must allow clarifying it based on the provider's data. A limit change has a history. **Confirmed Q13:** an attempt has an unchangeable reservation month. Completing it or clarifying its cost later updates that month; a new attempt in the following month has its own reservation. Old reservations do not carry over as new spending into the current limit, but remain visible as unsettled historical commitments. SD proposal: Reservation and Usage point to an explicit budget_month_id, and the settlement does not recompute the month from the completion time. A month change creates a new limit record and does not reset the old log. The conversion rate and price list saved with an attempt stay versioned; choosing their values is a technical part of the O-04/O-06 review.

## Operations summary

SD proposal: the operations view uses Operation/Attempt, and the summary uses reads of saved results, new offers and application dates. A link to an event leads to the right offer/company/report. An error in a later stage does not remove earlier results; a manual RetryOperation starts from the durable checkpoint with a repeated cost check.


## Commands

Logical names, not frozen endpoints. Shared validation/version/response contract: [architecture](../../architecture.md#shared-command-contract).

| Command | Input and effect |
| --- | --- |
| ChangeBudget / RetryOperation | Limit or operation id, expected version; history and a repeated budget check. |

## Integration with other features

[launch](../uruchomienie/requirements.md). This module provides execution status, reservations and retries to the other features; private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Concurrent reservations, a timeout after a paid request was accepted, the month boundary, two transient errors, manual priority, a kill before/after commit and queue retention. Check the attempt counter, the costs and that effects are not duplicated. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-04, O-06 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.

## First consumer of paid operations: profile — 2026-11-01

The [profile](../profil/solution-design.md#cost-and-launching-a-paid-attempt) design needs a minimal implementation of the shared Operation/Attempt and reservation contracts before preparing the AI proposal. It does not create a separate budget. Before this adapter is enabled, the following are required: atomic reservation, real usage, the unknown-cost state, an unchangeable month and a new reservation for a retry. The detailed limit values for the profile belong to its SD. This addendum does not mean the operations module is complete or that research is implemented.
