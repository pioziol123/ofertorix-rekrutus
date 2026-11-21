# Stage 7 Critic Review — Structural Goldfish (egm-structural)

Mode: REVIEW. Target standard: feature-spec-standard.md, read together with the project's own layout rules (implementation-workflow.md, section "Documents" and "Readiness checklist").
FeatureRange: `docs/specs/sq2-zlecenia-ai/PRD.md` (83 lines), `docs/specs/sq2-zlecenia-ai/requirements.md` (441 lines).
Baseline compared: `docs/specs/2ba-praca-w-tle/PRD.md`, `requirements.md`.

Mechanical checks run (read-only):
- `node scripts/check-spec-altitude.ts` on both files: exit 0, no warnings.
- Every link target checked: `requirements.md#t1`–`#t13`, `solution-design.md`, `solution-design.md#t2`, `GLOSSARY.md#ai-module`, `../2ba-praca-w-tle/PRD.md` and `requirements.md`, `../../architecture/moduly-i-zasady-kodu.md` resolve. All tables have consistent column counts; no unclosed code spans or fences.

## Structure map

PRD: H1 → Context, Problem, Goal, What changes for the owner, Out of scope, Success, Constraints and dependencies, Stages (all H2, no skipped levels). Superset of the 2ba PRD layout.

Requirements: H1 → Shared criteria, Shared rules, T1–T13 (H2), each with H3 Requirements and Acceptance criteria; Scope (H3) only in T1–T3; closing H2 "Decisions of 20 November 2026". No skipped levels.

Summary: 🔴 0, 🟡 5, 🟢 9.

## Findings

### 🟡 M1. Scope subsection present in T1–T3 only

- **File / lines:** requirements.md 44, 80, 116 (present); missing in T4 (148–175), T5 (177–198), T6 (201–230), T7–T13 (233–420).
- **Discrepancy:** Ten of thirteen task sections have no `### Scope`. In the baseline (2ba requirements) every task section has Scope, Requirements and Acceptance criteria.
- **Rationale:** The Scope paragraph is where a task states what it leaves to other tasks (T3 line 118 does this for T4/T6). Without it, boundaries of T4 (does it include Retry by the owner? no, T12), T6 (does it include the periodic process step? partially T10-R04), T10 and T11 must be inferred from requirement wording. The template asymmetry also makes the sections look unfinished to a fresh reader.

### 🟡 M2. "Depends on" stated for T7–T13 only

- **File / lines:** requirements.md 235, 263, 296, 323, 348, 373, 399 (present); absent in T2 (78), T3 (114), T4 (150), T5 (179), T6 (203).
- **Discrepancy:** T2–T6 clearly depend on earlier tasks (T3 starts operations placed by T1 through executors of T2; T4 and T5 act on the end of an operation defined in T3; T6 on T3/T4), but their source lines carry no dependency, while T7+ do. Only the document-wide line 11 names `oferty-pracy-2ba.6`.
- **Rationale:** The readiness checklist requires blocking dependencies to be wired in bd; the requirements are the stated source for them. A half-populated convention reads as "no dependency" for T2–T6 and invites the runner order to be wired wrongly.

### 🟡 M3. Requirement T5-R05 has no acceptance criterion

- **File / lines:** requirements.md 189 (T5-R05), 193–197 (T5-AC01–AC03 trace R01–R04 only).
- **Discrepancy:** Every other requirement in T1–T13 is traced by at least one AC (verified one by one). T5-R05 "No automatic repeat" is not traced. Related: T5-R03 "within five minutes" is cited by T5-AC02, but AC02 does not check the five-minute bound.
- **Rationale:** The process contract requires each criterion to be observable and the task to cite criteria by ID; a requirement with no AC is not checked at the gate. A code-review AC ("no service re-enqueues an interrupted operation") would close it.

### 🟡 M4. PRD and requirements describe the transitional state differently

- **File / lines:** PRD.md 62 ("no old and new path run side by side") vs requirements.md 9 ("with the old way of requesting AI work still serving the modules not yet moved; T10 removes it") and line 46 ("The existing contract stays in use until T10").
- **Discrepancy:** Read literally, the PRD forbids what the requirements prescribe for `main` between T1 and T10. The intended meaning (no side-by-side at release; side-by-side inside the epic's unreleased history) is stated only in the requirements.
- **Rationale:** The baseline 2ba PRD/requirements phrase this consistently (2ba requirements line 7 says both). A fresh implementer of T7 who reads the PRD constraint may try to remove the old path early or treat coexistence as a defect. The PRD sentence should say "at release".

### 🟡 M5. No Risks & Mitigations content in the PRD

- **File / lines:** PRD.md whole file; nearest sections are "Constraints and dependencies" (59–63) and "Out of scope" (36–49).
- **Discrepancy:** The feature-spec standard requires the specification to call out failure modes, scalability limits and mitigations. The PRD records consequences as plain facts (assessment cost doubles, line 32; whole-epic delivery, line 62; unreported cost stays charged at the reserved amount, line 47; hard dependency on 2ba, line 61) but has no section that names them as risks with mitigations. Alternatives are, per the project's process contract, recorded in the solution design (outside this range), which the PRD links on line 3, so the Alternatives Rule is satisfied by delegation; risks have no such home.
- **Rationale:** A fresh reader cannot see from the PRD which of these the owner accepted as risks and how they are contained (for example, cost doubling against the 100 PLN default limit, or a 2ba slip blocking the whole epic). A short "Risks" H2, consistent with the PRD's high-level altitude, would satisfy the standard without moving detail out of the requirements.

### 🟢 N1. Stage numbers are implicit in the PRD

- **File / lines:** PRD.md 67, 69–83; requirements.md 5.
- **Discrepancy:** Requirements line 5 maps `T<n>` to "stage n of the PRD", and PRD line 67 speaks of "Stage 14 of the earlier division", but the Stages table has no number column; n is only the row position.
- **Rationale:** Adding a `#` column (1–13) makes the cross-document key explicit and makes the "Stage 14 … not reused" sentence intelligible.

### 🟢 N2. Acceptance criteria out of numeric order

- **File / lines:** requirements.md 289–290 (T8-AC09 before T8-AC08), 316–317 (T9-AC06 before T9-AC05).
- **Rationale:** IDs are stable so renumbering is not wanted, but rows should be sorted by ID, or a note should say the order follows the requirements.

### 🟢 N3. ACs without a requirement trace

- **File / lines:** requirements.md 257 (T7-AC06), 290 (T8-AC08), 317 (T9-AC05); 342 (T10-AC04, the clause about the AI module's description and the glossary has no requirement).
- **Rationale:** Every other AC ends with its "(T<n>-R..)" trace. These look like task-local restatements of ZA-AC02; cite ZA-AC02 or add a requirement.

### 🟢 N4. Shared criteria said to be "cited in each" task, but no task section cites them

- **File / lines:** requirements.md 17, 21–22; no occurrence of ZA-AC01/ZA-AC02 in T1–T13.
- **Rationale:** Same pattern as the 2ba baseline, so likely the citation lives in the bd task. The sentence should say where they are cited ("in each Beads task"), or each section should list them.

### 🟢 N5. Anchor `open` labels a section that says nothing is open

- **File / lines:** requirements.md 422–426; link on line 7.
- **Rationale:** Anchor name contradicts the heading and text ("none is open"). Rename to e.g. `decisions` (the solution design cites by O-ID, not anchor; verify before renaming).

### 🟢 N6. Inconsistent anchor names for shared sections

- **File / lines:** requirements.md 13 (`wspolne` for "Shared criteria"), 24 (`model` for "Shared rules").
- **Rationale:** One Polish slug, one English word unrelated to the heading; the baseline uses `wymagania-wspolne`. Cosmetic, but anchors are cross-document keys.

### 🟢 N7. Trailing paragraph sits under the Decisions heading

- **File / lines:** requirements.md 441.
- **Rationale:** The note about `oferty-pracy-sq2.1` is not a decision of 20 November; it belongs in the introduction (near line 5) or under T2. PRD line 67 already says the same.

### 🟢 N8. Link text style differs between the two documents

- **File / lines:** PRD.md 3 (`[solution design](solution-design.md)`) vs requirements.md 3 (`[solution-design.md](solution-design.md)`).
- **Rationale:** Matches the 2ba baseline, so it is a project habit rather than a defect; prefer the descriptive form.

### 🟢 N9. Unresolvable legacy labels in the PRD context

- **File / lines:** PRD.md 7 ("requirement R-25 of the first version", "PZ-01–PZ-08"); requirements.md 7 and throughout (`Q..` citations, groups A–J).
- **Rationale:** A fresh reader cannot locate these: no link to the first version's requirements or to where PZ-xx lived, and Q-numbers resolve only through bd comments. Acceptable as provenance, but one link per source (or "see comments of `oferty-pracy-sq2`, group X") would make them traceable.
