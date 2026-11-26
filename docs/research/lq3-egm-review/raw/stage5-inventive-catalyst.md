# Stage 5 - Inventive Catalyst Goldfish - initial zoom-out (Mode: REVIEW)

Scope: PRD.md, requirements.md, solution-design.md of epic oferty-pracy-lq3 and the ticket export (lq3, lq3.1, lq3.2, lq3.3). The owner aims for an MVP; simpler alternatives are weighed highly. Context sufficiency: passed (objective and reason are clear).

Totals: 0 Blocker, 5 Major, 4 Nit. The architecture rules (moduly-i-zasady-kodu.md) bind; where an alternative below touches a rule, that is stated.

---

## 🟡 Major 1 - A fourth stage and a transition table that forbids exactly one pair

- Where: requirements.md A-R02, A-R03 (l.16-17), A-AC01, A-AC06, T3-R01, T3-R03, T2-R03, T2-R12; solution-design.md D10 (l.26), the allowed-transitions function in the view entry; tickets lq3, lq3.1 (A-AC06), lq3.3.
- False compromise: "Workflow integrity needs an explicit transition table, so every stage change is validated and listed per stage." Count the pairs: with four stages the table allows 11 of 12 possible changes. The only forbidden pair is "CV wysłane" -> "Zdjęta z listy" (plus "no application" -> "Zdjęta z listy"). One rule costs a whole machine: the allowed-transitions function in the browser-safe view entry, a per-stage stage field, the 422 mapping for forbidden pairs, the exhaustive pair test (A-AC01) and a separate criterion for the field (A-AC06).
- The fourth stage ("Zdjęta z listy") is itself a source of special cases that exist only because it is a "delete" in a never-delete model: it is hidden from Moja lista under every choice (T2-R03), shows no icon so "a removed offer looks like one never saved" (T3-R01), is excluded from "Bez aplikacji" but has its own filter option on the offer list only (T3-R03, T3-AC02), and needs the link "Szczegóły aplikacji" to work for an application that is not a row anywhere (T2-R12, T2-AC10). The vocabulary also collides for the owner: "Poza listą" (no application) versus "Zdjęta z listy" (removed).
- Everything "removed" achieves for the owner is already achieved by "Odrzucone": the PRD says it covers "the owner giving up", and the default Moja lista view "Aktywne" already hides it.
- Proposed resolution (Segmentation of the rule from the model; Extraction of the one rule): for the MVP use three stages ("Do rozważenia", "CV wysłane", "Odrzucone") that the owner moves freely between, with "no application" as the entry state. The stage field then lists "every other stage"; the transition table, the allowed-stages function, A-AC06 and the T3/T2 special cases for "removed" disappear. The ID/stage stays a `text` + `CHECK`, so a fourth stage or a restriction can be added later by a migration without touching callers. If the owner keeps "Zdjęta z listy", still drop the table and keep the single rule "no removal from CV sent" as a one-line guard.
- Secondary liabilities: an owner who wants a clean "undo save" has only "Odrzucone" (it stays in the "Wszystkie" view and in the offer list icons); a later fourth stage needs a migration and a UI addition. The decision "CV sent cannot be removed" is lost unless the guard is kept.

## 🟡 Major 2 - "Moja lista" is a second, paged copy of the offer list

- Where: PRD "What changes for the owner" (Moja lista, application details), requirements.md T2 whole (R01-R12, AC01-AC10), solution-design.md D4, D8, Operations 2 and 6 of the Recruitments and Offers modules, "Pages" section; ticket lq3.2.
- False compromise: "A personal shortlist needs its own page, its own paged read, its own drawer and its own address logic." The PRD goal is "the owner finds these offers both on their own list and on the offer list". T3 already gives the offer list a stage filter that applies before sorting, counting and paging. "Moja lista" then differs only by (a) a default filter, (b) a "last stage change" column and order, (c) the drawer with note and history.
- The page costs a lot: the application-page read with its own stage-choice enum (`active`/`all`/...), a bulk "offers by IDs" operation (cap 100) and an on-page join (D4), the shared-paging refactor of another task's page (D8, T2-R08), the address keys `stage/page/size/offer` with clamping rules (T2-R06), a drawer, a link pair "Szczegóły aplikacji" / "Otwórz ofertę" that sends the owner back and forth between two surfaces for the same offer, and the move of the salary label into the Offers view entry.
- Proposed resolution (Extraction + the Ideal Final Result: no new page): make "Moja lista" a navigation link to the offer list with the stage filter preset to "Do rozważenia" and "CV wysłane" (the link already exists as the navigation item of T2-R01). Put the note, the history and the stage field into the existing offer details. Add the stage moment to each offer-list item (the stage read of D3 already returns the row) and offer a sort by it. T2 shrinks to: the note (save/validate), the history display and the nav link; the applications-page read, bulk offers-by-IDs read, paging extraction, address logic, T2-AC02-AC06, AC07, AC10 and the cross-link all go. Tickets lq3.2 and lq3.3 would then no longer wait for the paging of nq3.1 (only the multi-choice filter, see Major 5).
- Secondary liabilities: conflicts with owner decisions A-R12 ("note never in offer details") and with the agreed page layout; the offer list reads the whole catalogue in memory (accepted cost, at most 10 000 ads) so a "my list" view is no cheaper to read than before; offer details grow heavier; the "Aktywne/Wszystkie" shortcut is replaced by filter choices. If the owner wants to keep the page, the cheapest cut is: no paging (a personal list holds tens of rows, T2-R05/T2-R08/D8 disappear and the nq3 page stays untouched) and the offer list's multi-choice filter reused for the stage choice (see Nit 1).

## 🟡 Major 3 - Two commands and an Offers-mediated first move for what is one idempotent upsert

- Where: solution-design.md D5, D6, D7 (l.21-23), "Create application" and "Move application" (Recruitments, ops 1-2), "Start application" (Offers, op 1), "Situations" table rows "Start / create" and "Move"; requirements.md A-R01, A-R13, A-AC01, A-AC08.
- False compromise: "The first move must be a different command, routed through the Offers module, because the Recruitments module may not know whether the offer exists." The result: two Recruitments operations with near-identical three-way logic (insert/equal/conflict versus update/not found/equal/conflict), a dependency on a mediator whose only job is an existence check, a second dependency direction to explain (Offers -> Recruitments writes and reads), and two page code paths ("a choice from Poza listą calls start application; any other calls move application").
- Proposed resolution (Intermediary removed, Self-Service of the state): one Recruitments operation `change stage(offerId, expectedStage | none, target)` that does `INSERT ... ON CONFLICT DO NOTHING` when the expected stage is "none" and the conditional `UPDATE ... WHERE stage = expected` otherwise, with the A-R13 "same target = success" rule written once. The page route has already read the offer (it renders its details), so the existence check needs no Offers command: the route passes only offer IDs it just read, and a forged ID for a nonexistent offer is a self-inflicted orphan in a single-owner application. If the owner insists on a guard, the route calls the Offers read before the Recruitments command (no transaction needed: ads are not deleted, only marked unavailable - verify in the Offers module).
- Secondary liabilities: the rule "only the owner module of the data performs operations" still holds, but the existence check moves from a transactional guarantee to a route-level convention; the architecture rule 3 (use case sets the transaction boundary) is no longer demonstrated by this feature; when offers are grouped (PRD risk) the route must check the grouped offer. Weigh against the architecture rules before adopting.

## 🟡 Major 4 - Optimistic-lock protocol for a single-user application

- Where: requirements.md A-R07, A-R13, A-AC02, T1-AC03, T2-AC09 (l.21, 32, 44, 63, 95); epic metadata `load_bearing: A-R01,A-R02,A-R03,A-R07,A-R13`; solution-design.md D6, ops 1-2.
- False compromise: "Two stale tabs must not both move an application, so every move carries the stage the page showed and a stale page is refused with a message." This adds an `expected` parameter, a refusal message, a 409 route mapping, a three-way result (changed/equal/conflict), a "no application existed, now it does" case and four dedicated criteria (including routes tested on a running server). The real danger is limited: the owner is the only actor, the transition is validated against the current stage anyway, and a stale move leads at worst to the stage the owner chose in the second tab.
- Proposed resolution (Beforehand Cushioning instead of a lock; Preliminary Action in the SQL): validate the transition against the stored stage inside the single `UPDATE ... WHERE stage <> target` (and, if the transition table is kept, `AND stage IN (allowed_from)`); the last choice wins and the page redraws with the stored stage. A-R07 and the "expected stage" parameter, T1-AC03, A-AC02 and the special messages disappear, and A-R13 becomes a property of the SQL, not a separate rule with a decision (D6).
- Secondary liabilities: this contradicts the letter of the architecture rule that a command relying on state read earlier gives an expected revision (moduly-i-zasady-kodu.md, dependency rule 1), and the epic marks A-R07 load-bearing. Do not adopt it without an explicit owner decision with a justification; the point here is that the rule's protection is spent on a case the owner has about once a year. The rule could be satisfied cheaply instead by comparing `stage_changed_at` of the offered stage (one revision value shared with the order) - but that is no simpler than the current expected stage.

## 🟡 Major 5 - T2 and T3 are blocked by an unfinished task of another epic, and the extraction of its UI elements has no owner

- Where: PRD "Stages" and "Risks"; solution-design.md D8, D9, "Rollout", "Risks"; requirements.md T2-R05, T2-R08, T2-AC07, T3-R03; tickets lq3.2 and lq3.3 (DEPENDS ON `oferty-pracy-nq3.1`, status ◐ in progress).
- False compromise: "Reuse of the sync history's paging and multi-choice element is free, so we wait for nq3.1." Two defects:
  1. The paging is to be turned into "one shared element" (D8, T2-R08, T2-AC07 "review of the change") by T2, which therefore edits the page of a task that is still open. No document says whether nq3.1 or lq3.2 does the extraction, or what happens if nq3.1 changes the page again. The multi-choice element (D9, T3-R03) is described once as "uses the multi-choice element" and once as "works like" - it is not said whether it is already a shared component, so T3 has an unsized, possibly hidden, extraction.
  2. Two of three tasks cannot start until the other epic merges; only T1 is independent. That is a structural dependency, not a design choice.
- Proposed resolution (Segmentation): put the extraction of both elements (paging, multi-choice) in its own small prerequisite task, or move the extraction into nq3.1's acceptance criteria, so lq3.2/lq3.3 consume finished shared components. Or avoid the dependency: drop T2's paging (Major 2) and let T3 reuse the filter only after nq3.1, with a fallback to a native `<select multiple>`/checkbox list for the MVP.
- Secondary liabilities: one more task and one more review; or, in the fallback, a UI element that later differs from the Synchronizacje page (a second mechanism for the same thing, cost 3 of the architecture rules).

---

## 🟢 Nit 1 - Two filter mechanisms for one concept (only if Moja lista stays)

- Where: requirements.md T2-R03 versus T3-R03; solution-design.md op 6 (Applications page: single-choice enum) versus Offers op 3 (set of stages).
- Moja lista chooses stage with a single-choice switch of five invented groups ("Aktywne", "Wszystkie", and three stages); the offer list chooses it with a multi-choice filter. Same concept, two shapes, two parsers, two sets of address rules. If Moja lista stays, use the multi-choice element there too (Aktywne = default value of the set). Liability: the default "Aktywne" shortcut becomes a preselected set.

## 🟢 Nit 2 - Restart test and exhaustive sequence tests verify the platform, not the feature

- Where: requirements.md A-AC04 ("new connection pool"), T1-AC02 (seven-step sequence on a running server), T3-AC05 (query count with 0, 1, 50 applications); solution-design.md "Verification".
- A-AC04 tests that PostgreSQL stores committed rows; the data path is already covered by A-AC01/A-AC03. T1-AC02 repeats the transition test through HTTP. Keep T3-AC05 (it guards the N+1 risk of D3) but consider dropping A-AC04 and merging T1-AC02 with T1-AC03. Liability: slightly less end-to-end evidence per task.

## 🟢 Nit 3 - Applications keyed by ad ID with no foreign key, while the PRD names regrouping as the main risk

- Where: PRD "Risks"; solution-design.md Storage (`offer_id uuid NOT NULL UNIQUE`, "today the ad ID; no foreign key, D7"), "Risks".
- Accepted knowingly, and cheap to keep. It is a deliberate carry-over of the current model; just note in the Offers README which module owns the remap when grouping arrives so the risk has an owner. No design change recommended; an `ad_id` column name would make the interim meaning honest (rename later with the remap).

## 🟢 Nit 4 - History table is justified, but its display is the only consumer

- Where: requirements.md A-R06, T2-R11; solution-design.md D1, D2, Storage "Stage changes".
- Recording is cheap and cannot be reconstructed retroactively (a valid justification under "A feature without a consumer"), while the display (T2-R11, the drawer section) is pure consumer-side work. If Major 2 is adopted, the display lands in the offer details; if the MVP must shrink further, the table could be written now and shown later. No change recommended beyond stating this justification explicitly in D2, as the architecture rules require for a cost-of-design decision.

---

No Blocker found. If the owner takes only one action: decide Major 1 (three free stages) and Major 2 (a preset of the offer list instead of a new page) first, since they remove the most requirements and criteria and make Majors 3-5 smaller or moot.
