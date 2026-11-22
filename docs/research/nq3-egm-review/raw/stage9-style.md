# Stage 9 style review (egm-style, Mode: REVIEW)

Range: `docs/specs/nq3-panel-synchronizacji/solution-design.md` (whole file), `docs/research/nq3-egm-review/tickets-export.md` (epic nq3 and tickets nq3.1 to nq3.5).
Context: `GLOSSARY.md`. Not read: PRD.md and requirements.md (outside range). Findings that depend on them are marked.

Overall: the prose is dry, factual and mostly free of fluff, hyperbole and subjective judgments. No Blockers. The main problems are terminology collisions (same word, different meaning; different words, same meaning) and a few claims that contradict each other inside the range.

Counts: 🔴 0, 🟡 6, 🟢 10.

---

## 🟡 Major

### M1. "W toku" means two different sets
- Files: tickets-export.md, nq3.3 T3-AC07 (lines 196-197) vs nq3.4 T4-AC01 (lines 244-245); solution-design.md line 164 ("in progress counts queued and running runs"), line 136 ("already running").
- Discrepancy: T3-AC07 names the state filter "W kolejce i W toku" as two separate states, so "W toku" is `running`. T4-AC01 counts two queued and one running sync as "W toku" = 3, so there it is `queued` + `running`. The SD uses "in progress" for the strip and "already running" for a source whose unfinished run may be `queued`.
- Rationale: one label has two meanings and "running" is both a status (`running`) and a umbrella word. A reader cannot tell which set a given "W toku", "in progress" or "already running" names. Give the strip counter and the status distinct names, or state the mapping once (strip "W toku" = queued + running; status `running` = "W toku" in the filter), and rename the T3 outcome "already running" to "already unfinished" or the Polish "już trwa".

### M2. Terms "run", "sync" and "sync run" used interchangeably; `partial` vs "incomplete"
- File: solution-design.md throughout (T1 "run", T1 line 63 and 138 "sync", T2 line 106 "incomplete or failed run", line 15 `partial`); tickets use "sync", "Niepełna", "incomplete".
- Discrepancy: the glossary defines **Ad sync** and **Incomplete source sync**. The SD introduces "sync run" (line 15) and then "run" and "sync" both for the same entity ("the open run" line 65, "the open sync" line 26; "unfinished run" line 17 vs "unfinished sync" in tickets nq3.3). Status `partial` (line 15) is called "incomplete" (line 106, T2-AC03) and "Niepełna" (T1-AC10, T4-AC02) with no mapping stated. `complete` appears as "complete run" while the glossary term is "Complete source sync".
- Rationale: the glossary is the authority; "run" and `partial` are not in it. Pick one entity name (suggest "sync", per glossary) and one line stating `queued`/`running`/`complete`/`partial`/`failed` = W kolejce/W toku/Pełna/Niepełna/Nieudana (Polish names for `complete` and `queued`/`running` are never given in the range).

### M3. "Needing attention" reuses a glossary term with another meaning
- Files: solution-design.md lines 163, 170; tickets nq3.4 description and T4-AC02.
- Discrepancy: the glossary (AI module, Assignment status) defines **Needs attention** / "wymaga uwagi" as a non-final AI assignment status, with "failed" listed under Avoid. T4 uses "needing attention" / "Wymaga uwagi" for a count of sources whose latest finished sync failed or was incomplete. The SD also never states the condition (reasons are given only for the warning list, line 170); it is found only in T4-AC02.
- Rationale: two concepts under one glossary-registered name. Add a one-line disambiguation (sync-health term, not an AI assignment status) and state the condition in the SD contract (line 170).

### M4. Claim and its own caveat contradict: migration timing
- File: solution-design.md line 83 vs lines 95-96.
- Discrepancy: line 83 says the backfill "runs while the application is stopped by the deployment". Line 95 says migrations run "as every migration of the project does at start-up" and then describes "a run finishing between the migration and the new code", which cannot happen if nothing runs while the application is stopped.
- Rationale: both statements describe existing deployment behaviour and neither cites evidence. They cannot both be true as written. CALIBRATE: state the real order (which process runs the migration, whether the old worker is still running) once, and keep the owner-accepted gap only if it is reachable. The accepted gap itself (line 95) is a concrete owner decision: KEEP.

### M5. T5 "No operation is added or altered" contradicts its approach
- File: solution-design.md line 197 vs lines 190-192.
- Discrepancy: T5 changes the offer list read (stops returning sync state and catalogues) and removes HTTP routes, yet the section "Situations per operation" says no operation is altered.
- Rationale: a factual claim that the section's own Approach disproves. Replace with "operations removed: ...; offer list read narrowed: ..." or drop the claim.

### M6. T1-AC10 cannot be matched to the SD of T1
- Files: tickets-export.md nq3.1 T1-AC10 (lines 79-83); solution-design.md lines 53-61, 57, 108-110.
- Discrepancy: the ticket asks for "the four numbers ('nie dotyczy' for a source that does not infer unavailability)" and "the course without an attempt number". The T1 details read (SD lines 59-61) returns seen, new, changed and `pages`, and says "The unavailable count is not part of T1". The "nie dotyczy" text is delivered in T2 (SD line 106). "The four numbers" and "the course" ("przebieg") are not defined in the range (may be defined in requirements.md, not read).
- Rationale: an acceptance criterion that names an unnamed set of numbers and an output the SD assigns to the dependent ticket. T1 cannot demonstrate it as written. Name the four numbers and move "nie dotyczy" to T2 or add it to the T1 contract. (Cross-document check; it may be a content blocker for T1 if requirements.md agrees with the ticket.)

---

## 🟢 Nit

### N1. "Job" used alone
- solution-design.md line 82 ("the worker's job fails"). The glossary says queue job; "job (alone)" is under Avoid. Use "queue job". "The queue retries it" is fine.

### N2. Table cell of line 82 is overloaded; column mismatch
- solution-design.md line 82, column "Resource limit". The cell holds the query cost, a rollback behaviour, retry behaviour and the failure handler's redelivery in one sentence chain. Rollback and retry belong to a failure column, not "Resource limit". Claims about queue retry and redelivery describe existing behaviour with no cited evidence; CALIBRATE by pointing to the rule or test that shows it, or DROP the redelivery clause.

### N3. Boilerplate cells in the "Situations" tables
- solution-design.md lines 84, 85, 177: "Same answer for the same state", "Same answer for the same state and time", "Reads committed state; a run ending during the read shows its earlier or later state" (repeated verbatim three times). No reader decision depends on them. DROP, or state once above the tables.

### N4. Vague quantity where the ticket gives a number
- solution-design.md line 177: "A few latest runs per catalogue source". T4 line 164 says three latest finished runs. Use "three".
- solution-design.md line 134: "their present limits" for the Polish portals. State the limits or point to T3-R03 only.

### N5. Undefined or jargon references
- solution-design.md line 134: "the existing one-way request of a sync" ("one-way" is not defined; name the operation).
- solution-design.md line 190 and nq3.5 description: "JobSpy", "SOLID.Jobs" are not in the glossary (the glossary only defines "harmonogram" for the daily sync plan). Add them or describe in words.
- "Observed" in the heading of line 13 is a tag with no explanation; say "Verified against the code on 2026-11-22" or drop.

### N6. Unquantified rationale
- solution-design.md line 70 "optimising reads; the history is read far more often than a run ends". "Optimising" and "far more often" carry no measure. Say what read cost is avoided (for example "avoids a join over the observation history per history request") or give the read-to-write ratio. The discarded option and cost accepted (lines 71-72) are concrete: KEEP.

### N7. Inconsistent field-name formatting
- solution-design.md: backticks for `seen`, `revisions`, `pages`; italics for *new ads*, *marked unavailable*; plain for "changed ads"; `pages` (portions) collides with the pager's "page" (lines 15, 48, 54). Use one convention and note that `pages` means portions of a sync, not pager pages.

### N8. Word mapping English to Polish not stated (found / seen / new / changed / refused / not found)
- Tickets: T1-AC04 "the ads found so far" vs SD `seen`; T3-AC03/T1-AC03 "*new*" and "*changed*" vs SD "new ads", "changed ads"; T5-AC02 "refused" vs SD line 197 "not found"; nq3.4 description "od 3 dni" vs 72 hours in AC and SD. Meanings match; the vocabulary does not. Use the SD's field names in the ACs and say "refused (not found)".

### N9. Broken or inconsistent path
- tickets-export.md PS-AC02 in all five tickets: "/architecture/moduly-i-zasady-kodu.md" lacks the `docs/` prefix and reads as a filesystem root path. SD line 3 uses `../../architecture/moduly-i-zasady-kodu.md`. Use the same relative or repository path.

### N10. Ticket header inconsistency
- tickets-export.md: nq3.1 and nq3.2 have "Spec: requirements.md" and "Zakres: sekcja T1 wymagań i projektu"; nq3.3-nq3.5 have "Spec: PRD.md" and "Dokumenty: requirements#t3, solution-design#t3". Same kind of reference, two forms. Also the descriptions are Polish and the acceptance criteria English with embedded Polish UI strings; the Polish UI strings are never glossed in English in the SD (for example "Czeka na start", "nie dotyczy", "Liczone od wdrożenia tej funkcji", "i N innych"). Acceptable as UI literals; a one-line note on the convention would remove the guesswork.

---

## Calibration notes (KEEP, no finding)
- SD lines 94-95 accepted gap of a null count, owner-decided: KEEP.
- SD lines 71-72 "Discarded" and "Cost accepted" under PS-D01 cite the architecture rule item: KEEP.
- SD line 83-84 "Page size at most 100" and line 150 "empty list rejected; page never sends one": concrete operator or reader decision: KEEP.
- No hyperbole, marketing language or subjective quality judgments found in either file.
