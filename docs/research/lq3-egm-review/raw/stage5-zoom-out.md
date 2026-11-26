# Stage 5 — zoom-out review (Skeptical Architect), epic oferty-pracy-lq3

Scope: PRD.md, requirements.md, solution-design.md (docs/specs/lq3-lista-aplikacji/), tickets-export.md. Context sufficiency: passes. The objective (a private shortlist plus CV-sent/rejected tracking) and its motivation are clear. The design is in the main minimal and fits the architecture rules: one new module, one direction of dependency Offers -> Recruitments, one query for the offer-list stages, reuse of the nq3 paging and multi-choice patterns, and the existing `view.ts` entry convention of Offers. Reuse checks run against the code: `modules/offers/domain/filters.ts`, `modules/offers/README.md`, `app/components`, `app/pages`.

Count: Blocker 0, Major 3, Nit 7.

## 🟡 Major

### M1. Same-stage choice (A-R13) contradicts "pair outside A-R03 is invalid input" and A-AC01
- Files: solution-design.md l.47 (Move application) vs l.46, D6 (l.22) and requirements.md A-R13 (l.~37), A-AC01 (l.~44), A-AC08.
- Discrepancy: Move says "A pair outside A-R03 is invalid input" (422), and a pair is (expected, target). A-R03 lists no same-stage transition, so move(expected=B, target=B) is by the letter a 422. A-R13 and A-AC08 demand success without a write for "choosing the current stage again". A-AC01 says "every other pair of stages ... is refused without a change", which also excludes the identical pair. The SD describes the same-target success only after "no row", so the order of checks is unclear: does the pair check run before the conditional update?
- Rationale: two testable criteria (A-AC01 and A-AC08, both `load_bearing` via A-R03 and A-R13) conflict for the case a retry produces. The implementer must guess. Fix: state in A-R03 or A-AC01 that an identical pair is not a transition and is handled by A-R13, and put the A-R13 check ahead of the pair validation in the contract.

### M2. Behaviour of the drawer and the row when a move takes the application out of the current Moja lista view is unspecified
- Files: requirements.md T2-R10, T2-R03, T2-AC09; solution-design.md l.67.
- Discrepancy: T2-R10 says "the details and the row show the new stage". The default view is "Aktywne" (Do rozważenia, CV wysłane), so the most common move from the drawer (CV wysłane -> Odrzucone, or -> Zdjęta z listy) makes the row leave the view. Under "Zdjęta z listy" the application appears under no choice at all. The SD says only that "the page reads the details and the list page again". Nothing says whether the drawer stays open on the application, whether the address keeps `offer`, or how the page number is clamped when the moved row was the only one on the last page.
- Rationale: this is the central interaction of the epic and it falls into an unspecified gap, so the runner will settle it with an assumption on a user-visible behaviour. Add one requirement: the drawer stays open on the moved application whatever the view, and the list re-reads and clamps.

### M3. Who extracts the shared multi-choice element for T3 is not stated, and neither is the effect on the existing offer-list filter parser
- Files: solution-design.md D9 (l.25), l.59, Risks l.99; requirements.md T3-R03, T3-R05; tickets .3. Compare T2-R08/T2-AC07 and D8, which do give the extraction of the paging element an owner and a criterion.
- Discrepancy: D9 says the stage filter "uses the multi-choice element of the page Synchronizacje". The nq3 documents define no shared element (no requirement or SD text in nq3 names a reusable multi-choice component), and T3 has no requirement or criterion that extracts one. The SD itself says the element is "not in main yet". The paging element has an explicit extraction rule and the multi-choice element does not.
- Additionally, `modules/offers/domain/filters.ts` `parseFilters` accepts only single strings and throws on any value outside the shape (README: HTTP 400). T3-R05 and SD l.59 demand repeated or comma-separated values and that unknown stages are "left out without error". This is a deliberate exception inside a parser that throws for every other key, and the SD does not say how an array-valued key passes the string-only check.
- Rationale: without an owner, either T3 builds a second copy (the pattern D9 discards) or it assumes the extraction silently. Name the extraction in T3 scope, or state that nq3.1 delivers a shared element, and add a criterion. State the parser exception explicitly.

## 🟢 Nit

### N1. Altitude: pseudo-SQL and operation internals in the solution design
- solution-design.md l.46-48 ("INSERT ... ON CONFLICT (offer_id) DO NOTHING", "UPDATE ... SET ... WHERE ... RETURNING"), l.35 index definition.
- The process contract says the design states mechanisms and data semantics but not function names or code. The semantics (a conditional state change, unique offer, a single transaction) are what bind; the statements are implementation. Keep the "conditional update, no row lock, unique offer ID" sentence and drop the statement text.

### N2. Premature index
- solution-design.md l.36: an index `(stage, stage_changed_at DESC, id DESC)` for Moja lista. "Aktywne" and "Wszystkie" filter by several stages, so the index cannot serve the ordering for them. The design itself says applications are "far fewer than offers" and the whole offer catalogue is capped at 10 000. No measured bottleneck. Drop it, or index `stage_changed_at` only, until a measurement.

### N3. Over-fetch in the offer-details read
- solution-design.md l.50, l.65: "Application details" returns note and the whole history, and offer details use it only to show the stage field and the link (A-R12 and T1-R01 say they show no note or history). Architecture rule: an operation exposes only the data the client needs. A stage-only read (or reuse of the current-stages read filtered by ID) is simpler. The cost is small, so Nit.

### N4. The rationale for discarding "Offers performs every move" (D5) is weak
- solution-design.md l.21 D5. Offers could delegate every move to the Recruitments public operation exactly as it does for create, so it would write no data it does not own and the transition table would keep one owner. The chosen split costs two command paths on the page (start vs move, with the "Poza listą" branch) and an extra stale-page branch. The owner accepted D5 in the walkthrough, so only the recorded reason is imprecise; correct it or accept the two paths knowingly.

### N5. User-facing labels that invite confusion
- requirements.md T2-R03, T1-R01. "Wszystkie" excludes "Zdjęta z listy". "Poza listą" (no application) and "Zdjęta z listy" (removed) read as the same thing, and T3-R01 deliberately makes them look the same on the list while the filter and offer details tell them apart. This is an owner decision, so it is recorded only as a risk of mislabelling; consider "Wszystkie (bez zdjętych)" or a one-line note in the PRD.

### N6. Character limit counted two ways
- A-R09/A-R10 say "10 000 characters"; solution-design.md l.48 says "Unicode code points". JS string length counts UTF-16 units. Say "code points" in A-R09 so the A-AC03 boundary test (10 000 / 10 001) is unambiguous for text with emoji.

### N7. Module registration is outside every criterion
- solution-design.md l.86 (module list in the boundaries test, module-map row, module README) and the migration are not in any requirement or ticket acceptance criterion of .1 (tickets-export.md l.27-71). Add a one-line item to T1's "how it is checked" (the boundaries test passes with the new module), otherwise the item depends on the implementer reading the Rollout section.

## Checked, no finding
- Ticket coverage: every T1/T2/T3 criterion and every shared criterion appears in exactly one ticket (A-AC01/02/04/05/06/08 in .1; A-AC03/04/07 in .2; T3-AC01-05 in .3); dependencies on `oferty-pracy-nq3.1` match PRD "Stages" and SD Rollout. Epic `load_bearing` (A-R01, A-R02, A-R03, A-R07, A-R13) is consistent with the decisions.
- PRD, requirements and SD agree on the stage set, transitions, note limit, order and paging. The history-table cost (D1/D2) is an owner decision, and the history is read only for display, so it is a deliberate and bounded cost.
- Direction of dependencies (Offers -> Recruitments, no foreign key, ID = ad ID) matches `modules/offers/README.md` ("offer ID is the ad ID") and the recorded grouping risk.
