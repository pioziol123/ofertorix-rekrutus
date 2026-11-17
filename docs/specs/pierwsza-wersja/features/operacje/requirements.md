# Background operations and cost control — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-24, R-25, R-26, R-29 and their ACs. Related: [launch](../uruchomienie/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-24 — summary and operation states

The application shows new offers, the best matches, completed research, upcoming interviews, errors and operation states. Completed stages remain available after an interruption. Notifications outside the application are out of scope.

**AC-24:** an assessment error does not hide a correctly fetched offer; a preparation error does not remove earlier research. For a failed operation the stage, the reason, the attempt history and a manual retry are visible. The information about completed research leads to the right report.

### R-25 — budget

The starting limit of 100 PLN for AI and search renews every calendar month in Europe/Warsaw, with no carry-over of the free balance. Visible: spent, reserved, available. Before each paid attempt a reservation of a bounded cost is required. An uncertain cost remains to be determined, with the reservation kept.

**AC-25:** concurrent attempts cannot together reserve more than the available funds. No funds stops paid work without blocking free fetching and browsing. Work can resume after the limit is increased/renewed. A timeout after the call may have been accepted is not counted as 0 PLN. Changing the limit does not buy credits. An attempt is settled in the reservation month, even if it ends in the following month. An uncertain cost and the reservation stay assigned to the original month until clarified. A retry in a new month requires a new reservation from the new limit. Renewing the limit does not remove old spending or reservations. A month boundary test confirms that the same cost is not deducted twice and that an unsettled attempt is not erased.

### R-26 — retry and priority

After a transient error, one automatic retry, then "needs attention" and a manual retry. Every paid attempt is subject to the budget. Manual requests take priority over pending automatic research, without interrupting active work.

**AC-26:** two consecutive transient errors do not create a third automatic paid attempt. Completed work is not repeated only because a later stage failed. A manual task waiting together with automatic research starts earlier once the executor is free, provided it has funds. Exactly-once charging by the provider is not guaranteed.

### R-29 — reliability of saving

Durable results, history, budget and stage progress are independent of the queue's technical history. A retry must not duplicate domain effects, and an old attempt does not overwrite newer data as current.

**AC-29:** after a worker restart a completed stage is readable; redelivering the same job does not create a second assessment/report with the same execution key. A late result of an old input does not replace the current version. Cleaning up the technical queue does not remove domain history or settlements.

## Open questions

Related: O-04, O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.
