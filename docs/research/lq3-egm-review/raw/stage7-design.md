# Stage 7 — design critique (Design Critic Goldfish), epic oferty-pracy-lq3

Scope: PRD.md and requirements.md in docs/specs/lq3-lista-aplikacji/ (solution-design.md and tickets-export.md read for intent only). Standard: feature-spec-standard.md, plus the architecture rules.

Totals: 0 Blockers, 7 Majors, 7 Nits. No Blocker: the transition table, the stale-page protection, the storage contract and the operation set are coherent and testable. The Majors are gaps in requirements and PRD, not flaws in the design.

## 🟡 Major

### M1. An application whose offer is gone has no requirement (requirements.md T2-R02 l.73, T2-R09 l.80; solution-design.md l.34, l.66)
- Discrepancy: the SD stores `offer_id` with no foreign key (D7) and says "an item whose offer is missing from the answer shows its stage only" (SD l.66). No requirement or criterion covers that row. T2-R02 requires title, company and a click that opens details; T2-R09 requires title, company, salary range and a link "Otwórz ofertę". A-R01 says an application is "never deleted".
- Rationale: behaviour is fixed only in the SD, and its acceptance is untestable from requirements, so the runner may or may not build it. A-R01's "never deleted" and the absent FK mean the offer's lifecycle (deleted ads, the 10 000-ad cap mentioned in the SD's accepted costs) can orphan applications. The spec should say either that offers are never removed (and cite where that is guaranteed), or what the row shows and where the link leads. Add one criterion.

### M2. What the drawer and the list do after a move that takes the row out of the current view is unspecified (requirements.md T2-R10 l.81, T2-R12 l.83, T2-R03 l.74, T2-R06 l.77)
- Discrepancy: T2-R10 says "the details and the row show the new stage". But in view "Aktywne", a move to "Odrzucone" or "Zdjęta z listy" removes the row, and T2-R12 already allows details for an application that is not a row. The SD (l.67) only says "the page reads the details and the list page again". Open points:
  - Does the drawer stay open, and does the address `offer` stay?
  - Does the list page number change, or the total shrink so the current page becomes empty or out of range?
  - Does the row disappear under the owner's hands?
- T2-AC09 checks only the shown stage and the history record.
- Rationale: this is the main flow of the page (moving from the drawer), and the first and most common move leaves the filter. Add a rule (for example: the drawer stays open with the new stage, the list re-reads and clamps the page as T2-R06 does) and a criterion.

### M3. T2 and T3 are blocked by an unfinished task and carry paging machinery beyond what a personal shortlist needs (PRD.md l.27, l.35, l.52-53; requirements.md T2-R05, T2-R08, T2-AC05, T3-R03)
- Discrepancy: the tickets export shows `oferty-pracy-nq3.1` in progress (◐). The SD admits that its paging and multi-choice elements "are not in `main` yet" (SD l.99). The only risk in the PRD (l.39-41) is offer grouping. The dependency is in the PRD's Stages section but not in its Risks section. The requirements demand page sizes 10/20/50/100, a page-number list, address normalisation and a refactor of the Synchronizacje page (T2-R08), for a list that the SD itself says holds "far fewer" applications than offers (SD D3).
- Rationale: for an MVP, two of three tasks wait on another epic's UI work and add a regression surface (changing the Synchronizacje page). Options to record: (a) accept the dependency explicitly as a PRD risk, with the fallback if nq3.1 slips; or (b) let T2 ship a simple list (no size selector, a fixed 50 rows, no page-number list) and take the shared paging when nq3.1 lands. The PRD or SD should say which, and why the shared paging is worth the coupling now.

### M4. The PRD describes behaviour the requirements contradict or silently narrow (PRD.md l.28-29, l.47; requirements.md T3-R01 l.106, T2-R03 l.74, T2-R12 l.83)
- Discrepancy:
  - PRD l.29: "an icon of the stage at each offer with an application". T3-R01: no icon for an offer in "Zdjęta z listy", although it has an application.
  - PRD l.28: Moja lista "lists the offers with an application". T2-R03: an application in "Zdjęta z listy" never appears, in any view.
  - A removed application's note and history are therefore reachable only through the link "Szczegóły aplikacji" in offer details. The PRD says nothing of this.
- Rationale: a reader of the PRD alone builds the wrong list. The PRD should state in one line that removed applications leave the list and the icons and are reachable only from offer details (and by the filter "Zdjęte z listy").

### M5. Implementation constraints and an untestable criterion sit in the requirements (requirements.md T2-R08 l.79, T2-AC07 l.93, T3-AC05 l.118, A-AC04 l.46)
- Discrepancy: T2-R08 ("use the same paging element") is a code-structure rule. It duplicates D8 in the SD. Its criterion T2-AC07 is checked by "Review of the change", which is not a test. T3-AC05 (the same number of database queries) is a design guarantee also repeated in the SD's Verification. A-AC04 requires a "new connection pool", which is a test technique.
- Rationale: the owner's rule is that mechanics belong in the solution design. Keep the behavioural half of T2-R08 ("the Synchronizacje paging keeps its behaviour") and move the "one element" and the query-count guarantee to the SD. Otherwise the epic cannot be closed on a verifiable criterion.

### M6. The "at most one application per offer" rule is built on the ad ID, and the PRD risk does not name the collision it will cause (PRD.md l.41, l.57; solution-design.md l.34, l.98; GLOSSARY.md "Application", "Offer merge")
- Discrepancy: the PRD says that when grouping arrives "applications must move to the grouped offer". But the unique key is the ad ID, so the same job on two portals can today carry two applications, each with an irremovable history (A-R01: never deleted). A merge then has to join two applications under a UNIQUE `offer_id`. The earlier draft (R-22) already says that on merging, the owner indicates "same process or separate". The glossary says "an existing application stays assigned to the offer the owner indicates". The epic provides neither a merge path nor a statement of how two applications are reconciled.
- Rationale: the data being written is irreversible (history never deleted), so the future conflict should be named now, even if solved later. Add to the PRD and SD risks: "two applications of ads later grouped into one offer cannot satisfy A-R01 without an owner decision (keep both as separate applications, which relaxes the UNIQUE key)".

### M7. Last write wins on the note is stated, but its justification, required by the architecture rules, is absent (requirements.md A-R09 l.28, A-R11 l.30; moduly-i-zasady-kodu.md "Data changes while a process runs", rule 1)
- Discrepancy: stage moves carry an expected stage (stale-page protection). The note, the only free text the owner types, has none: two open pages silently overwrite up to 10 000 characters. A-R09 also keeps no history, so the lost text is unrecoverable. The architecture rules say "accepting the consequences of concurrent changes ... requires an explicit justification". A-R11 gives the rule ("the later save wins") with no reason; the SD offers none either.
- Rationale: for a single owner this is acceptable, but add one sentence (single user; a second open page is rare; the owner accepted losing the earlier text), or add an expected-text check like the stage's. A-R09 and A-R11 are also inconsistent in tone with the "nothing is lost" principle that A-R09 admits it breaks.

## 🟢 Nit

### N1. "Wszystkie" does not mean all (requirements.md T2-R03 l.74)
"Wszystkie" excludes "Zdjęta z listy", while T3-R03 has a "Zdjęte z listy" choice. A label that means "all but removed" is misleading. Rename it, or state in T2-R07 and T2-R03 that removed applications are not listed.

### N2. The numbering and the "last column" rule of the shared criteria are off (requirements.md l.34-47)
A-AC08 is listed first and A-AC07 sits in the middle. The sentence "Each criterion is met by the task named in its last column" is not true: the task is at the end of the criterion text, and the last column is "How it is checked".

### N3. The note limit is stated in characters, the SD counts code points (requirements.md A-R09 l.28, A-R10 l.29; solution-design.md l.48)
"10 000 characters" is ambiguous for emoji and combined letters (UTF-16 units against code points against graphemes). The test A-AC03 does not say which. Fix the unit in A-R09, since it is observable behaviour.

### N4. The test for "a move just after midnight Polish time" conflicts with the moment being the database's `now()` (requirements.md T2-AC02 l.88; solution-design.md l.44, l.90-92)
With the moment taken from the database, a test cannot place a move at 00:05 Polish time through the operation. The SD's Verification does not say whether the test seeds rows by SQL or the time source is injectable. State it. Note that `now()` is the transaction start moment, so a move inside the longer Offers transaction (D5) is stamped when the transaction began.

### N5. The alternative to D5/D7 is dismissed with a weak argument (solution-design.md l.21, l.23)
D7 rejects "checking through the Offers module's read" as "a cycle of reads". The cycle appears only if the Recruitments module calls Offers. The page (or the Offers command) could do that check itself, which is what D5 does anyway. The real cost of D5 is a thin Offers write command that owns no data, and two routes (start and move) leaking into the stage field of offer details. Say so, so the trade-off is honest.

### N6. The index and the offer-details read are shaped for scale the epic does not have (solution-design.md l.36, l.50, l.65)
- The index `(stage, stage_changed_at DESC, id DESC)` serves single-stage views but not the default "Aktywne" (`stage IN (…)` sorted), which needs a sort anyway. At tens of rows no index is needed. The architecture rules list "a feature without a consumer" as a cost.
- Offer details load the whole history and note (operation 5) to show only a stage label and a link. The rules allow "somewhat more" data, but this one grows without bound (the SD itself says "all history records").

### N7. Stage meaning of "Odrzucone → CV wysłane" overlaps with a new attempt (requirements.md A-R03 l.17; GLOSSARY.md "Application")
The glossary says another attempt after an ended application may be a new application. A-R03 lets a rejected application return to "CV wysłane" or "Do rozważenia" instead, and the out-of-scope list defers the second application (`oferty-pracy-sz5`). The history keeps both attempts in one record, so a later split into two applications cannot be reconstructed from "stage before rejection", which D2 declines to store. Acceptable for an MVP, but say in the PRD that until sz5 a repeat attempt is a return to an earlier stage.

## Standard compliance notes
- Problem, goals, out of scope, risks, alternatives: present. Alternatives are recorded per decision in the SD (D1-D10) and are mostly concrete. The weak ones are N5 and D8/D9, which are rejected by "owner" without a technical trade-off.
- Risks: the PRD lists one (grouping). The nq3.1 dependency (M3), the grouping collision (M6) and the note overwrite (M7) are missing or under-stated.
- Failure modes: the SD's "Situations every operation answers" table is complete for concurrent, repeated, limit and malformed cases. The missing offer (M1) is the one uncovered situation.
