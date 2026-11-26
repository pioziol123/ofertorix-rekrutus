# Stage 7 structural critique: lq3-lista-aplikacji (PRD.md, requirements.md)

Reviewer: Structural Goldfish, mode REVIEW. Blueprint: feature-spec-standard.md, the document levels in docs/agents/implementation-workflow.md, and the layout of docs/specs/sq2-zlecenia-ai. The script check-spec-altitude.ts printed no warnings on either file. All paths are under docs/specs/lq3-lista-aplikacji/.

Totals: 0 Blockers, 4 Majors, 9 Nits.

## Blockers
None. Heading levels nest without skips, tables are well formed, and the relative links resolve (GLOSSARY.md, the pierwsza-wersja recruitment draft, nq3 requirements).

## Majors

### M1. Requirements name functions and other technical detail in their checks
- Scope: requirements.md line 42 (A-AC06 "function that lists the allowed stages"), line 114 (T3-AC01 "function that chooses the icon"). Technical wording also in line 46 (A-AC04 "new connection pool") and in lines 61, 62 and 95 ("routes on a running server").
- Discrepancy: implementation-workflow.md line 21 says requirements carry "no technical details: no library protocols, function names, file names", and each criterion says how it is checked in the same terms (an automated test, a check of the running application, a review). sq2 phrases the check as "requested from the running application".
- Rationale: A function named in a check fixes a design element before the solution design exists. It also stops the criterion from being observable by someone without the code. The altitude script does not catch it, so the review must.

### M2. Some requirements have no criterion that observes them
- Scope: requirements.md.
  - T2-R09 (line 80): Escape and closing the drawer, the mark "Niedostępna w źródle" in the details, and the link text are not in T2-AC08 (line 94). T2-AC08 does not mention the mark or closing.
  - T2-R02 (line 73): "Rows have no stage field" is checked only for T3 (T3-AC01), not for Moja lista.
  - T2-R10 (line 81): "the details and the row show the new stage" is checked in T2-AC09 (line 95) only for the details.
  - A-R06 (line 20): "never changed or removed" has no criterion. A-AC01 checks only that a record is made.
  - A-R08 (line 22): "expiry at the source" is not in A-AC05 (line 47), which covers only unavailability and a new assessment.
  - T3-R04 (line 109): "changing it goes back to page 1" is not in T3-AC03 (line 116).
  - T3-AC05 (line 118) is a hidden requirement: a query-count property (no extra queries per application) with no T3-R rule behind it. T3-R04 does not state it.
- Rationale: The readiness checklist (workflow line 92) requires each acceptance criterion to be observable, and the task to cover its requirements. A requirement that no criterion observes is not verified. A criterion without a requirement is a rule that exists only in the check.

### M3. The standard's risks and alternatives coverage is thin in PRD and requirements
- Scope: PRD.md lines 39-41 (Risks), lines 31-37 (Out of scope).
- Discrepancy: feature-spec-standard.md requires an evaluation of alternatives and explicit failure modes and limits. The PRD has one risk (offers not yet grouped). It lists a single path and records the discarded options only as reversals.
  - Examples of discarded options: no note history, no sending channel, a removed stage that hides rows.
  - Failure modes not named in the PRD: two pages changing the same application (covered in the rules A-R07 and A-R11 but not in Risks), and the loss of an overwritten note.
- Rationale: sq2's PRD has a "Risks the owner accepted" section with many entries. If the alternatives are meant to live only in the solution design (workflow line 22), the PRD should say so or link them. I did not review solution-design.md in this stage.

### M4. No shared quality-gate criterion
- Scope: requirements.md lines 34-47 ("Criteria of the shared rules").
- Discrepancy: sq2 has a "Shared criteria" section with ZA-AC01 (all quality checks pass) and ZA-AC02 (code belongs to the owning module, per the architecture rules). lq3 has only behavioural shared criteria, so no criterion says that the architecture rules (module ownership, Polish time library, paging element) are checked.
- Rationale: The workflow says the architecture rules bind every task. The requirement T2-R08 (a shared paging element) and the time rules need a place to be checked, and the epic has no `shared` quality criteria for the runner to leave out when it counts tasks waiting for a deviation (workflow line 61).

## Nits

- N1. requirements.md lines 36-47: the introduction says each criterion "is met by the task named in its last column", but the last column is "How it is checked". The task is named at the end of the Criterion text ("T1.", "T2."). A-AC04 spans two tasks (stages in T1, notes in T2), so no single task owns it. A-AC08 is listed before A-AC01, and A-AC07 and A-AC02 are out of order.
- N2. requirements.md lines 49, 66, 100: task sections use "## T1 — ..." with an em dash and an inline paragraph for scope. sq2 uses "## T1. Title (`id`)" with H3 "Scope", "Requirements", "Acceptance criteria" and anchors (`<a id="t1">`). The lq3 PRD stages (lines 51-53) cite bd ids but do not link the requirement sections, unlike sq2's PRD stage table.
- N3. PRD.md section order is Risks, Success, Stages, Constraints. sq2 puts Constraints before Risks and ends with Stages. The dependency on nq3.1 appears only in the PRD stages, not in the requirements of T2 and T3, which have no "Depends on" line (sq2 has one).
- N4. Two labels for the same state: T1-R01 "Poza listą" (line 55) and T3-R03 "Bez aplikacji" (line 108). Neither is in A-R02, which defines the stage labels. "Zdjęte z listy" (T3-R03) differs from "Zdjęta z listy" (A-R02) without a note on the gender change.
- N5. Line 3 says every rule was decided by the owner "unless marked otherwise", but nothing is marked and no source (interview question, bd comment) is cited. sq2 cites `(Q..)` and `(owner, date)` per rule.
- N6. PRD.md lines 19-29 ("What changes for the owner") repeat rules at requirement level (labels, stage dates, undo behaviour, row contents). The workflow says the PRD has no detailed requirements. The text duplicates requirements.md and can drift from it.
- N7. PRD.md line 26 puts the link to the application details in offer details, but PRD stage 1 (line 51) does not include it. The link is T2-R12, a T2 requirement. The PRD does not say the link arrives in stage 2.
- N8. GLOSSARY.md has the "Application" and "Application stage" terms but not "Moja lista", "note" or "history of stages". Both spec files say terms follow the glossary. The glossary's "Application" definition (interviews, assignments, deadlines, contacts) is wider than this slice and the PRD does not say it is narrowed.
- N9. requirements.md line 122: "Open questions: None." while line 3 says rules were decided in a conversation. No record shows the owner approved the unstated points (for example, the order of rows with equal moments, T2-R04).
