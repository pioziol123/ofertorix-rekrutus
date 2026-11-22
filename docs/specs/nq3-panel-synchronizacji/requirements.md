# Ad sync panel — Requirements

Basis: [PRD](PRD.md). Technical solution: [solution-design.md](solution-design.md). Concepts: [domain glossary](../../../GLOSSARY.md).

Section `T<n>` describes stage n of the PRD and the Beads task `oferty-pracy-nq3.<n>`. Requirement IDs (`T<n>-R..`) and criterion IDs (`T<n>-AC..`) are stable, and the Beads task of a stage cites criteria by ID. Each criterion names the requirements it checks. The *Check* column says how the implementer proves it. No criterion needs the owner; screen behaviour that only a browser shows is proven by automated tests of the logic behind it (owner, 2026-11-22; a browser for the implementer is collection task item 49).

**Sources.** `(owner, <date>)` cites the owner's decisions in the conversations of 21 and 22 November 2026 about the [mock-up](../../prototypes/synchronizacje/README.md) and the review of the epic ([review report](../../research/nq3-egm-review/consolidated_review_report.md)); `(mock-up)` cites what the mock-up shows (variant C) as the owner accepted it. Where the mock-up differs from a requirement, the requirement wins.

<a id="words"></a>

## Words

*Ad sync* (here *sync*), *complete source sync*, *incomplete source sync*, *failed sync*, *unfinished sync*, *finished sync*, *new ad of a sync*, *changed ad of a sync* and *ad unavailable at the source* have their glossary meaning (owner, 2026-11-22).

| Term | Meaning here |
| --- | --- |
| State | One of: "W kolejce" (queued), "W toku" (running), "Pełna" (complete), "Niepełna" (incomplete), "Nieudana" (failed). An unfinished sync is W kolejce or W toku; a finished one Pełna, Niepełna or Nieudana. |
| Way of starting | "ręcznie" (manual: the panel, the offer list's form, the command line) or "z harmonogramu" (the daily schedule). |
| Catalogue sources | Every source the application knows, enabled or not: SOLID.Jobs, Himalayas, the JobSpy portals and the Polish portals. Each has a display name. |
| Enabled source | A source the application's configuration allows to sync. A disabled one shows the reason "Wyłączone w konfiguracji aplikacji". (owner, 2026-11-22) |
| Source that marks unavailable ads | A source whose complete sync marks the ads it no longer found as unavailable at the source. Today only SOLID.Jobs. |
| Scope | The search criteria a source is queried with; in the panel always PHP · senior. |
| Polish time | Days ("Dziś", "Wczoraj", dates) and periods follow the calendar in Poland. (owner, 2026-11-22) |

<a id="wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| PS-AC01 | All of the project's automated quality checks pass: code rules and formatting, types, the application build, and automated tests including the tests on a real database. | Full run of the quality checks |
| PS-AC02 | Code created or moved in the task belongs to the module that owns its data and rules, and uses modules only through their public operations, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). | Code review |

<a id="t6"></a>

## T6. Polish time in one place (`oferty-pracy-nq3.6`)

Depends on: none. T1 depends on it.

### Scope

One shared way for all code to answer questions about Polish time, to count in Polish calendar days and months and to show dates, with a rule that makes it mandatory; the Sources module moves to it. Out of scope: other modules and pages, which move later (collection task item 53), and a time zone the owner chooses.

### Requirements

| ID | Requirement |
| --- | --- |
| T6-R01 | **One time zone.** The application's time zone is Polish time (Europe/Warsaw), set in one place; nothing configures it. (owner, 2026-11-22) |
| T6-R02 | **Stored in UTC.** Every moment is stored and passed between parts of the application in UTC; Polish time exists only when a moment is turned into a day, a month, an hour or a shown date, or back. (owner, 2026-11-22) |
| T6-R03 | **Calendar questions.** For a moment, the shared way gives its Polish day and month, and the moment the Polish day or month containing it starts, also N days or months back. (owner, 2026-11-22) |
| T6-R04 | **Calendar arithmetic.** Adding or subtracting days or months keeps the Polish wall-clock time: noon plus 7 days is noon a week later, also across a change between summer and winter time. Adding hours or minutes counts exact elapsed time. (owner, 2026-11-22) |
| T6-R05 | **A time that does not exist.** On the day the clock jumps from 02:00 to 03:00, a result that falls between them moves forward by the jump, for example 02:30 becomes 03:30. (owner, 2026-11-22) |
| T6-R06 | **A time that occurs twice.** On the day the clock goes back from 03:00 to 02:00, a result that falls between them is the earlier of the two. (owner, 2026-11-22) |
| T6-R07 | **Month ends.** Adding months to a day that the target month lacks gives the target month's last day, for example 31 January plus one month is 28 or 29 February. (owner, 2026-11-22) |
| T6-R08 | **Showing dates.** The shared way shows a moment as a Polish date (DD.MM.RRRR), a date with time, a time, and "Dziś" or "Wczoraj" for those days. (owner, 2026-11-22) |
| T6-R09 | **Mandatory.** The architecture rules state that code which turns moments into Polish days, months, hours or shown dates or back, counts in calendar days or months, compares stored data with a day or month boundary, shows a date, or takes "now" to store it or compare it with stored data, does so through the shared way; stored moments are UTC and queries do not convert time zones. Measuring elapsed time locally (delays, time limits, "in an hour" in code that touches neither the calendar nor the database) stays allowed. Older code moves over when its function changes. (owner, 2026-11-22) |
| T6-R10 | **Kept: the schedule day.** The day of the daily SOLID.Jobs sync, after moving to the shared way, is the same as today for every moment, including both nights of a time change. (owner, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T6-AC01 | (R03) The Polish day, month and their start in UTC are right for moments around midnight in winter and summer, at both time changes, at the turn of a year and on 29 February. | Automated test |
| T6-AC02 | (R04) Noon plus and minus 7 days across each time change is noon in Polish time (167 or 169 hours apart in UTC); plus 24 hours across a change is 24 hours exactly. | Automated test |
| T6-AC03 | (R05, R06) 02:30 on the spring change day becomes 03:30; 02:30 on the autumn change day is the earlier occurrence; both also when reached by minus 7 days. | Automated test |
| T6-AC04 | (R07) 31 January plus one month is 28 February in a common year and 29 February in a leap year. | Automated test |
| T6-AC05 | (R08) Dates and times show as T6-R08 says, and "Dziś"/"Wczoraj" switch at Polish midnight, also on a time change day. | Automated test |
| T6-AC06 | (R09) The architecture rules contain the rule of T6-R09, and the Sources module computes no Polish time outside the shared way. | Code review |
| T6-AC07 | (R10) For moments every 15 minutes over a year, both time-change nights included, the schedule day equals the one the present code gives. | Automated test |
| T6-AC08 | (R01, R02) Every function of the shared way takes and returns moments in UTC, and the time zone appears in one place. | Code review |

<a id="t1"></a>

## T1. Sync history (`oferty-pracy-nq3.1`)

Depends on: T6.

### Scope

A new page listing every sync with filters, pages and details. Out of scope: starting a sync (T3), the summary strip and source health (T4), the number of ads marked unavailable (T2), changes to the offer list (T5), refreshing by itself (collection task item 48).

### Requirements

| ID | Requirement |
| --- | --- |
| T1-R01 | **Page and navigation.** The application has a page "Synchronizacje", reached from a link "Synchronizacje" in the navigation of every page that has the navigation. The page does not refresh by itself; a button "Odśwież" reloads the list and the open details. Changing a filter or a page reads the list again. (owner, 2026-11-22) |
| T1-R02 | **Every sync.** The history holds every sync the application has stored, of every catalogue source, manual and scheduled, including syncs from before this task. (owner, 2026-11-21) |
| T1-R03 | **Order and grouping.** Syncs are ordered from the most recently requested. They are grouped under the day of their request in Polish time ("Dziś", "Wczoraj", then the date); a day split between two pages shows its heading again at the top of the next page. (mock-up; owner, 2026-11-22) |
| T1-R04 | **One row.** A row shows, on one line: the time the sync was requested, the source's name, the result (T1-R05) and the state label (T1-R07). It shows no way of starting and no scope. (owner, 2026-11-21, 2026-11-22) |
| T1-R05 | **Result.** A finished sync shows "+N nowe" and "N zmienione"; zeros are greyed. A queued sync shows "Czeka na start"; a running one shows the number of ads found so far. The number of ads marked unavailable is not shown until T2. (owner, 2026-11-21, 2026-11-22; mock-up) |
| T1-R06 | **New and changed.** A finished sync counts its new ads (ads this source showed first in this sync) and its changed ads (ads known before whose content this sync saw in a new form). Both are known for syncs from before this task. (owner, 2026-11-21, 2026-11-22) |
| T1-R07 | **State label.** The state is a label with an icon: hourglass for W kolejce, an arrow (not moving) for W toku, a tick for Pełna, a half-filled circle for Niepełna, a cross for Nieudana. Hovering over the label, or focusing it with the keyboard, shows in a tooltip that keeps at least 16 px from the window's edges: W kolejce "Zlecona, czeka na wolne miejsce do pobierania."; W toku "Pobieranie trwa. Liczby rosną w miarę zapisywania kolejnych porcji ogłoszeń."; Pełna "Sprawdzono cały ustawiony zakres źródła. Pełna synchronizacja nie znaczy, że pobrano cały portal — tylko cały zakres."; Niepełna "Pobrano tylko część zakresu. Pobrane ogłoszenia są zapisane; brak pozostałych nie oznacza, że są niedostępne."; Nieudana "Nie udało się pobrać żadnego ogłoszenia. Dostępność ogłoszeń tego źródła się nie zmieniła." (owner, 2026-11-22; mock-up) |
| T1-R08 | **Filters.** Source and state are lists with several choices; a choice applies when the list closes, and a list with nothing chosen means all. "Sposób uruchomienia" (all, ręcznie, z harmonogramu) and period (today, last 7 days, last 30 days, all) are single choices. "Last 7 days" is today and the 6 calendar days before it, "last 30 days" today and the 29 before it, in Polish time, by the time a sync was requested. The source list names every catalogue source. Without filters in the address, the period is the last 7 days and the rest is all. "Wyczyść filtry" appears when a filter differs from that default and restores it. A changed filter goes back to page 1. (owner, 2026-11-21, 2026-11-22) |
| T1-R09 | **Pages.** Below the list: "Poprzednia", "Strona X z Y" and "Następna", and a choice of 10, 20, 50 or 100 syncs per page, 20 by default; a changed number goes back to page 1, and "Wyczyść filtry" does not change it. "Strona X z Y" opens a list of every page number; digits typed while it is open keep the numbers that start with them, Backspace removes the last digit, Enter opens the first number shown, Escape or a click outside closes it. (owner, 2026-11-21, 2026-11-22) |
| T1-R10 | **Address.** The filters, the page, the number per page and the open sync live in the page's address, so reloading or sharing the address shows the same view. (owner, 2026-11-22) |
| T1-R11 | **Empty list.** When no sync matches, the page says "Brak synchronizacji dla wybranych filtrów" and offers "Wyczyść filtry" when a filter differs from the default. |
| T1-R12 | **Details.** A click on a row opens its details in a drawer over the page: the source's name with an icon of the way of starting (a hand for ręcznie, a calendar with a clock for z harmonogramu, with a tooltip "Uruchomiona ręcznie" or "Uruchomiona z harmonogramu dziennego"), the state label of T1-R07, the numbers of T1-R13, the course of T1-R14 and, for a Niepełna or Nieudana sync, the message of T1-R15. Closing the drawer, or Escape, returns to the list. (owner, 2026-11-22) |
| T1-R13 | **Numbers in the details.** Found ads (the ads the sync saw), new and changed. While the sync is queued or running, new and changed show "—". (owner, 2026-11-21, 2026-11-22) |
| T1-R14 | **Course.** Requested, started, finished, duration and the number of portions fetched; a time not reached yet shows "—". No attempt number. (owner, 2026-11-22) |
| T1-R15 | **Error message.** A Niepełna or Nieudana sync shows one generic sentence: "Synchronizacja nie pobrała wszystkich ogłoszeń." Below, folded under "Szczegóły techniczne", the stored error message and diagnostics as stored, shown as text. A sync with neither shows no technical section. (owner, 2026-11-21, 2026-11-22) |
| T1-R16 | **Unknown sync.** An address naming a sync that does not exist shows the list without details. |
| T1-R17 | **Invalid address.** A source or state the catalogue does not know, a number per page other than 10, 20, 50 or 100, or an unreadable way of starting, period or page is left out, and its default applies. A page beyond the last shows the last page; a page below 1 shows the first. The page shows no error. (owner, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T1-AC01 | (R01) The navigation of each page with navigation has a link "Synchronizacje" that opens the page; the page has "Odśwież". | Automated test of the page's rendering |
| T1-AC02 | (R02, R03, R04) With stored syncs of several sources, both ways of starting and every state, period "all" lists all of them from the most recently requested, grouped by day in Polish time, each row with time, source, result and state label and with no way of starting or scope; a day split between pages repeats its heading. | Automated test of the history read and of the grouping |
| T1-AC03 | (R06) For a sync whose ads include some this source showed in an earlier sync and some it never showed, new counts only the latter, and changed counts the known ads whose content changed; this holds for syncs stored before the task. | Automated test on a real database |
| T1-AC04 | (R05, R13) A queued sync shows "Czeka na start"; a running one the ads found so far; a finished one "+N nowe" and "N zmienione"; the details of a queued or running sync show "—" for new and changed. | Automated test of the page's rendering |
| T1-AC05 | (R07) Each state has its icon and tooltip text; the tooltip's position keeps 16 px from every window edge, also for a label at the right edge. | Automated test of the label and of the tooltip's positioning |
| T1-AC06 | (R08) Each filter narrows the list as T1-R08 says, an empty multi-choice means all, the multi-choice lists apply on closing, the default is the last 7 days, the period boundaries follow Polish calendar days, and "Wyczyść filtry" appears only off the default and restores it; a changed filter shows page 1. | Automated test of the history read and of the filter logic |
| T1-AC07 | (R09) 10, 20, 50 and 100 per page work, 20 is the default, a change shows page 1, and "Wyczyść filtry" keeps it; the page list filters by typed digits, Backspace restores the previous list, Enter opens the first page shown, Escape closes it. | Automated test of the paging logic |
| T1-AC08 | (R10, R16) An address with filters, page, number per page and an open sync gives the same view; an address naming a missing sync gives the list without details. | Automated test of the address logic and the details read |
| T1-AC09 | (R11) With no matching sync the page shows the text of T1-R11. | Automated test of the page's rendering |
| T1-AC10 | (R12, R14, R15) The details show the way-of-starting icon with its tooltip, state, numbers, the course without an attempt number, and for Niepełna and Nieudana the generic sentence with the stored error and diagnostics folded below as text; Escape closes them. | Automated test of the page's rendering |
| T1-AC11 | (R17) An address with an unknown source, an unknown state, an unreadable way of starting and period, 30 per page and page 999 shows the default for each, 20 per page and the last page, without an error; page 0 shows the first. | Automated test of the history read |
| T1-AC12 | Removed (2026-11-22): merged into T1-AC04. | — |

<a id="t2"></a>

## T2. Ads marked unavailable (`oferty-pracy-nq3.2`)

Depends on: T1.

### Scope

Recording, for each complete sync of a source that marks unavailable ads, how many ads it marked unavailable at the source, and showing that number in the history. Out of scope: which sources mark unavailable ads.

### Requirements

| ID | Requirement |
| --- | --- |
| T2-R01 | **What is counted.** The number of ads that this sync changed from available to unavailable at the source. An ad already unavailable before the sync is not counted again. (owner, 2026-11-22) |
| T2-R02 | **Complete syncs.** A complete sync of a source that marks unavailable ads records the number, 0 included; the row shows "N niedostępne" next to new and changed, and the details show it as a fourth number. (owner, 2026-11-22) |
| T2-R03 | **Incomplete and failed syncs.** An incomplete or failed sync of such a source marks nothing; the row and the details show "—" with the tooltip "Tylko pełna synchronizacja oznacza ogłoszenia jako niedostępne". This applies also to such syncs from before this task. (owner, 2026-11-22) |
| T2-R04 | **Complete syncs from before this task.** A complete sync of such a source that finished before this task shows "—" with the tooltip "Liczone od <date of the first recorded number, as DD.MM.RRRR>", or "Liczone od wdrożenia tej funkcji" while no sync has recorded one. (owner, 2026-11-22) |
| T2-R05 | **Ads that return.** An ad marked unavailable that appears again in a later sync is not counted in that sync as marked unavailable, and is not new (T1-R06). (owner, 2026-11-22) |
| T2-R06 | **Kept: what is marked.** Only a complete sync of a source that marks unavailable ads marks ads unavailable, and it marks the ads of the scope that earlier syncs saw and this sync did not; marking and the sync's final state are saved together or not at all. |
| T2-R07 | **Other sources.** A source that does not mark unavailable ads shows no unavailable count in the row and "nie dotyczy" in the details. (owner, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T2-AC01 | (R01, R02) A complete sync of such a source that misses two available ads and one ad already unavailable records 2, and the row and details show "2 niedostępne". | Automated test on a real database; automated test of the page's rendering |
| T2-AC02 | (R02) A complete sync that misses no ad records 0 and shows "0 niedostępne". | Automated test on a real database |
| T2-AC03 | (R03) An incomplete and a failed sync of such a source mark nothing and show "—" with the tooltip of T2-R03. | Automated test on a real database; automated test of the page's rendering |
| T2-AC04 | (R04) A complete sync finished before the task shows "—" with the tooltip of T2-R04, with the date and with the text used while none is recorded. | Automated test of the history read and of the page's rendering |
| T2-AC05 | (R06) When saving the final state fails, neither the marking nor the count is saved. | Automated test on a real database |
| T2-AC06 | (R05) An ad marked unavailable by one complete sync and seen again by the next is counted neither as marked unavailable nor as new in the next. | Automated test on a real database |
| T2-AC07 | (R07) A sync of a source that does not mark unavailable ads shows no count in the row and "nie dotyczy" in the details. | Automated test of the page's rendering |

<a id="t3"></a>

## T3. Starting syncs from the panel (`oferty-pracy-nq3.3`)

Depends on: T1.

### Scope

Requesting a sync of one, several or all enabled sources from the page "Synchronizacje", and requesting a sync again from its details. Out of scope: a choice of scope (collection task item 37), cancelling a queued sync (item 39), refreshing by itself (item 48), removing the import form from the offer list (T5).

### Requirements

| ID | Requirement |
| --- | --- |
| T3-R01 | **Buttons.** The page has "Synchronizuj wszystkie" and "Wybierz źródła". Both open the same dialog listing every catalogue source; "Synchronizuj wszystkie" opens it with every enabled source that has no unfinished sync checked, "Wybierz źródła" with nothing checked. The confirming button "Synchronizuj" is inactive while nothing is checked. (owner, 2026-11-22; mock-up) |
| T3-R02 | **Sources in the dialog.** A source with an unfinished sync is marked "już trwa" and cannot be checked. A disabled source is greyed out with "Wyłączone w konfiguracji aplikacji" and cannot be checked. (owner, 2026-11-22; mock-up) |
| T3-R03 | **Fixed scope.** Every sync requested from the panel searches PHP · senior, for every source; the panel offers no choice of scope. The limits of the Polish portals stay: at most 50 ads, 5 pages and 60 requests per sync. (owner, 2026-11-21, 2026-11-22) |
| T3-R04 | **One unfinished sync per source.** A request for a source that already has an unfinished sync creates no second one; it counts as "już trwało". This holds when the other sync started after the dialog opened, from the schedule or the command line included. (owner, 2026-11-22) |
| T3-R05 | **Source disabled meanwhile or unknown.** A checked source that is disabled by the time the owner confirms is skipped and counted as skipped, and so is a source the catalogue does not know; neither shows an error. (owner, 2026-11-22) |
| T3-R06 | **Not requested.** When a sync of a source cannot be requested for any other reason, the queue's refusal included, the page says "Nie udało się zlecić synchronizacji: N." with the number of such sources; syncs requested successfully in the same confirmation stay requested. (owner, 2026-11-22) |
| T3-R07 | **After confirming.** The page shows "Zlecono: N · już trwało: M · pominięto: K" and reads the list once with the state filter set to W kolejce and W toku and the other filters at their defaults. It does not refresh afterwards by itself. (owner, 2026-11-22) |
| T3-R08 | **Uruchom ponownie.** The details of a finished sync of an enabled source offer "Uruchom ponownie". It requests a sync of that source at once, without a dialog, reads the list again and opens the details of the new sync; when the source already has an unfinished sync, it opens the details of that one. The details of an unfinished sync, or of a disabled source, do not offer it. (owner, 2026-11-22) |
| T3-R09 | **Way of starting.** A sync requested from the panel is started "ręcznie". (owner, 2026-11-22) |
| T3-R10 | **Kept: other ways of starting.** SOLID.Jobs, Himalayas, the JobSpy portals and the Polish portals can still be started from the command line, and SOLID.Jobs still starts daily from the schedule. (owner, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T3-AC01 | (R01) "Synchronizuj wszystkie" opens the dialog with every enabled source without an unfinished sync checked; "Wybierz źródła" with none checked and "Synchronizuj" inactive until one is. | Automated test of the dialog's logic |
| T3-AC02 | (R02) In the dialog a source with an unfinished sync shows "już trwa" and a disabled source "Wyłączone w konfiguracji aplikacji"; neither can be checked. | Automated test of the dialog's logic |
| T3-AC03 | (R03, R09) A sync requested from the panel, for any source, searches PHP · senior and is started ręcznie; a Polish portal keeps its limits. | Automated test |
| T3-AC04 | (R04) Requesting a source that already has an unfinished sync, including one started after the dialog opened, creates no new sync and counts it as "już trwało". | Automated test on a real database |
| T3-AC05 | (R05) A checked source disabled before confirming, and a source the catalogue does not know, are skipped and counted as skipped, without an error. | Automated test |
| T3-AC06 | (R06) When the queue refuses one of three requests, the page shows the message of T3-R06 with N = 1, and the other two syncs exist. | Automated test |
| T3-AC07 | (R07) After confirming, the page shows the summary of T3-R07 and reads the list once with the state filter W kolejce and W toku and the other filters at defaults. | Automated test of the page's logic |
| T3-AC08 | (R08) "Uruchom ponownie" in a finished sync's details requests a new sync of that source and opens its details; with an unfinished sync of that source it opens that sync; it is absent for an unfinished sync and for a disabled source. | Automated test of the request and of the page's logic |
| T3-AC09 | (R10) Starting from the command line and the daily SOLID.Jobs schedule still request syncs. | Automated test |

<a id="t4"></a>

## T4. Source health (`oferty-pracy-nq3.4`)

Depends on: T1, T3.

### Scope

A summary strip above the history and a warning about sources that have not been checked in full for days or keep failing. Out of scope: which sources can never be synced completely (collection task item 36), refreshing by itself (item 48), thresholds the owner sets.

### Requirements

| ID | Requirement |
| --- | --- |
| T4-R01 | **Queued or running.** The strip shows "W kolejce lub w toku" with the number of unfinished syncs of every catalogue source. It is not clickable. (owner, 2026-11-22) |
| T4-R02 | **Latest sync failed or incomplete.** The strip shows "Ostatnia synchronizacja nieudana lub niepełna" with the number of enabled sources whose latest finished sync is Niepełna or Nieudana. It is not clickable. (owner, 2026-11-22) |
| T4-R03 | **New in 24 h.** The strip shows "Nowe w 24 h" with the sum of new ads (T1-R06) of the syncs of every catalogue source that finished in the 24 hours before the strip was read. It is not clickable. (owner, 2026-11-22) |
| T4-R04 | **Without a complete sync.** An enabled source is listed under "Bez pełnej synchronizacji od 3 dni" when its latest complete sync finished more than 72 hours before the strip was read, or when it never had one; the latter shows "nigdy". (owner, 2026-11-22) |
| T4-R05 | **Failing in a row.** An enabled source is listed with "3 nieudane z rzędu" when its three latest finished syncs are all Nieudana; a Niepełna sync breaks the run. A source meeting both T4-R04 and this requirement is listed once, with both reasons. (owner, 2026-11-22) |
| T4-R06 | **The warning list.** Sources are listed by name, alphabetically. It shows at most 3 names; the rest is behind "i N innych", which expands the list in place. A click on a name sets the history's source filter to that source, the period to all and the other filters to their defaults. With no source to list, the warning is not shown. (owner, 2026-11-22; mock-up) |
| T4-R07 | **When it changes.** The strip and the warning are read again every time the list is read: on opening, on a changed filter or page, on "Odśwież" and after a request of T3. They do not depend on the history's filters and do not refresh by themselves. (owner, 2026-11-22) |
| T4-R08 | **Fixed thresholds.** 3 days and 3 failed syncs are fixed; the panel offers no setting. Disabled sources are never listed in the warning or counted in T4-R02. (owner, 2026-11-21, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T4-AC01 | (R01, R07) With two queued and one running sync, one of them of a disabled source, "W kolejce lub w toku" shows 3; it is not clickable; a changed history filter does not change it. | Automated test of the read and of the page's rendering |
| T4-AC02 | (R02, R08) With one enabled source whose latest finished sync is Nieudana, another whose latest is Niepełna, and a disabled source whose latest is Nieudana, the second count shows 2. | Automated test of the read |
| T4-AC03 | (R03) "Nowe w 24 h" sums new ads of syncs finished within 24 hours, those of a disabled source included, and leaves out one finished 25 hours ago. | Automated test of the read |
| T4-AC04 | (R04, R08) A source with its latest complete sync 73 hours ago and one with none are listed, the latter with "nigdy"; one with a complete sync 71 hours ago is not; a disabled source is never listed. | Automated test of the read |
| T4-AC05 | (R05) A source with three Nieudana in a row is listed with "3 nieudane z rzędu"; one with Nieudana, Niepełna, Nieudana is not; a source meeting both conditions appears once with both reasons. | Automated test of the read |
| T4-AC06 | (R06) With five sources to list, three names in alphabetical order and "i 2 innych" show, and expanding shows all five; a click on a name gives the history filter of that source with period all; with none, no warning shows. | Automated test of the page's logic |
| T4-AC07 | (R07) Each read of the list reads the strip again. | Automated test of the page's logic |

<a id="t5"></a>

## T5. Offer list without sync information (`oferty-pracy-nq3.5`)

Depends on: T3, T4.

### Scope

Removing from the offer list every piece of information about syncs, the Polish portals' import form and the list's refreshing by itself. Out of scope: facts about an offer itself, such as its source and its availability at the source.

### Requirements

| ID | Requirement |
| --- | --- |
| T5-R01 | **Summary removed.** The offer list no longer shows "SOLID.Jobs — ostatni pełny import" with its date. "Odśwież widok" stays and reloads the offers. (owner, 2026-11-22) |
| T5-R02 | **Incomplete-import notice removed.** The offer list no longer shows "Ostatni import był niepełny…". (owner, 2026-11-22) |
| T5-R03 | **JobSpy section removed.** The offer list no longer shows "Źródła JobSpy". (owner, 2026-11-22) |
| T5-R04 | **Polish portals' section removed.** The offer list no longer shows "Polskie serwisy — pobieranie ofert": the technology and level fields, the import buttons, the latest import of each portal and the description of limits. The browser can request a sync only from the panel (T3). (owner, 2026-11-22) |
| T5-R05 | **No refreshing by itself.** The offer list never reloads by itself, also while an AI assessment is waiting; the owner reloads it with "Odśwież widok" or by reloading the page. (owner, 2026-11-22) |
| T5-R06 | **Kept: facts about an offer.** The availability filter ("Widziane w źródle", "Niedostępne w źródle"), the label "Niedostępna w źródle" in the list and the details, the source of each offer, the line "Źródło przy każdej ofercie" and "Otwórz w … ↗" in the details stay. (owner, 2026-11-22) |
| T5-R07 | **Sync state from the browser.** The browser can no longer read the state of the JobSpy portals and the Polish portals apart from the panel; the command line keeps its status commands. (owner, 2026-11-22) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T5-AC01 | (R01–R04) The offer list shows none of: the SOLID.Jobs summary, the incomplete-import notice, "Źródła JobSpy", "Polskie serwisy — pobieranie ofert"; "Odśwież widok" reloads the offers. | Automated test of the page's rendering |
| T5-AC02 | (R04) A request of a Polish portal's sync sent the way the removed form sent it is refused and creates no sync. | Automated test |
| T5-AC03 | (R05) The offer page sets no timer that reloads it, also with an AI assessment waiting. | Automated test of the page's logic |
| T5-AC04 | (R06) The availability filter, the "Niedostępna w źródle" label, the source of an offer and "Otwórz w … ↗" still work. | Automated test of the offer read and of the page's rendering |
| T5-AC05 | (R07) Requests for the removed state of the JobSpy and Polish portals are refused; a Polish portal started from the command line still syncs (T3-R10). | Automated test |
