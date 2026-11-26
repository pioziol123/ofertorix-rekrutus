# Applications list — requirements

Epic `oferty-pracy-lq3`. Goal and scope: [PRD](PRD.md). Technical design: [solution design](solution-design.md). Terms follow the [glossary](../../../GLOSSARY.md). Every rule below was decided by the owner on 22–26 November 2026 unless marked otherwise.

Labels shown in the application are in Polish and quoted.

## Shared rules

Every task of the epic follows these rules. Tasks cite them by ID.

### Stages and transitions

| ID | Requirement |
| --- | --- |
| A-R01 | **Application.** An offer has at most one application. An application belongs to one offer and is never deleted. |
| A-R02 | **Stages.** An application is in exactly one stage: "Do rozważenia" (to consider), "CV wysłane" (CV sent), "Odrzucone" (rejected) or "Zdjęta z listy" (removed from the list). "Odrzucone" covers both a company turning the owner down and the owner giving up. "Zdjęta z listy" is the only way to undo a first save, since an application is never deleted. |
| A-R03 | **Transitions.** The owner moves an application only along these transitions. "No application" means the offer has none yet. A step back, such as from "CV wysłane" to "Do rozważenia", is how the owner undoes a mistake; there is no separate undo. <br>• No application → "Do rozważenia", "CV wysłane" or "Odrzucone"; the move creates the application. <br>• "Do rozważenia" → "CV wysłane", "Odrzucone" or "Zdjęta z listy". <br>• "CV wysłane" → "Odrzucone" or "Do rozważenia". Not to "Zdjęta z listy": once the CV is sent, giving up is "Odrzucone". <br>• "Odrzucone" → "Do rozważenia", "CV wysłane" or "Zdjęta z listy"; the owner chooses. <br>• "Zdjęta z listy" → "Do rozważenia", "CV wysłane" or "Odrzucone". |
| A-R04 | **Stage choice.** Wherever an offer's stage can be changed, one stage field shows the current stage and, when opened, lists exactly the stages A-R03 allows from it, by their labels from A-R02. Choosing one moves the application at once, without a confirmation. |
| A-R05 | **Stage moment and stage date.** The stage moment is the moment the owner moved the application into its current stage; the stage date is the calendar day of that moment in Polish time, as the pages show it. The owner never enters either. |
| A-R06 | **History of stages.** Every move is recorded with its stage and moment; a record is never changed or removed, and an undo is a new record. Only the application details show it (T2-R11). |
| A-R07 | **Stale view.** When the application's stage changed since the owner's page showed it, a move the page offers is refused with the message "Etap tej aplikacji się zmienił — odśwież stronę", and nothing is saved. This also holds when the page showed no application and one now exists. A choice of the stage the application already has is not refused (A-R13). |
| A-R08 | **Independence.** A change of an ad, its unavailability or expiry at the source, and a change of a match assessment never change an application's stage. |

### Note

| ID | Requirement |
| --- | --- |
| A-R09 | **Note.** An application has one free-text note of at most 10 000 characters, empty at first. The owner edits it in any stage, "Odrzucone" and "Zdjęta z listy" included. Saving replaces the previous text, which is not kept (a deliberate exception to the principle that nothing is lost). Editing the note does not change the stage or its date. |
| A-R10 | **Note too long.** A note over 10 000 characters is not saved; the owner sees the message "Notatka może mieć najwyżej 10 000 znaków" and keeps the typed text in the field. |
| A-R11 | **Note from two pages.** When the note is saved from two pages, the later save wins. |
| A-R12 | **Note belongs to the application.** An offer without an application has no note; the owner writes a note only once the offer has an application, in any of its stages. The note is shown and edited only in the application details (T2), never in offer details. |
| A-R14 | **One label per state.** Every page uses the same label for a state: the four labels of A-R02, and "Bez aplikacji" for an offer without an application. A state also has one icon and colour wherever it is shown with an icon (T2-R13, T3-R01). |
| A-R13 | **Same choice twice.** Choosing the stage the application is already in, for example a retry after a lost connection or the same choice from a second page, counts as done: nothing is recorded and no message is shown. |

### Criteria of the shared rules

Each criterion is met by the task named in its last column.

| ID | Criterion | How it is checked |
| --- | --- | --- |
| A-AC08 | (A-R13) Choosing the current stage again records no stage change, keeps the stage date and returns success. T1. | Automated test on a real database |
| A-AC01 | (A-R01–A-R03, A-R05, A-R06) Every transition of A-R03 succeeds and every other pair of stages, "CV wysłane" → "Zdjęta z listy" included, is refused without a change; the first move of an offer creates its application and a second move never creates another one; each move records its stage and moment. T1. | Automated test on a real database |
| A-AC06 | (A-R03, A-R04) For each stage, and for no application, the stage field lists exactly the stages A-R03 allows from it. T1. | Automated unit test of the stage rules |
| A-AC09 | (A-R01, A-R07, A-R13) Run at the same time: two first moves of one offer to different stages create one application and the other is refused with the message of A-R07; two first moves to the same stage create one application and both succeed; two moves from one stage to different stages apply one and refuse the other with that message. T1. | Automated test on a real database with parallel calls |
| A-AC10 | (A-R09, A-R11) A move and a note save of one application run at the same time both take effect. T2. | Automated test on a real database with parallel calls |
| A-AC11 | (A-R14) Every page shows "Bez aplikacji" for an offer without an application and the labels of A-R02 for the stages, "Zdjęta z listy" also in the stage filter. T1 for offer details, T2 for Moja lista, T3 for the offer list. | Automated test of the rendered pages |
| A-AC07 | (A-R12) Saving a note for an offer without an application is refused and creates no application. T2. | Automated test on a real database |
| A-AC02 | (A-R07) A move sent with a stage that is no longer current, including "no application" when one exists, is refused with the message of A-R07 and saves nothing. T1. | Automated test on a real database; automated test of the route |
| A-AC03 | (A-R09–A-R11) A note of 10 000 characters is saved in each stage; one of 10 001 is refused with the message of A-R10 and the stored note stays; a later save replaces an earlier one; saving the note leaves the stage and its date as they were. T2. | Automated test on a real database |
| A-AC04 | (A-R01, A-R05, A-R09) After the server restarts, stages and their moments are the same as before (T1), and so are notes (T2). | Automated test on a real database |
| A-AC05 | (A-R08) Marking an ad unavailable at the source and recording a new match assessment leave the application's stage and date as they were. T1. | Automated test on a real database |

## T1 — The application in offer details

Task `oferty-pracy-lq3.1`. Scope: the stages and transitions of the shared rules, the history of stages, and the stage field in offer details. Out of scope: the note and the application details (T2), the page Moja lista (T2), the offer list (T3). The task also creates the Recruitments module and its stored data, which later tasks build on.

| ID | Requirement |
| --- | --- |
| T1-R01 | **Stage in details.** Offer details show the stage field of A-R04. It shows the application's stage label from A-R02, "Zdjęta z listy" included, or "Bez aplikacji" when the offer has no application (A-R14). Offer details show no note, no history and no stage date. |
| T1-R02 | **Moving in details.** After a choice the details show the new stage without reloading the page. A refused move (A-R07) shows its message next to the field. |

| ID | Criterion | How it is checked |
| --- | --- | --- |
| T1-AC01 | (T1-R01) For an offer in each stage, and with no application, the details show the label of T1-R01 in the stage field and no note. | Automated test of the rendered page |
| T1-AC02 | (T1-R02) Going from no application to "Do rozważenia", "CV wysłane", "Do rozważenia", "Odrzucone", "CV wysłane", "Odrzucone" and "Zdjęta z listy" shows after each choice the chosen stage. | Automated test of the routes on a running server |
| T1-AC03 | (T1-R02, A-R07) A move from a page showing an old stage shows the message of A-R07 and the stage stays. | Automated test of the routes on a running server |

Shared criteria met in this task: A-AC01, A-AC02, A-AC04 (stages), A-AC05, A-AC06, A-AC08, A-AC09, A-AC11 (offer details).

## T2 — The page Moja lista and the application details

Task `oferty-pracy-lq3.2`. Scope: a page listing the offers with an application, the application details with the note and the history of stages, using the shared paging of T4. T2-R08 and T2-AC07 (one paging element) moved to T4 and are not reused. Out of scope: a filter other than the stage, a search.

| ID | Requirement |
| --- | --- |
| T2-R01 | **Page and navigation.** The application has a page "Moja lista", reached from a link "Moja lista" in the navigation of every page that has the navigation. |
| T2-R02 | **Rows.** Each row shows the offer's title, its company, the stage label of A-R02, a mark "Niedostępna w źródle" when its ad is unavailable at the source, and a column "Ostatnia zmiana etapu" with the date of its current stage (A-R05) as DD.MM.RRRR in Polish time. A click on a row opens the application details (T2-R09). Rows have no stage field. |
| T2-R03 | **Stage switch.** A single choice above the list: "Aktywne" (default; "Do rozważenia" and "CV wysłane"), "Wszystkie" (every stage except "Zdjęta z listy"), "Do rozważenia", "CV wysłane", "Odrzucone". An application in "Zdjęta z listy" never appears as a row. Changing the choice goes back to page 1. |
| T2-R04 | **Order.** Rows are ordered from the most recent stage change. Editing a note does not change the order. Rows with the same moment keep one fixed order between reads. |
| T2-R05 | **Pages.** The page uses the shared paging of T4, which behaves as on the page "Synchronizacje" ([nq3 T1-R09](../nq3-panel-synchronizacji/requirements.md)): "Poprzednia", "Strona X z Y" with its list of page numbers, "Następna", and 10, 20, 50 or 100 rows per page, 20 by default; a changed number goes back to page 1. |
| T2-R06 | **Address.** The stage choice, the page, the number per page and the open application live in the page's address, so reloading or sharing it shows the same view. A stage choice or number per page the page does not know is replaced by its default; a page beyond the last shows the last, a page below 1 the first; an open application that does not exist shows the list without details. The page shows no error for them. |
| T2-R07 | **Empty list.** When no application matches the choice, the page says "Brak ofert na liście dla wybranego etapu". |
| T2-R09 | **Application details.** The application details open in a drawer over the page, like the details of the page "Synchronizacje". They show the offer's title, company, salary range as the offer list shows it, the mark "Niedostępna w źródle" when it applies, the stage field of A-R04, the note with a button "Zapisz notatkę", the history of stages and a link "Otwórz ofertę" to the offer's details on the offer list. Closing the drawer, or Escape, returns to the list. |
| T2-R10 | **Moving in the application details.** After a choice the details stay open on the application and show the new stage and the history its new record, and the list is read again, without reloading the page. When the new stage is outside the current stage choice, the row leaves the list while the details stay open; when that empties the current page, the list shows the last page that exists. A refused move (A-R07) shows its message next to the field. |
| T2-R11 | **History of stages.** "Historia etapów" lists every stage change of the application from the newest, each as date and time in Polish time (DD.MM.RRRR HH:mm) and the stage label, without pages. |
| T2-R12 | **From offer details.** Offer details of an offer with an application, in any stage, "Zdjęta z listy" included, have a link "Szczegóły aplikacji" that opens Moja lista with that application's details. The details open even when the application is not a row of the current view. |
| T2-R13 | **Layout.** Moja lista is a table with one date per row, not grouped by day. Each stage label on the page and in the history carries the icon and colour of T3-R01, the same wherever a stage is shown, the stage field in offer details (T1) included, to which this task adds the icons; "Zdjęta z listy" gets its own neutral icon. Under the note a counter shows the number of characters typed and the limit, as "123 / 10 000". (owner, 2026-11-26, mock-up docs/prototypes/moja-lista) |

| ID | Criterion | How it is checked |
| --- | --- | --- |
| T2-AC01 | (T2-R01) The navigation of each page with navigation has a link "Moja lista" that opens the page. | Automated test of the rendered page |
| T2-AC02 | (T2-R02) A row shows title, company, stage label, the unavailability mark only for an ad unavailable at the source, and the date of the current stage as DD.MM.RRRR in Polish time, also for a move made just after midnight Polish time. | Automated test of the read and of the shown text |
| T2-AC03 | (T2-R03) With applications in all four stages, each choice lists exactly the stages T2-R03 names, the default is "Aktywne", and "Zdjęta z listy" appears under no choice. | Automated test on a real database |
| T2-AC04 | (T2-R04) After moves at different moments and a later note edit, rows are ordered by the moment of the current stage, newest first, and the note edit changes nothing; two reads of the same state give the same order. | Automated test on a real database |
| T2-AC05 | (T2-R05, T2-R06) 10, 20, 50 and 100 per page work, 20 is the default, a change of number or stage shows page 1; an address with an unknown stage choice, 30 per page and page 999 shows "Aktywne", 20 per page and the last page without an error; page 0 shows the first; an address naming a missing application shows the list without details. | Automated test of the read and of the address logic |
| T2-AC06 | (T2-R07) With no matching application the page shows the text of T2-R07. | Automated test of the rendered page |
| T2-AC08 | (T2-R09, T2-R11) The details of an application with three stage changes show title, company, salary range, the stage field, the note, the three changes newest first with date and time in Polish time, and the link "Otwórz ofertę" leading to that offer. | Automated test of the reads and of the shown text |
| T2-AC09 | (T2-R10, A-R07) A choice in the details shows the new stage and a new history record; a choice from details showing an old stage shows the message of A-R07 and changes nothing. | Automated test of the routes on a running server |
| T2-AC12 | (T2-R10) Under "Aktywne", moving the only row of the last page to "Odrzucone" keeps the details open on it with "Odrzucone", removes the row and shows the previous page. | Automated test of the page logic |
| T2-AC13 | (T2-R02, T2-R09) A click on a row opens its details; closing them or pressing Escape returns to the list. | Automated test of the page logic |
| T2-AC10 | (T2-R12) Offer details of an offer in "Zdjęta z listy" have the link "Szczegóły aplikacji", which opens Moja lista with its details; an offer without an application has no such link. | Automated test of the rendered page |
| T2-AC11 | (T2-R13) Rows are not grouped by day; each stage label shows its icon; typing in the note updates the counter "N / 10 000". | Automated test of the rendered page and of the counter text |

Shared criteria met in this task: A-AC03, A-AC04 (notes), A-AC07, A-AC10, A-AC11 (Moja lista).

## T3 — The stage on the offer list

Task `oferty-pracy-lq3.3`. Scope: a stage icon on each offer of the offer list and a filter by stage. Out of scope: the offer list's own paging (collection task `oferty-pracy-sz5`), a filter "saved / not saved" other than this one.

| ID | Requirement |
| --- | --- |
| T3-R01 | **Stage icon on the list.** Each offer of the list in "Do rozważenia", "CV wysłane" or "Odrzucone" shows one icon of its stage, with the stage label of A-R02 as its tooltip and accessible name: a bookmark for "Do rozważenia", a paper plane for "CV wysłane", a crossed circle for "Odrzucone". An offer without an application and an offer in "Zdjęta z listy" show no icon: a removed offer looks like one never saved. |
| T3-R02 | **Information only.** The offer list offers no way to change a stage; the owner changes it in offer details (T1). |
| T3-R03 | **Stage filter.** The offer list has a filter "Etap aplikacji" with several choices: "Bez aplikacji" (offers that never had an application), "Do rozważenia", "CV wysłane", "Odrzucone", "Zdjęta z listy". It uses the shared multi-choice filter of T4, which behaves as on the page "Synchronizacje" ([nq3 T1-R08](../nq3-panel-synchronizacji/requirements.md)): a choice applies when the list closes, and nothing chosen means all offers. |
| T3-R04 | **Filter with the others.** The stage filter combines with every other filter of the offer list: an offer is shown when it meets all of them. It applies before sorting, counting and paging, and changing it goes back to page 1. |
| T3-R05 | **Address.** The stage choices live in the list's address with the other filters. A stage the list does not know is left out without an error. |

| ID | Criterion | How it is checked |
| --- | --- | --- |
| T3-AC01 | (T3-R01, T3-R02) On the rendered offer list an offer in "Do rozważenia", "CV wysłane" and "Odrzucone" shows the icon of T3-R01 with its label, an offer without an application and one in "Zdjęta z listy" show none, and no row has a stage field. | Automated unit test of the icon choice; automated test of the rendered page |
| T3-AC02 | (T3-R03) With offers in every stage and without application, each single choice lists exactly its offers; two choices list the offers of either; nothing chosen lists all; "Bez aplikacji" leaves out an offer in "Zdjęta z listy". | Automated test of the filter logic |
| T3-AC03 | (T3-R04) The stage filter together with another filter shows only offers meeting both, the total count and the number of pages follow the filtered list, and changing the stage filter shows page 1. | Automated test of the filter logic |
| T3-AC04 | (T3-R05) An address with two stages and an unknown one shows the two stages chosen and no error. | Automated test of the filter parsing |
| T3-AC05 | (T3-R04) Reading the offer list takes the same number of database queries with 0, 1 and 50 applications, as the architecture rules require of a view that reads another module (views ask each module as rarely as they can). | Automated test on a real database counting queries |

Shared criteria met in this task: A-AC11 (offer list).

## T4 — Shared paging and multi-choice filter

Task `oferty-pracy-lq3.4`, after `oferty-pracy-nq3.1`. Scope: the paging and the multi-choice filter built for the page "Synchronizacje" become elements every page can use; the page "Synchronizacje" moves to them. Out of scope: moving the offer list's own paging (collection task `oferty-pracy-sz5`), any change of behaviour.

| ID | Requirement |
| --- | --- |
| T4-R01 | **Shared paging.** One paging element, used by the page "Synchronizacje", behaves as nq3 T1-R09 says: "Poprzednia", "Strona X z Y" with its list of page numbers and typing of digits, "Następna", 10, 20, 50 or 100 per page, 20 by default, a changed number going back to page 1. |
| T4-R02 | **Shared multi-choice filter.** One multi-choice filter element, used by the page "Synchronizacje", behaves as nq3 T1-R08 says for its multi-choice lists: a choice applies when the list closes, and nothing chosen means all. |

| ID | Criterion | How it is checked |
| --- | --- | --- |
| T4-AC01 | (T4-R01) After the move, the page "Synchronizacje" meets nq3 T1-AC07. | The existing automated tests of that criterion |
| T4-AC02 | (T4-R02) After the move, the page "Synchronizacje" meets the multi-choice part of nq3 T1-AC06. | The existing automated tests of that criterion |
| T4-AC03 | (T4-R01, T4-R02) The page "Synchronizacje" keeps no paging or multi-choice code of its own; it uses the shared elements. | Review of the change |

## Open questions

None.
