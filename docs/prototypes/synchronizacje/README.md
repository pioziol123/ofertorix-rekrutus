# Sync panel prototype

A throwaway mock-up of a separate panel for ad syncs: starting a sync of one source or of all sources from the browser, and following each sync's state and result. It also proposes removing every piece of sync information from the offer list. The owner uses it to choose the layout and the functions; the chosen version then goes through the usual specification. It is not product code and has no API, persistence or real fetching.

## How to open it

Run from the repository directory:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/prototypes/synchronizacje
```

Address: http://127.0.0.1:8766/ (variant C, the chosen one; `?variant=A` shows the comparison layout). Opening the file directly also works, but the `?variant=` and `?sync=` parameters may then be lost on reload.

The data is fictional. A sync started in the mock-up goes from queued to in progress within 2 seconds and finishes after 5–11 seconds: LinkedIn always ends partial (the portal rejects requests), Bayt fails half of the time, the rest end complete. Reloading resets everything.

## Layouts and the owner's choice

The owner chose variant C on 2026-11-21, with a result column like in A, and rejected variant B, which was removed from the mock-up. Variant A stays only for comparison; the bottom bar or the keyboard arrows switch between A and C. The functions are the same; the layout and the place of starting a sync differ.

| Variant                        | Starting a sync                                                                                                                                                                                                                                                                                       | History and details                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Table + detail panel       | A card of source tiles above the list, grouped as other sources, JobSpy portals and Polish portals, each with its latest state and a "Synchronizuj" button.                                                                                                                                           | A table with the details panel on the right, the same pattern as the offer details.                                                                                                                                                                                                                                   |
| C — Timeline + drawer (chosen) | Buttons only: "Synchronizuj wszystkie" and "Wybierz źródła" open one dialog with checkboxes. A strip on top summarises: in progress, needing attention, new ads in 24 h, sources without a complete sync for 3 days (at most 3 names, the rest behind "i N innych", which expands the list in place). | History grouped by day, with the columns time, source, result and state, all on one line; an icon in the state label shows the state (hourglass W kolejce, arrow W toku, tick Pełna, half-filled circle Niepełna, cross Nieudana); hovering over it explains the state; details slide in as a drawer over the page. |

## How the panel works

**One source.** In variant C, "Wybierz źródła" opens the source dialog with nothing checked; in variant A each enabled source has its own button. Every source searches the same fixed scope, PHP · senior, so there is nothing to choose. A source that already has an unfinished sync gets no second one: it is marked "już trwa" in the dialog (in A the button turns into "Pokaż trwającą"), and a request opens the existing sync. This follows the current rule that a source has at most one unfinished sync.

**All sources.** "Synchronizuj wszystkie" opens a confirmation listing every source with a checkbox. Enabled sources are checked; sources with a sync in progress are marked "już trwa"; disabled and unconnected sources are greyed out with their reason. After confirming, the panel says how many syncs were requested, how many were already running and how many sources were skipped, and filters the list to the states W kolejce and W toku.

**List.** One row says only: source, state, overall result and when. The result is "+N nowe · N zmienione · N niedostępne"; zeros are greyed out. A sync in progress shows the number of ads found so far. A failed sync shows the same groups, all zero; why it failed is in the details. Syncs from before the panel show "— niedostępne", because that number was not recorded then. The states are the existing ones: W kolejce, W toku, Pełna, Niepełna, Nieudana.

**Filters.** Source and state are multi-select lists; the states are W kolejce, W toku, Pełna, Niepełna and Nieudana. A choice applies when the list closes (a click outside it or Escape), not at every tick. Trigger (manual or schedule) and period (today, 7 days, 30 days, all) are single choices. There are no quick-filter pills; "Wyczyść filtry" appears when a filter differs from the default. The filters live in the address, like the offer filters.

**Pages.** The history is split into pages with "Poprzednia / Strona X z Y / Następna" under it, like the offer list; the mock-up shows 10 syncs per page. A changed filter goes back to page 1. A day split between two pages shows its name again at the top of the next page. "Strona X z Y" is clickable text that opens a plain list of every page, one under another, with no visible text field. Digits typed while the list is open keep the numbers that start with them (1 → 1, 10–18; 12 → 12); the typed digits show above the list, which is empty when nothing is typed; Backspace removes the last digit and brings back the previous list; Enter goes to the first number shown; a click outside or Escape closes the list. The mock-up holds about four months of history, so "Cała historia" spans 18 pages.

**State tooltip.** Hovering over a state label (W kolejce, W toku, Pełna, Niepełna, Nieudana), in the list or in the details, shows what the state means in plain words, for example that a complete sync checked the whole set scope, not the whole portal.

**Details.** A click on a row opens the panel with: what went wrong (one generic message; the original technical message is in the folded technical details), four numbers (found, new in this source, changed, marked unavailable), the scope (PHP · senior), the course (requested, start, end, duration, portions fetched, attempt out of 3) and one action, "Uruchom ponownie".

**Live updates.** While any sync is unfinished, the panel refreshes itself, and the "Synchronizacje" link in the navigation shows a dot. This dot is the only trace of syncs outside the panel.

**Offer list.** Everything about syncs goes away from it: the "SOLID.Jobs — ostatni pełny import" summary, the notice about an incomplete import, and the "Źródła JobSpy" and "Polskie serwisy — pobieranie ofert" sections with the import form.

## What the current system does not provide

The panel needs these from the Sources module; each is a question for the specification.

1. **New versus changed.** A sync records today how many ads it found and how many new content versions it saved. It does not record how many of those ads appeared for the first time. "New" can be computed from the history of observations, also for past syncs; "changed" is then the new versions minus the new ads.
2. **Marked unavailable.** When a complete sync marks missing ads as unavailable at the source, the number is not recorded. Past syncs cannot show it; it has to be counted from now on. Only SOLID.Jobs allows this inference, so for the other sources the panel shows "nie dotyczy".
3. **"Removed" is the wrong word.** The glossary says the absence of an ad does not prove it expired or that the recruitment ended. The mock-up therefore says "niedostępne w źródle", not "usunięte".
4. **Starting from the browser.** Today the browser can start only the Polish portals. SOLID.Jobs, Himalayas and the JobSpy portals start only from the command line, so the panel needs one way of requesting any source.
5. **List of syncs.** Today the reads give only the latest sync of each source. The panel needs a filtered, paged list of all syncs.
6. **Readable errors.** The stored error is often a technical message. The panel needs a short explanation in the owner's language, with the original kept in the technical details.

## Improvement proposals

Ordered by expected value for the owner. On 2026-11-21 the owner took 1, 2 and 5 into the panel's scope; 3, 4, 6, 7, 8 and 9 went to the collection task oferty-pracy-sz5 as items 37–42. Later the same day, while refining the scope, the owner moved 1 and 2 to the collection task as well (items 45 and 46), so the panel does not mix ads and offers; only 5 stays in scope.

## Scope decisions of 2026-11-21

- Every enabled source can be started from the panel.
- One fixed scope for every source, PHP · senior, as the sources already use; the panel has no scope choice (Polish portals lose the technology and level fields).
- The result counts ads only: new (not shown by this source before), changed (new content versions minus new ads) and marked unavailable at the source. New is recorded per sync from now on and filled in once for past syncs from the observation history; unavailable is counted from now on only (past syncs show "—", sources other than SOLID.Jobs "nie dotyczy").
- A failed or partial sync shows one generic message; the original technical message sits in the folded technical details. Readable error categories are item 43 of the collection task.
- The details have no links to offers: "Pokaż wszystkie znalezione" is item 44, "Pokaż N nowych ofert" item 45, assessing new offers item 46.
- Source health warning: no complete sync for 3 days, or the last 3 syncs failed in a row; fixed thresholds, enabled sources only.
- Scheduled syncs (SOLID.Jobs daily) appear in the same history, marked "Harmonogram".
- The navigation dot shows while any sync is queued or in progress; there is no separate notice of completion.
- The icons shown in the mock-up are accepted (2026-11-22): state icons in the state label (the W toku arrow does not spin) and trigger icons next to the source name in the details only (a hand for manual, a calendar with a clock for the schedule); the list shows no trigger.
- Sync information leaves the offer list in the same scope, at the same time as the panel appears.

1. **Offers from one sync.** A filter of the offer list "new from this sync" or "found in this sync", opened from the details. It answers the first question after a sync: what came in.
2. **Assess the new offers.** In the details of a finished sync, a button that requests the AI assessment of its new offers, with the maximum cost shown before confirming, like the bulk assessment of the offer list.
3. **Saved scopes.** Named scopes for the Polish portals (for example "PHP senior", "Go — wszystkie poziomy"), selectable for one source and in "Synchronizuj wszystkie".
4. **Schedule in the panel.** Show which sources run daily and when the next run is, and allow adding a source to the daily schedule; today only SOLID.Jobs is scheduled.
5. **Source health.** A warning when a source has had no complete sync for some days or failed several times in a row; variant C shows a simple version.
6. **Cancel a queued sync.** Withdrawing a sync that has not started yet. A sync in progress is never interrupted, which the current rules already require.
7. **Trend per source.** A small chart of found and new ads over the last syncs, to notice that a source suddenly returns far fewer ads.
8. **Ads of the sync in the details.** A short list of the new, changed and unavailable ads with links, before the full offer list filter.
9. **History cleanup.** Folding or removing old successful syncs after some months, so the list stays readable.

## Conclusion

The mock-up shows one way of separating syncs from offers: a panel that starts syncs of one or all sources and keeps a readable, filterable history with details on demand. The owner chose variant C and set the scope listed under "Scope decisions of 2026-11-21"; the mock-up shows that scope. It needs the Sources module changes listed above, mainly counting new and unavailable ads per sync and one way of starting any source from the browser.
