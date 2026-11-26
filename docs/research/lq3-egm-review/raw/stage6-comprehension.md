# Stage 6 - Comprehension Goldfish (REVIEW)

Scope: PRD.md, requirements.md, solution-design.md (docs/specs/lq3-lista-aplikacji/) and tickets-export.md (lq3, lq3.1-lq3.3). Glossary, code and linked files not read.

## What this proposes

The owner gets a private shortlist of job offers. Any offer can get one "application" in one of four stages: "Do rozwazenia", "CV wyslane", "Odrzucone", "Zdjeta z listy". Stages move only along a fixed transition table, with a step back serving as undo. Every move is stored with its moment and kept forever as history. The application has one free-text note (max 10 000 characters, overwritten on save, no history). Delivery is in three tasks. T1 puts a stage field in offer details, with a new Recruitments module that owns the data. T2 adds a page "Moja lista" with paging shared with "Synchronizacje", plus a drawer with the details, note and history. T3 adds a stage icon and a multi-choice stage filter to the offer list.

## How the existing system works, per this document

There is an offer list and offer details. Each offer is currently one ad fetched from a "source", and ads can become "unavailable at the source". Matches get "assessments". There is a page "Synchronizacje" (epic nq3) whose paging element and multi-choice filter are still in progress and are to be reused. Code is split into modules (Offers, Sources, Companies, and the new Recruitments). Dependencies run one way, Offers -> Recruitments. Pages assemble data from the modules by offer ID. The Offers module keeps the whole catalogue (at most 10 000 ads) in memory and filters it there. Storage is PostgreSQL with raw-SQL migrations, and there is a "Polish time library" for dates. The document does not explain how ads, offers, sources and the catalogue relate, so this paraphrase is partly guessed.

## Findings

No Blocker: every section could be paraphrased.

### Majors

1. **Major - Offer / ad / source / catalogue / match assessment are not defined.**
   - Where: PRD.md l.41, requirements.md A-R08 (l.22), T2-R02 (l.73), solution-design.md l.8, 28, 34, 58.
   - Discrepancy: "Offer" and "ad" are used almost interchangeably ("today each ad is its own offer", `offer_id` is "today the ad ID"). "Source" appears in "unavailable at the source" and "the Sources module". "Match assessment", "expiry at the source" and "catalogue" appear with no inline explanation. The reader cannot tell what "unavailable" means, who sets it, how it differs from "expiry", or whether the Offers module or the Sources module owns the ad.
   - Rationale: The docs only point at a glossary. A-R08 and A-AC05 (tickets lq3.1) depend on these concepts, so an implementer needs at least one sentence each.

2. **Major - Architecture vocabulary used as if known: "view entry", "browser-safe view entry", "Polish time library", "Observed in the Offers module", "shared transaction mechanism", "handler of the module as the Companies module does".**
   - Where: solution-design.md l.7, 28, 44, 53, 69, 86.
   - Discrepancy: Each is a project-specific mechanism with no definition or link. "(Observed in the Offers module)" reads like a label of unknown meaning. The Companies module is cited as precedent twice without saying what it does.
   - Rationale: D10 and "every other place reads them from there" rest on the "view entry" concept. A reader cannot tell what must be built.

3. **Major - Behaviour after a move that makes the row leave the current view is unspecified.**
   - Where: requirements.md T2-R10 (l.81), T2-R03 (l.74), T2-R12 (l.83); solution-design.md l.67.
   - Discrepancy: T2-R10 says "the details and the row show the new stage". With the default "Aktywne" switch, a move to "Odrzucone" or "Zdjeta z listy" removes the row. T2-R03 says "Zdjeta z listy" never appears as a row. Nothing says whether the drawer stays open, how the page count and current page are adjusted, or what happens to the highlighted row. T2-AC09 checks only "shows the new stage".
   - Rationale: This is the most common user path (reject from the drawer) and its observable result is not in the criteria.

4. **Major - Order of validation for the same-stage choice is ambiguous.**
   - Where: solution-design.md l.47 vs requirements.md A-R04 (l.18), A-R13 (l.32), A-AC08 (l.40), A-AC01 (l.41).
   - Discrepancy: Move says "a pair outside A-R03 is invalid input" (422). Pair (expected = X, target = X) is not in A-R03, yet A-R13 and A-AC08 say choosing the current stage returns success. The operation also checks the pair before the conditional update. A-R04 says the field never lists the current stage, so the case only arises via a stale page or a direct call. A-AC08 does not say which input sets it up.
   - Rationale: An implementer may return 422 for expected = target, and a test written from A-AC08 may fail or pass depending on the reading. Create (l.46) is clearer because its check is against "no application".

5. **Major - Some required work belongs to no task or criterion.**
   - Where: solution-design.md l.61, l.86, Storage l.32-36; tickets lq3.1-lq3.3.
   - Discrepancy: The migration, the module's registration in the boundaries test, the module-map row and README, and the move of the salary label into the Offers view entry have no named owner task. None appears in any ticket's acceptance criteria. T1 clearly needs the migration, but this is stated nowhere. The salary move is needed by T2 only (T2-R09), yet it sits in "Offers module" prose.
   - Rationale: With three independently prepared tasks marked ready-for-agent, each agent can assume another does it.

### Nits

6. **Nit - Message when an application is missing its offer is only in the design.**
   - Where: solution-design.md l.66 ("shows its stage only"); requirements T2-R02 and T2-R09 (l.73, 80).
   - Discrepancy: Requirements give no behaviour for a row or drawer whose offer is not found. The "Otwórz ofertę" link and the drawer title are also not covered. No criterion checks it.
   - Rationale: Behaviour exists only in the design.

7. **Nit - "Stages" has two meanings in the PRD.**
   - Where: PRD.md l.21 (application stage) vs l.49-53 (heading "Stages" = delivery steps 1-3). Also requirements "stage date" and "step back".
   - Rationale: A fresh reader confuses delivery order with application stages.

8. **Nit - "Active", "Wszystkie" and what "lists the offers with an application" means.**
   - Where: PRD.md l.27, l.46 ("active ones") vs requirements T2-R03 (l.74).
   - Discrepancy: PRD never defines "active". "Wszystkie" ("All") excludes "Zdjeta z listy", and PRD l.27 says the page lists "the offers with an application", although removed ones never appear.
   - Rationale: The names promise more than they deliver. Intent is clear only from T2-R03.

9. **Nit - Filter label differs from the stage label.**
   - Where: requirements T3-R03 (l.108), ticket lq3.3 vs A-R02 (l.16).
   - Discrepancy: The filter choice is "Zdjete z listy" (neuter plural), the stage label is "Zdjeta z listy". T3-R01 says a stage label is used as tooltip, but T3-R03 says nothing about the choice labels.
   - Rationale: Probably intended, but unstated, and a test could check either.

10. **Nit - "Each criterion is met by the task named in its last column."**
    - Where: requirements.md l.36.
    - Discrepancy: The last column is "How it is checked". The task is named at the end of the Criterion cell (for example "T1."). Also A-AC08 is listed before A-AC01, with no order explained.
    - Rationale: The sentence misdirects.

11. **Nit - "Characters" vs "code points", and the body limit.**
    - Where: requirements.md A-R09, A-R10 (l.28, 29); solution-design.md l.48, 78.
    - Discrepancy: Requirements say characters, the design says Unicode code points. "Request body limit of the HTTP layer" has no value. The 10 001 check in A-AC03 does not say which counting applies, for emoji and combining marks.
    - Rationale: Small ambiguity in a boundary test.

12. **Nit - "Note from two pages" is unclear.**
    - Where: requirements.md A-R11 (l.30) with A-R12 (l.31).
    - Discrepancy: The note is shown and edited only in the application details, so "two pages" can only mean two browser tabs or windows. Say so. Also the "keeps the typed text in the field" part of A-R10 and any save confirmation have no criterion (A-AC03 checks only the message and the stored note).

13. **Nit - Unexplained references and phrases.**
    - Where: PRD.md l.3, 33-35, 36; requirements.md A-R09 (l.28); solution-design.md l.18.
    - Discrepancy: "Beads epic", "the collection task `oferty-pracy-sz5`" (what it collects, and when it is read), "decision `oferty-pracy-v4t.4`, recruitment draft R-22", "the principle that nothing is lost" (never stated) and "a stored stage before rejection" (D2, an earlier design the reader never saw) are not explained.
    - Rationale: These make the documents depend on prior conversation. Also "after the first ended" in the PRD (l.33) never says when an application "ends", since stages can be reversed.

14. **Nit - Paging and multi-choice behaviour only by link.**
    - Where: requirements.md T2-R05 (l.76), T3-R03 (l.108); solution-design.md Risks l.99.
    - Discrepancy: These behaviours ("Strona X z Y", the list of page numbers, "a choice applies when the list closes") are defined only in the nq3 spec, which is not yet in main. An update to nq3 would silently change this epic.
    - Rationale: Acceptable if intended. Mention which nq3 version is assumed.

15. **Nit - Ticket metadata and gaps in ticket criteria texts.**
    - Where: tickets-export.md l.16 (`load_bearing: A-R01,A-R02,A-R03,A-R07,A-R13`), lq3.1 A-AC02 (l.44-45), lq3.2 T2-AC02 (l.96-97).
    - Discrepancy: "load_bearing" is not explained, and A-R13 and A-R07 are the only rules listed beside the stage rules, with no reason. The ticket A-AC02 drops "including no application when one exists". The ticket T2-AC02 drops the "just after midnight Polish time" case. The ticket restatements are shorter than the requirements, so a reader of the ticket alone tests less.
    - Rationale: Tickets point to the requirements by link, so the risk is small.

## Cross-check result

Ticket criteria sets match the requirements: lq3.1 carries A-AC01/02/04/05/06/08 and T1-AC01..03, lq3.2 carries A-AC03/04/07 and T2-AC01..10, lq3.3 carries T3-AC01..05, as the "Shared criteria met" lines say. The T1-AC02 sequence is valid under A-R03 at every step. Dependencies in the PRD "Stages", the design "Rollout" and the tickets agree.

## Counts

Blocker 0, Major 5, Nit 10.
