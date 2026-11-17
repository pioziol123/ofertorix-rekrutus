# Managing recruitments — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-22, R-23 and their ACs. Related: [offers](../oferty/requirements.md), [companies-research](../firmy-research/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-22 — applications and stages

One recruitment corresponds to one current application process regardless of the portal, with the sending channel recorded. When merging offers that have existing active applications, the owner indicates whether it is the same process or separate recruitments; separate processes are kept and are not merged automatically. A further attempt after closing can be a separate application. Stages: to consider → planning to apply → application sent → interviews → decision. The owner can change the stage manually, and at any stage end the process as: hired, rejected by the company, withdrawn, or offer declined by the owner. Individual interviews and tasks are recorded separately.

**AC-22:** adding another ad of the same offer does not create a new application. A new attempt keeps the previous application and its outcome. A change of assessment or the unavailability of an ad does not change the stage. The history shows manual changes with a date. Every agreed stage and closing outcome can be recorded; a manual stage change does not require holding fictitious intermediate interviews. Ending keeps the interviews, dates, tasks and notes.

### R-23 — recruitment information

The owner records notes, tags, recruiter contacts, multiple interviews, dates and recruitment tasks. Changes are kept in the history.

**AC-23:** for one application you can record two interviews with different dates, a contact, a task and a note, then correct them without losing the earlier history. The changes are available after a restart. The first version allows archiving offers and processes and correcting data with history, with no permanent deletion feature. Archived data can still be browsed. Archiving does not remove related interviews, tasks, contacts, notes or history.

## Open questions

Related: O-03, O-07. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.
