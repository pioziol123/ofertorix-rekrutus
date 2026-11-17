# Offer identity, discrepancies and history — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-08, R-09, R-10, R-11 and their ACs. Related: [fetching](../pobieranie/requirements.md), [matching](../dopasowanie/requirements.md), [recruitments](../rekrutacje/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-08 — offer and ads

The main list shows the job offer to which the source ads are assigned. Reading the same entry again updates it instead of creating a new offer. Similar entries and re-publications of uncertain identity stay separate, with a merge suggestion.

**AC-08:** reading one source key many times does not increase the number of offers. Two similar entries with different keys are not merged automatically based only on the position/company name. The owner sees the suggestion and the sources of each offer.

### R-09 — reversible merge

The owner approves an offer merge and can undo it. The history records both operations. Ads, notes and history are kept; on a split the owner indicates the assignment of existing applications.

**AC-09:** after a merge the main list has one offer and access to all sources. After a split the sources return to the indicated offers, earlier notes and history are available with their provenance, and each application has the chosen assignment. The operation does not lose any application. If both offers have active applications, before the merge the owner indicates whether they are the same process or separate recruitments. Until that decision the merge is not performed. No application, date or note disappears automatically; indicating separate processes does not merge them.

### R-10 — discrepancies and manual information

Conflicting data have visible values and sources. The owner can indicate the value that applies, without deleting the source data. Manual information uses one mechanism with the provenance indicated, also for an interview with a recruiter.

**AC-10:** for two different salary ranges/work modes the screen shows the discrepancy instead of silently picking the more favourable value. Manually indicated applicable information is distinguishable from reads and stays visible after a sync; the history reconstructs the change. Research does not replace it without an explicit operation. Until the discrepancy is resolved, we keep both variants; their effect on qualification is set by [R-03](../dopasowanie/requirements.md#r-03--missing-information-and-exclusions). We do not reduce a discrepancy to missing data. The owner can archive an offer while keeping its data and history; permanent deletion is not part of the first version (Q15).

### R-11 — current content and changes

The details show the current content, and the change history below it. Material changes of technologies, pay, seniority or work mode start a reassessment within the budget. Changes of formatting alone do not start AI.

**AC-11:** after a pay change the content is current, the history shows the change, and the previous assessment is marked as stale until the new one completes. With no budget it stays stale with a waiting reason. A whitespace correction does not cause an AI call. Decisions, notes and earlier assessments do not disappear. A browser of past full contents is not required.

## Open questions

Related: O-02, O-03. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.
