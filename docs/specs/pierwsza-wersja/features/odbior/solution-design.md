# Acceptance of the whole flow — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-30/AC-30.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Integration plan

All the checks below are a plan; only manual trials of a one-off mock-up were run, described in the [prototype README](../../../../prototypes/przeglad/README.md).

| Scenario / method | Coverage | Observed evidence |
| --- | --- | --- |
| Profile with control contacts, a correction and a new assessment input | R-01, R-02, R-27 | Profile versions; no contacts in AI requests/logs; view filters do not change fetching. |
| Mapper and a fixture of gaps/conflicts, a test of local rules | R-03, R-04, R-21 | No salary range ≠ zero, unknown availability ≠ exclusion; currencies/bases do not mix. |
| Real SOLID.Jobs + a controlled multi-page API | R-04–R-08 | All pages saved, one record per key, a partial error without a false disappearance. |
| Scope change, 429, changing pagination, an ad coming back | R-05–R-07 | Completeness/incompleteness and last full correct, no unjustified availability update. |
| Merge/split/discrepancies on a database with applications | R-08–R-10, R-22 | Sources, notes, all applications and history kept, a manually chosen value does not disappear. |
| A material change vs an HTML change; a late result of an old attempt | R-11, R-14, R-29 | A new version, no unnecessary AI, the old result does not become current. |
| Calculator on fixed examples with unknowns | R-12–R-14 | Repeatability, correct weights/completeness/null; recalculation without network, assessment history. |
| Two companies with a shared domain, an agency, an unknown client | R-15, R-18 | No merge by name; scope and roles kept, no carrying over of the client's technologies. |
| Two concurrent company qualifications, a new offer, a manual refresh | R-16–R-18 | One auto operation, no TTL, separate basic/deep versions, evidence with claims. |
| Manual review of research and preparation | R-18, R-19 | Sources open the right material; hypotheses/opinions explicit, topics follow from the offer/profile. |
| Browser: offer → company → another offer, notes and two interviews | R-20–R-24 | Correct identifiers, history, dates and data after a refresh and a restart. |
| Two reservations for the last funds, a timeout, a retry, a month change | R-25, R-26 | Atomic limit, uncertain reservation kept, at most 2 auto attempts, correct month. |
| A manual task before pending automatic research | R-26 | Start order after the active task ends, no bypassing the budget. |
| Local access without login, Compose network, a review of logs and the bundle | R-27, R-28 | UI/API available on loopback, no public database and no secrets, working autostart. |
| Killing the worker at points before/after the call and before/after commit | R-24–R-26, R-29 | Checkpoints, no double result, cost state to be determined without a fictitious zero. |
| Recreating containers while keeping the volume, a long break | R-05, R-28, R-29 | All data and reservations kept, one overdue fetch, no dependency on the tab. |
| Joint acceptance of the whole flow and 20 varied assessments | R-30 and the whole | A report with input identifiers, costs, errors and the owner's decision. |

## Report and acceptance boundaries

SD proposal: the acceptance report relates the results to the fixed R/AC identifiers and records the data/model/prompt versions, real costs, deviations and the owner's assessment for 20 offers. Feature tests are the basis, and the integration scenarios check how they work together. We do not accept that the number of reviewed offers alone proves the correctness of all rules.

VPS deployment, configuration of the external backup service and the restore test of its backup remain outside the application's acceptance. Recreating containers on a kept volume checks the durability of the launch, not the backup. We do not record success for a test that has not been run yet.


## Integration with other features

[profile](../profil/requirements.md), [fetching](../pobieranie/requirements.md), [offers](../oferty/requirements.md), [matching](../dopasowanie/requirements.md), [companies-research](../firmy-research/requirements.md), [browsing](../przeglad/requirements.md), [recruitments](../rekrutacje/requirements.md), [operations](../operacje/requirements.md), [launch](../uruchomienie/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Go through all the integration scenarios and collect the owner's decision and the identified deviations. The review of 20 offers covers good, weak and uncertain matches. Coverage includes all R/ACs listed at the start of the document. This integration plan checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-01, O-02, O-03, O-04, O-05, O-06, O-07 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.
