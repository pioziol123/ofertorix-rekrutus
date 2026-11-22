# Stage 7 — Structural Goldfish review (egm-structural), mode REVIEW

Scope: `docs/specs/nq3-panel-synchronizacji/PRD.md` (59 lines) and `requirements.md` (196 lines). Standard: feature-spec-standard.md, read together with the project's own layout rules (`docs/agents/implementation-workflow.md`, section "Documents") and the layout of `docs/specs/sq2-zlecenia-ai/`. `node scripts/check-spec-altitude.ts` on both files exits 0 with no warnings.

Structure check that passed: heading hierarchy has no skipped levels (PRD: H1 then H2 only; requirements: H1, H2 per shared block and task, H3 Scope / Requirements / Acceptance criteria in each task). All tables are well formed. All relative links resolve (`solution-design.md`, `GLOSSARY.md`, the mock-up README, `moduly-i-zasady-kodu.md`). Anchors `#wspolne`, `#t1` to `#t5` exist. Every task has the three sub-blocks, T1 has 12 criteria (under the 15 limit), and the IDs are consistent (`PS-AC`, `Tn-Rnn`, `Tn-ACnn`).

Totals: 0 Blocker, 7 Major, 11 Nit.

---

## 🟡 Majors

### M1. PRD has no risks and limits section
- File and lines: `PRD.md` 56-59 (the last section, "Constraints and dependencies"); compare `sq2-zlecenia-ai/PRD.md` 65-73 ("Risks the owner accepted").
- Discrepancy: the standard requires "Risks & Limits": failure modes and how they are handled. The sibling PRD has a dedicated section. This PRD has none, though its own text implies several risks that a fresh reader cannot see written down:
  - Sources that can never be synced completely (T4 Scope, `requirements.md` 141, "collection task item 36") will sit permanently in "Wymaga uwagi" and in the "Bez pełnej synchronizacji od 3 dni" warning (T4-R02, T4-R04). The mock-up README says LinkedIn always ends partial.
  - History grows without bound, because cleanup is out of scope (`PRD.md` 35, item 42).
  - The page does not refresh by itself (items 48), so a queued sync looks stuck.
  - Syncs from before stage 2 have no unavailable count (`PRD.md` 59 covers this one only).
- Rationale: an accepted risk that is not named reads later as a defect. Add a short "Risks the owner accepted" section, as the sibling PRD does.

### M2. T5-R05 adds behaviour that the PRD and the task's Scope do not mention
- File and lines: `requirements.md` 184 (T5-R05), 194 (T5-AC03); against `requirements.md` 172-174 (T5 Scope) and `PRD.md` 29, 46.
- Discrepancy: T5 Scope says the task removes sync information and the Polish portals' import form. The PRD says the offer list "loses every piece of sync information and the import form". T5-R05 also removes the offer list's automatic reload "also while an AI assessment is waiting", which is a change to how the AI assessment waiting works, not sync information. The solution design confirms it removes "the timer that reloaded the list" (solution-design.md line 192). Neither the PRD (Problem, Goal, What changes, Out of scope) nor the T5 Scope mentions it. PRD line 38 puts a self-refreshing panel out of scope but says nothing about the offer list.
- Rationale: a requirement with no PRD ancestor breaks traceability from epic to criterion. Either add the change to the PRD (What changes and Stages) and the T5 Scope, or move it to its own task or a decision record.

### M3. Requirements state no dependencies between tasks
- File and lines: `requirements.md` 22-196 (every task section); compare `sq2-zlecenia-ai/requirements.md` 84, 118 ("Depends on [T1]") and line 15.
- Discrepancy: the sibling file opens each task section with its dependency. This file has none, though dependencies are real:
  - T2 changes what T1 shows (T1-R05, T2-R02 to R04).
  - T3-R07 sets the T1 filter and T3-R08 opens the T1 drawer.
  - T4-R03 uses the definition of new ads from T1-R06, and T4-R06 sets the T1 source filter.
  - T4-R07 reloads with the request of T3-R07.
  - T5-R04 is safe only after T3, since it says the Polish portals can be synced "other than from the panel (T3)".
  - The PRD's numbered stages (`PRD.md` 50-54) imply an order but do not state it.
- Rationale: the readiness checklist wants blocking dependencies wired in bd, and the reader of the documents cannot tell which edges to wire. State "Depends on" per task, at least T2 on T1, T3 on T1, T4 on T1 and T3, T5 on T3.

### M4. "A source that infers unavailability" is a branching condition that the requirements never define
- File and lines: `requirements.md` 38 (T1-R05), 46 (T1-R13), 59 (T1-AC04), 66 (T1-AC10), and all of T2 (75-96), especially 75 (Scope: "Out of scope: which sources infer unavailability").
- Discrepancy: the row, the details and the whole of T2 branch on this property, but neither the PRD, nor the requirements, nor the glossary says what it is or which sources have it. The glossary defines only "ad unavailable at the source". The solution design (line 9, line 55) treats it as a catalogue attribute. T2 Scope explicitly leaves the question out. A reader of the requirements alone cannot write a test for T1-AC04 or T2-AC01 without knowing the set.
- Rationale: the workflow's readiness rule says a requirement must not refer to behaviour it does not name. Define the property once in "Words" (for example: a source whose complete sync marks absent ads unavailable), and say where the set is fixed. If it is a catalogue fact, state it as one.

### M5. Requirements without a criterion, and no requirement-to-criterion citation
- File and lines: `requirements.md` 52-67, 90-96, 121-133, 156-166, 188-196. The sibling file closes each criterion with the requirement IDs it proves (for example `sq2 requirements.md` line 72, "(T1-R01, T1-R05)"). Here the criteria carry no such reference.
- Uncovered or partly covered requirements:
  - T2-R05 (line 85, an ad that returns is neither counted nor new): no criterion at all.
  - T1-R03 (line 36): the repeat of the day heading at the top of the next page is not in any criterion.
  - T1-R05: zeros shown greyed.
  - T1-R08: the source list names every catalogue source, including disabled ones.
  - T1-R09: Escape or a click outside closes the page list; "Wyczyść filtry" keeps the page size is only half covered.
  - T1-R11: the "Wyczyść filtry" offer on an empty list.
  - T1-R17 / T1-AC11: unreadable trigger, unreadable period and page below 1 are not tested, while AC11 names only source, state, 30 per page and page 999.
  - T4-R08: no criterion that a disabled source is excluded from "Wymaga uwagi" and the warning together with the fixed thresholds (AC02 and AC04 cover pieces).
- Rationale: without citations the gaps are invisible to a reviewer, and the checklist wants every requirement observable. Add the citation to each criterion and close the gaps above.

### M6. State tooltips are defined only in the throwaway mock-up
- File and lines: `requirements.md` 40 (T1-R07, "the texts are those of the mock-up"), 60 (T1-AC05); also line 7, which calls the mock-up "evidence of layout and wording, not of data".
- Discrepancy: five state explanations are a requirement and an acceptance criterion, but only one text (Pełna) is quoted. The other four live in `docs/prototypes/synchronizacje/index.html`, which its own README calls throwaway product-less code. A criterion whose expected text sits in a file that may be deleted cannot be verified from the specification. T2-R03 and T2-R04, in contrast, quote their tooltips in full.
- Rationale: quote the four remaining texts in the requirement (a small table of state, icon and text), and keep the mock-up only as a source, not as the definition.

### M7. The unknown unavailable count is written three ways, and the details view before T2 is unspecified
- File and lines: `requirements.md` 38 ("— niedostępne"), 59 (T1-AC04), 83 (T2-R03, "—" in the row and the details), 84 (T2-R04, "—"), 94-95 (T2-AC03, T2-AC04), 46 (T1-R13), 66 (T1-AC10).
- Discrepancy:
  - The row text is "— niedostępne" in T1 but plain "—" in T2-R03, T2-R04, T2-AC03 and T2-AC04. T2-R02 says the new value replaces the "— niedostępne" of T1-R05, so the row after T2 shows either "— niedostępne" or "—" for the same state. The two texts are not reconciled.
  - T1-R13 lists "marked unavailable" among the details' numbers and gives the text only for a source that does not infer unavailability ("nie dotyczy") and for new and changed while queued or running. It does not say what the details show for a finished sync of an inferring source before T2, nor for the unavailable number of a queued or running sync. T1-AC10 and T1-AC12 therefore cannot be checked for that field.
  - T1-AC04 (a finished sync shows "— niedostępne") stops being true once T2 is delivered; the document does not say that T2 supersedes it.
- Rationale: one value, one text. State the text for each case (before T2, after T2 for complete, incomplete, failed and pre-deployment syncs) in one table and mark the T1 criterion as superseded by T2.

---

## 🟢 Nits

### N1. No alternatives in the two files, and no pointer to where they live
- `PRD.md` 7, 40-46 and `requirements.md` 7. The standard requires evaluated alternatives. The project's process contract puts the discarded options in the solution design, and that file does record them (it has "Discarded:" entries). But the PRD names the chosen layout (variant C) without saying that variants A and B were considered, and it links the mock-up README only. A one-line pointer to the mock-up's comparison of variants A and C, and to the solution design's decisions, would satisfy the rule for a reader who opens only the PRD.

### N2. PRD stages carry no links to the requirements or task ids
- `PRD.md` 48-54 (a numbered list); `sq2-zlecenia-ai/PRD.md` 79-93 (a table linking each stage to `requirements.md#tN`). The anchors `#t1` to `#t5` exist, so the links are cheap. Add the task id (`oferty-pracy-nq3.n`) as well.

### N3. PRD and T4 describe the strip differently
- `PRD.md` 28 says the strip holds four things (in progress, needing attention, new ads of 24 h, sources without a complete sync for 3 days). `requirements.md` 147-153 makes the strip three counters (T4-R01 to R03) and the "3 days" listing a separate warning (T4-R04 to R06, T4-R07 "the strip and the warning"). Also, "3 failed syncs in a row" (T4-R05) is in `PRD.md` 45 (Success) but not in the "What changes" list at 28. Align the wording.

### N4. T4 Scope cites collection task item 36, which the PRD does not list as out of scope
- `requirements.md` 141 against `PRD.md` 33-38, which lists items 37-46 and 48 only. Add item 36 (and "thresholds the owner sets") to the PRD's out-of-scope list so that both files agree. Related: `requirements.md` 28, 104 and 141 write "collection task item 48" and "item 37" without ever naming the task `oferty-pracy-sz5`, which is named only in `PRD.md` 33. Name it once in the "Sources" paragraph.

### N5. The strip's label "W toku" collides with the state "W toku"
- `requirements.md` 9 (state W toku means running), 147 (T4-R01 counts queued or running), 161 (T4-AC01: "W toku shows 3" with two queued and one running). The same label means two sets. Also, the labels "W toku", "Wymaga uwagi", "Nowe w 24 h" appear only in the criteria (161-163), not in the requirements T4-R01 to R03. Name the labels in the requirements and consider a label that does not reuse a state name.

### N6. T2 Scope calls "ads that become available again" out of scope but T2-R05 regulates them
- `requirements.md` 75 against 85. T2-R05 says an ad that appears again is not counted and is not new. Either remove the out-of-scope phrase or narrow it (for example, "changing the available flag back").

### N7. T1-AC02 conflicts with the default period
- `requirements.md` 57 (the page "lists all of them") against 41 (T1-R08, default is the last 7 days). Say that the check sets the period to "all" or that the test data lies within 7 days.

### N8. The same kept rule is stated twice with different criteria
- `requirements.md` 119 (T3-R10, T3-AC09) and 186 (T5-R07, T5-AC05). The second restates the first and covers only the Polish portals in its criterion. Keep it in one place and cite it from the other.

### N9. Wording for counts is fixed only for some numbers
- `requirements.md` 38 ("+N nowe", "N zmienione") and 92-93 ("2 niedostępne", "0 niedostępnych"). The row wording for 1, for 5 and for the unavailable count is given only by example in the T2 criteria, so the Polish plural forms are unspecified. A short sentence stating whether the labels are fixed text or inflected per number would remove a guess.

### N10. Grouping by day does not state whose day
- `requirements.md` 36 (T1-R03), "Dziś", "Wczoraj" and the date, and 150 (the 24 and 72 hour windows are exact hours). The time zone used for grouping is not stated. One clause settles it.

### N11. Requirements intro has no pointer to the open or confirmed decisions
- `requirements.md` 5-9 against `sq2 requirements.md` 7 and 492-494 ("Decisions of 20 November 2026"). Not required, but the "owner, <date>" citations point to conversations that are not recorded in any linked document (the PRD says only that the mock-up README records them, and that README predates the 22 November decisions, for instance it still lists scope and attempt number among the details that T1-R14 removes). A reader cannot trace a citation to a record. Link the record that holds the decisions of 22 November, or add a short decisions section.
