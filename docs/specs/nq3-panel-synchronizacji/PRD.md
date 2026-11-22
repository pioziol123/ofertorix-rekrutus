# Ad sync panel — PRD

Beads epic: `oferty-pracy-nq3`. Details: [requirements](requirements.md), [solution design](solution-design.md). Terms follow the [glossary](../../../GLOSSARY.md); an ad sync (here *sync*) is one fetch of ads from a source.

## Context

On 21 and 22 November 2026 the owner shaped a panel for ad syncs on a throwaway [mock-up](../../prototypes/synchronizacje/README.md) and chose its layout (variant C: a history grouped by day with details in a drawer) and its scope. The mock-up is evidence of layout and wording. Where it differs from the requirements (it refreshes itself, shows an attempt number, a scope in the details, a trigger in the list and a "needs attention" count), the requirements win.

## Problem

- **Only some sources can be synced from the browser.** The Polish portals have an import form on the offer list. SOLID.Jobs, Himalayas and the JobSpy portals start only from the command line or, for SOLID.Jobs, from the daily schedule.
- **The owner cannot see what syncs did.** The offer list shows only the latest sync of some sources. There is no history, so the owner cannot tell what a sync brought, which source keeps failing or when a source was last checked in full.
- **Sync information crowds the offer list.** A summary, a notice about an incomplete import and two sections about sources sit above the offers the owner came to read.

## Goal

- The owner starts a sync of any enabled source, of several or of all of them from one panel.
- The owner reads every sync as one line: source, state and result (new, changed and marked unavailable ads), with details on demand.
- The owner notices a source that has not been checked in full for days or keeps failing.
- The offer list shows offers only.

## What changes for the owner

- A new page "Synchronizacje" in the navigation. It does not refresh by itself; a button "Odśwież" reloads it.
- A filterable, paged history of every sync, manual and scheduled, and its details in a drawer.
- Buttons "Wybierz źródła" and "Synchronizuj wszystkie" with a confirmation listing the sources.
- Every sync requested from the panel searches one fixed scope, PHP · senior; the panel offers no choice of scope.
- A strip with the syncs queued or running, the sources whose latest sync failed or was incomplete, the new ads of the last 24 hours, and a warning about sources without a complete sync for 3 days or with 3 failed syncs in a row.
- The offer list loses every piece of sync information, the Polish portals' import form, and its refreshing by itself, also while an AI assessment is waiting.

## Out of scope

Decided by the owner on 21 and 22 November 2026; the ideas wait in the collection task `oferty-pracy-sz5`:

- A choice of scope and saved scopes (item 37), the schedule in the panel (38), cancelling a queued sync (39), a trend per source (40), a list of a sync's ads in its details (41) and history cleanup (42).
- A panel that refreshes itself, and a dot in the navigation while a sync is unfinished (48).
- Readable categories of sync errors (43); the panel shows one generic message.
- Links from a sync to offers: all offers it found (44), its new offers (45) and the AI assessment of its new offers (46). The panel counts ads, not offers.
- Which sources can ever reach a complete sync (36).
- Proving screen behaviour in a browser during implementation (49, 51); the tasks prove their logic with automated tests.

## Risks

- **Sources that rarely sync completely.** Sources limited by the portal or by the Polish portals' limits may stay listed in the warning about complete syncs; the owner accepted this until item 36 is checked.
- **A burst of requests.** "Synchronizuj wszystkie" starts a fetch from every enabled source at once; the queue still runs one sync per source.
- **A growing history.** Nothing removes old syncs (item 42); the history is paged.
- **Unavailable counts start late.** Syncs from before stage 2 cannot show how many ads they marked unavailable.

## Success

- Every enabled source can be synced from the panel, and a source with an unfinished sync gets no second one.
- Every sync, including those from before the panel, appears in the history with its state and the numbers of new and changed ads.
- A complete sync of a source that marks unavailable ads shows how many ads it marked unavailable at the source.
- A source without a complete sync for 3 days, or with 3 failed syncs in a row, is pointed out.
- The offer list holds no sync information.

## Stages

0. Polish time in one place: a shared way of counting and showing Polish time, made mandatory by the architecture rules (`oferty-pracy-nq3.6`, before 1).
1. The history: the page, the list, filters, pages and details (`oferty-pracy-nq3.1`, after 0).
2. Recording the number of ads marked unavailable (`oferty-pracy-nq3.2`, after 1).
3. Starting syncs from the panel (`oferty-pracy-nq3.3`, after 1).
4. Source health in the summary strip (`oferty-pracy-nq3.4`, after 1 and 3).
5. Removing sync information from the offer list (`oferty-pracy-nq3.5`, after 3 and 4, so the owner keeps a view of failing syncs).

## Constraints and dependencies

- A source keeps at most one unfinished sync; the panel relies on that rule and does not change it.
- The number of ads marked unavailable was never recorded, so syncs from before stage 2 cannot show it.
- Moments are stored in UTC; Polish time is computed in one shared place (stage 0) that every module will use; in this epic only the Sources module moves to it.
