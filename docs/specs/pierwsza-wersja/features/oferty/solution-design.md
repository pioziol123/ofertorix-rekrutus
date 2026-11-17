# Offer identity, discrepancies and history — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-08/AC-08, R-09/AC-09, R-10/AC-10, R-11/AC-11.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Data ownership and contracts

| Entity / group | Relevant fields and invariants |
| --- | --- |
| AdRevision | `id`, `source_ad_id`, fetch date, raw fields, normalised text/fields, hashes, change classification. Keep the versions used as AI input; we do not require a UI for past full descriptions. |
| Offer / MembershipHistory | The logical offer, ad assignments and the history of merges/splits. A merge is not a cascading deletion of old identifiers. |
| FieldAssertion | Subject, field, value, source, scope, date, author; `selected_assertion_id` can point to a manually applicable value. Source reads do not change a manual selection. |

## Merging and splitting

SD proposal: the merge command indicates the offers and the main offer, locks them in a transaction, moves the assignments and keeps the identifiers of the old offers as aliases/historical records. It does not delete notes or reports. A split indicates the division of sources and the assignment of applications. Shared historical notes can be available through the merge entry with their original provenance, instead of copying content without an author. Validation forbids losing an application. **Confirmed Q12:** with two active applications the owner's decision is required: the same process or separate recruitments. We do not infer this identity from offer similarity alone. SD proposal: the command contains an explicit resolution of the processes and the expected versions; without it, it returns a conflict that requires a decision. With one process it keeps the provenance of both histories and items, and with separate ones it does not merge the applications. The exact representation of separate recruitments for grouped offers and the reversible assignments must be reviewed before implementation; a database constraint must not force the loss of a process.

## Values and discrepancies

The original source fields keep the source's own semantics; the adapter versions the mapping. Pay: a set of variants with nullable `from/to`, currency, period, contract type and amount basis. A missing lower bound does not mean zero. Without an established basis, do not assume B2B net from the amount alone. No automatic net/gross or currency conversion in this design.

SD proposal: the source upsert does not overwrite a manual selected_assertion_id. Changing the chosen value and its provenance creates a history event. We keep all conflicting variants and their provenance, without treating the more favourable one as the only fact. Qualification, under the accepted [matching](../dopasowanie/solution-design.md#conflicting-variants) rule, can consider a requirement met based on one variant; the discrepancy marker is then mandatory.

## Archiving

Confirmed Q15: an offer can be archived while keeping access to its history. SD proposal: archiving is a separate marker on the logical offer, independent of the availability/expiry of ads and of the application state. It does not run DELETE on domain records or cascades that remove related data.

## Revisions and events

SD proposal: the module accepts new ad content and fields from the sync, keeps the revision and compares meaningful data. A material change atomically marks the assessment as stale and requests a reassessment operation through the contract of the matching/operations module. Changes of formatting alone are saved without a new paid assessment. The previous inputs of the assessments used remain available, without the obligation to build a browser of full snapshots.


## Commands

Logical names, not frozen endpoints. Shared validation/version/response contract: [architecture](../../architecture.md#shared-command-contract).

| Command | Input and effect |
| --- | --- |
| MergeOffers / SplitOffers | Identifiers and expected versions; atomic validation of assignments and history. |

## Integration with other features

[fetching](../pobieranie/requirements.md), [matching](../dopasowanie/requirements.md), [recruitments](../rekrutacje/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Reading a key again, two similar offers, merge/split with applications, conflicting salary ranges and a manual choice, a meaningful change vs formatting. Check the completeness of the history and that assignments are kept. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-02, O-03 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.
