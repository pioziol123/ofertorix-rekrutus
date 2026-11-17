# Fetching and syncing offers — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **scope of the implemented fetching stage**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Current stage after the setup

Scope for review: fetching from SOLID.Jobs, saving and updating ads in PostgreSQL, the history of source changes, complete/incomplete runs, availability, and daily and manual import. Start and status through container commands, without adding screens or unsecured data endpoints.

The UI list will be built in the next stage. The profile, local matching, ratings, AI/research, company profiles and merging logical offers are not part of this implementation. We save the provenance and raw fields these stages need; we do not yet create their full model.

**Confirmed:** the current scope is only PHP and the Senior level according to SOLID.Jobs filters. Staff, Vue.js and AI agents are outside this stage. The source scope is versioned; we use its PHP subcategory and the Senior level, without extending the import with local recognition of Staff. Missing data of the other criteria in fetched offers stays unknown.

## Scope and dependencies

This document owns requirements R-04, R-05, R-06, R-07 and their ACs. Related: [profile](../profil/requirements.md), [offers](../oferty/requirements.md), [operations](../operacje/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-04 — first source

The first adapter uses the official SOLID.Jobs API. It imports all currently available ads in the configured scope; subsequent runs detect new and changed ones. The history starts at the first read.

**AC-04:** a control set from the source is mapped without skipped pages and without duplicates of the source identifier. The record covers the original identifier, the source, the URL, the current content, the structured data and the read dates. The source URL is kept for a later view; at this stage it is available in the data/CLI diagnostics, with no requirement to build a UI list. It does not promise to recover ads that were unavailable before the first import.

### R-05 — schedule and manual fetch

Fetching runs once a day and on demand. After a start or a wake-up it catches up on one overdue fetch, without replaying all the skipped cycles. The owner sets the time in the configuration. Proposed starting schedule: 08:00 Europe/Warsaw, with the option to turn the schedule off and import manually; the setting is not a confirmed owner's preference.

**AC-05:** after being off for several days, a start causes at most one overdue run per source/scope; a request while a run is already in progress does not start a parallel duplicate. The status command shows the current state, counters and the time of the last complete sync, without the need to build a UI. Closing the tab does not stop the work. We do not promise execution on a computer that is off/asleep.

### R-06 — incomplete sync

Correctly fetched parts are saved. An error does not allow the missing ads to be considered unavailable. The owner reads the error in the run status and can retry the fetch with a CLI command.

**AC-06:** on an error on page 3 after successful pages 1–2, the new data from 1–2 is available, the run is marked as incomplete, and the date of the last complete sync does not move. The availability of unread ads does not change. A retry does not create further copies of the same entries.

### R-07 — availability versus expiry

Absence after a complete check of the same scope means unavailability at the source. Expiry follows from source information, e.g. a validity date. Both states are separate from the application process.

**AC-07:** absence in a complete run changes availability, keeping the reason and date; an incomplete run or a changed scope does not. Explicit expiry is marked separately. Neither of these states removes notes or closes an application.

## Acceptance of the chosen stage

- The manual request and the status work from the tools container; fetching is done by a separate worker.
- A repeated complete import does not create duplicate entries or revisions with identical content.
- A scope test confirms that the PHP subcategory and the Senior level are passed to the API, without an additional Staff scope or other specialisations. A controlled multi-page API confirms the behaviour on an error, unstable pagination and a missing entry. A real import confirms the adapter works, but does not replace the controlled cases.
- A worker restart does not leave an active run blocking the import indefinitely; the status keeps the interruption, and a retry does not lose previously saved pages.
- No operation of this stage calls AI, starts research or exposes offers through a public endpoint.

## Open questions

Related: O-05, O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.
