# Managing recruitments — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-22/AC-22, R-23/AC-23.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Data ownership and contracts

| Entity / group | Relevant fields and invariants |
| --- | --- |
| Application / Interview / Task / Contact / Note / Tag | Offer, attempt number, channel, state and outcome; interviews/tasks/dates, contacts/notes with provenance. History does not depend on the state of the ad. |

## Application process

SD proposal: an Application points to the logical offer, the attempt number and the sending channel. At any time one current process of the same recruitment; separate recruitments explicitly indicated by the owner must not be lost through an offer merge; a new attempt after closing does not overwrite the previous one. Stages and closing outcomes were confirmed in Q14 and are maintained by R-22. SD proposal: separate fields stage and a nullable outcome; a manual stage change and closing record an event, without forcing transitions through all stages. Interviews and tasks are not stage enum values but separate records.

A change of stage, date or note content saves the data and a history event in one transaction, with an expected version check. The module does not listen to a rating change or expiry as a command to close the application. Offer merge/split uses its assignment validation, especially when two active processes exist (confirmed Q12). The decision and data preservation rule is maintained by the [offers SD](../oferty/solution-design.md#merging-and-splitting); the representation of the links requires a joint review of both models.

## Interviews, contacts and tasks

SD proposal: Interview and Task have their own identifiers and multiple records per application. Dates have a time zone and an unambiguous time; no date is an allowed state of a task, not a zero date. Contacts and notes contain the provenance of the information and a history of corrections. **Confirmed Q15:** archiving offers/processes and corrections with history, no permanent deletion in v1. SD proposal: archived_at is separate from stage and outcome; archiving does not remove records and does not automatically end the recruitment. Reads may include archived records, and we keep history regardless of their visibility in the current view.

The own decision on an offer is a field separate from the rating and from the application stage. The AI assessment command has no permission to change it. Interview preparation refers to the Preparation of the companies/research module instead of copying the report.


## Commands

Logical names, not frozen endpoints. Shared validation/version/response contract: [architecture](../../architecture.md#shared-command-contract).

| Command | Input and effect |
| --- | --- |
| SaveRecruitmentInfo | Application identifier, information type, data, provenance, expected version; change history. |

## Integration with other features

[offers](../oferty/requirements.md), [companies-research](../firmy-research/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Two interviews, a task, a contact and a note correction, closing and a second attempt. Check the history after a restart, edit conflicts, and that the stage does not change after a rating change/expiry. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-03, O-07 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.
