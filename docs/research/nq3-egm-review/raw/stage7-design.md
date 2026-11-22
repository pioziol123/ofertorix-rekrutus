# Stage 7 review — Design Critic Goldfish (egm-design), Mode: REVIEW

Scope: `docs/specs/nq3-panel-synchronizacji/PRD.md` and `requirements.md` (whole files). Standard: feature-spec-standard (problem, goals and non-goals, alternatives, risks and limits). Baseline: GLOSSARY.md, architecture rules, module map, mock-up README (variant C). The solution design was glanced at only to understand intent (the T1-T5 section lines I cite from it are labelled "design").

Totals: 0 Blockers, 10 Majors, 11 Nits.

Overall: the requirements are unusually testable (stable IDs, per-criterion checks, explicit kept behaviour). Traceability from PRD Success to T1-T5 is complete. The weak points are (a) the PRD has no risks or alternatives content at all, (b) the operating model of a snapshot-only panel (no refresh, stuck runs, noisy health signals), (c) a few unstated dependencies and silent product changes, (d) terms and boundaries the criteria rely on but never define.

---

## Majors

### M1. 🟡 PRD has no Risks and Limits and no Alternatives
- File: PRD.md, whole file (sections run Context, Problem, Goal, What changes, Out of scope, Success, Stages, Constraints).
- Discrepancy: the standard requires failure modes, security implications, scalability limits with mitigations, and alternatives with concrete rejection reasons. The PRD names none. The only trace of alternatives is the mock-up README (variants A and B), and it gives no reasons: B is "removed", A "stays for comparison". Nothing is said about a rejected option for the core structural decision (a separate page versus keeping sync controls on the offer list).
- Risks that no document in the range states, and that the PRD should list with a mitigation or an explicit "accepted":
  1. a one-click "Synchronizuj wszystkie" starts up to every source at once against external portals (JobSpy portals, scraped sites): a burst of requests, rate-limiting or blocking, and no stated concurrency expectation;
  2. a browser-reachable action that enqueues work: no statement that it has the same owner-only protection as other browser actions;
  3. unbounded history growth (cleanup is item 42, out of scope). At a handful of syncs per day this is small, so a one-line "accepted, with the estimate" is enough;
  4. the stuck, snapshot and noisy-signal risks in M2, M3 and M4.
- Rationale: a fresh reader cannot tell whether these were weighed. For an MVP a short "Risks accepted" list plus one line on why a page beats the alternatives is enough; the content must exist.

### M2. 🟡 A stuck unfinished sync can lock a source from the panel with no way out
- File: requirements.md T3-R04 (l.113), T3-R08 (l.117), T1-R12 (l.45); PRD.md l.58 and l.35 (cancelling is item 39).
- Discrepancy: one unfinished sync per source is a hard rule, the dialog refuses to check a source marked "już trwa", "Uruchom ponownie" is absent for queued and running syncs, and cancelling is out of scope. If a queued or running sync never reaches a final state (queue job lost, worker down for days, database restored), the source is blocked in the panel indefinitely. Nothing in the range says how such a sync is recognised, shown or cleared. The design (l.18) covers a dead worker through the failure handler after the last attempt, but not a job that never ran.
- Rationale: the new panel turns a command-line-only edge case into an owner-visible dead end. Add a requirement or a stated limit: for example, the panel shows how long a sync has been unfinished, and the recovery path (command line, or a documented operator step) is named. Otherwise record it as an accepted risk.

### M3. 🟡 The source-health signals will be permanently on for sources that cannot finish completely
- File: requirements.md T4-R02 (l.148), T4-R04 (l.150), T4 Scope (l.141, refers to "collection task item 36"), T3-R03 (l.112); PRD.md Success l.45.
- Discrepancy: Polish portals keep the caps of 50 ads, 5 pages and 60 requests per sync. The mock-up data (index.html l.198) shows that hitting the 50-ad cap ends a sync as Niepełna. Under the glossary ("complete = checked all ads in the set scope") a capped source is never Pełna. Then "Wymaga uwagi" counts it forever (T4-R02) and "Bez pełnej synchronizacji od 3 dni" lists it forever (T4-R04). The PRD does not mention this at all. T4 mentions it only as an opaque item number. PRD Success ("a source without a complete sync for 3 days is pointed out") is satisfied trivially and carries no information for those sources.
- Rationale: a warning that is always on trains the owner to ignore it, which defeats the goal "notice a source that keeps failing". The owner may have knowingly deferred item 36, but the PRD must then say so as a known limitation, name which sources are affected, and state the intended MVP behaviour (accepted noise). Otherwise the spec promises a signal it cannot deliver.

### M4. 🟡 Snapshot-only page with no refresh control and no staleness indicator
- File: PRD.md l.24 and l.38; requirements.md T1-R01 (l.34), T3-R07 (l.116), T4-R07 (l.153), T5-R05 (l.184).
- Discrepancy: the page "shows syncs as they were when it was opened" and never refreshes. The main flow (start syncs, then watch them) is therefore: confirm, see "W kolejce", then reload the whole browser page to learn anything more. No requirement provides an in-page refresh control. The offer list keeps "Odśwież widok" (T5-R01), so the panel is less capable than the page it was split from. Nothing shows when the data was read, so a row reading "W toku" can be hours old and look live. Item 48 (auto-refresh and a dot) is descoped, but a manual refresh is not in item 48 as the PRD describes it (l.38).
- Rationale: the strip's "in progress" count and the rows' states are the product's most time-sensitive data. Add a manual refresh (it reuses the reload that T3-R07 already performs) and an "as of HH:MM" label, or state explicitly that reloading the browser page is the intended means and accept the wrong-state risk.

### M5. 🟡 T5-R05 silently changes the AI-assessment behaviour of the offer list, outside the PRD
- File: requirements.md T5-R05 (l.184), T5-AC03 (l.194); PRD.md l.29-30, l.48-54 (Stage 5 = "Removing sync information from the offer list"), l.31-38.
- Discrepancy: T5-R05 says the offer list "never reloads by itself, also while an AI assessment is waiting". That removes a (presumed existing) automatic reload that shows a finished AI assessment. It is not sync information, and the PRD, the mock-up README and the PRD's list of owner decisions do not mention it. The PRD's out-of-scope item 48 concerns the sync panel only. Result: the owner now has to press "Odśwież widok" to see an assessment that finishes, in a different module's flow, as a side effect of a sync-panel epic.
- Rationale: a product behaviour change without PRD intent, without rationale and without a Goal line. Either add it to the PRD (What changes and the reason, for example that the reload was tied to the removed sync controls) or remove T5-R05/T5-AC03 from this epic. If the reload was only a mechanism of the removed section, say so, and then the AI-assessment case should not be in the criterion. A negative check "does not reload within 30 seconds" is also slow and weak as evidence.

### M6. 🟡 Stage order and dependencies are not stated; T5 can remove the only browser path to Polish portals
- File: PRD.md l.48-54 (Stages); requirements.md T5-R04 (l.183), T3 Scope (l.104), T4 (R03, R06 use T1's new-ads rule and source filter), T3-R07 (uses T1's state filter).
- Discrepancy: T5-R04 removes the only current browser start of the Polish portals and says it can then be done "from the panel (T3)". Nothing says that T5 must not ship before T3, nor that T3 and T4 need T1. The mock-up README (l.72) says sync information leaves the offer list "at the same time as the panel appears". The PRD's stage list only numbers the stages.
- Rationale: if stages are scheduled or merged independently, the owner can lose the ability to sync Polish portals from the browser, or lose the incomplete-import notice with no replacement (T4 not yet shipped). State the dependencies (T3 needs T1, T4 needs T1, T5 needs T3 and T4) in the PRD stage list, or confirm they exist as bd dependencies and cite them.

### M7. 🟡 The "unavailable" display rule contradicts itself between T1 and T2, and T1 is silent for the details
- File: requirements.md T1-R05 (l.38), T1-R13 (l.46), T1-AC04 (l.59), T1-AC10 (l.65); T2-R02 (l.82), T2-R03 (l.83), T2-AC03 (l.94).
- Discrepancy:
  1. T1-AC04 requires "— niedostępne" for a finished sync of an inferring source, with no "until T2". T1-R05 has "Until T2", the criterion does not. After T2 ships, T1-AC04 is false for every new complete sync, so a stable criterion becomes a failing regression test.
  2. T2-R03 says a failed or incomplete sync shows "—", while T1-R05 says "— niedostępne"; T2-R04 "keeps '—'". Whether the row text after T2 for those cases is "—" or "— niedostępne" is ambiguous, and T2-AC03 tests the shorter form.
  3. T1-R13 and T1-AC10 define the details number as "nie dotyczy" only for non-inferring sources. For inferring sources in T1 (before T2) the details value is unspecified.
- Rationale: criteria that are cited by ID and run as tests must stay true after later tasks. Scope T1-AC04 and the T1 details value explicitly to "before T2 ships" (or restate them as "no count recorded"), and fix one row string for the not-counted cases.

### M8. 🟡 Day, week and time-zone boundaries are undefined
- File: requirements.md T1-R03 (l.36), T1-R08 (l.41), T4-R03/R04 (l.149-150); design l.47 ("local midnight" appears only there).
- Discrepancy: grouping uses "Dziś", "Wczoraj" and a date. The period filter offers "today, last 7 days, last 30 days". Nothing states the time zone (owner's, browser's or server's) or whether "last 7 days" is a rolling 168 hours or calendar days, nor whether the period filters on request time (the grouping field) or finish time. A queued sync that spans midnight, or a server in UTC against an owner in Poland (+1/+2), gives different groupings and different default list content.
- Rationale: T1-AC02, AC06 and AC08 cannot be verified deterministically, and server-rendered versus browser-rendered pages could disagree. Define: the owner's time zone (one fixed zone is fine for a single-owner app), calendar-day grouping by request time, and the exact meaning of each period.

### M9. 🟡 "Enabled", "disabled" and "unconnected" sources are never defined
- File: requirements.md Words (l.9), T3-R01/R02 (l.110-111), T3-R05, T4-R02/R04/R08, T3-AC02; PRD.md l.17, 58.
- Discrepancy: "enabled" appears more than 20 times and decides which sources are pre-checked, startable, counted and listed. The range defines only "catalogue sources are every source the application knows, enabled or not". It does not say what makes a source enabled, who changes it, or what the "reason it is disabled" shown in the dialog is. The mock-up README (l.30) also greys out "unconnected" sources with their reason; requirements keep only "disabled", with no statement that "unconnected" was dropped or merged.
- Rationale: a fresh implementer cannot write T3-AC02 or T4-AC02/AC04 (disabled source cases) without guessing. Add one sentence in Words: where the flag and the reason text come from (the catalogue), and say whether unconnected sources exist.

### M10. 🟡 Required wording lives only in a throwaway mock-up that is not in version control
- File: requirements.md l.7 and T1-R07 (l.40), T1-AC05 (l.60).
- Discrepancy: T1-R07 gives one of five state tooltip texts and says "the texts are those of the mock-up". The other four exist only in `docs/prototypes/synchronizacje/index.html` (STATE help map, around l.183). The directory is untracked in git (`git status` lists it as `??`; the neighbouring `docs/prototypes/przeglad` is tracked). A runner working in a fresh worktree will not see it unless it is committed. The README calls the mock-up "throwaway", so it can be removed after the epic.
- Rationale: a criterion that depends on text outside the spec is unverifiable by an implementer who lacks the file. Put the five texts into T1-R07, or commit the mock-up and cite its path in the requirement.

---

## Nits

### N1. 🟢 PRD and requirements disagree on what "needing attention" counts; strip labels reuse defined words
- PRD.md l.28 ("the syncs needing attention") versus requirements T4-R02 (l.148: "the number of enabled sources whose latest finished sync is Niepełna or Nieudana"). PRD should say sources.
- T4-AC01 (l.160): the tile "W toku" counts queued and running syncs, but Words (l.9) defines W toku as running only; queued is W kolejce. T4-AC02 uses the label "Wymaga uwagi", which the glossary defines as a status of an AI assignment waiting for the owner (GLOSSARY, "Needs attention"). Two meanings of one term in one project. T4-R01 to R03 should name the four tile labels, and the labels should avoid the clashes (for example "Trwają" and "Do sprawdzenia").

### N2. 🟢 Post-action view is only partly specified
- T3-R07 (l.116) sets only the state filter. If the owner has a source, trigger or period filter active, the freshly requested syncs may not be in the list although the summary says "Zlecono N". T3-AC07 does not cover it. Also T3-R08 opens the details of the new sync but does not say the list and the strip reload (T4-R07 reloads them only after "a confirmed request of T3-R07"), so the drawer can show a queued sync that the list and the "in progress" count lack. Say whether other filters are reset, and whether "Uruchom ponownie" reloads list and strip.

### N3. 🟢 Polish plural in a fixed message
- T3-R06 (l.115) and T3-AC06 (l.130): "Nie udało się zlecić synchronizacji N źródeł" is ungrammatical for N = 1 (and 2-4), and AC06 tests exactly N = 1. Fix the text to a form that agrees with any N, or give the plural rule.

### N4. 🟢 Detail beyond MVP in T1
- T1-R09 (l.42): a clickable "Strona X z Y" opening a typed-digit-filtered list of all pages, with Backspace, Enter and Escape behaviours, and four page sizes; T1-R07: tooltip clearance of 16 px from window edges, tested at the right edge (AC05, AC07). All are owner decisions from the mock-up, so not wrong, but each adds a check and, at the volumes of a single-owner tool (the default view is 7 days), little value. Consider marking them "may be deferred" if T1 runs long. The implementer should know which are cuttable.

### N5. 🟢 Stored errors and diagnostics are shown "as stored"
- T1-R15 (l.48): the error text and connector diagnostics, which come from external portals, are shown unchanged. The architecture rule (moduly-i-zasady-kodu.md, "Diagnostics contain only the data needed", l.162) says diagnostics exclude sensitive data and secrets at write time, but the requirement does not confirm that stored diagnostics honour it, nor that long or markup-bearing text is escaped and size-bounded in the folded view. Add one criterion: text is shown as plain text, and a very long value does not break the layout.

### N6. 🟢 Syncs from before this epic may have other scopes, and the history hides it
- T3-R03 fixes the scope as PHP · senior, but history includes older syncs of Polish portals with other technology and level (README l.65: "Polish portals lose the technology and level fields"). T1-R04 shows no scope, and T1-R12 omits the scope that the mock-up details contain (README l.40) without an owner citation. T4-R04 counts a "complete sync" of any scope toward health, and "new" (T1-R06) treats every scope of a source as one source. One line stating that these choices are deliberate (and why) removes the doubt.

### N7. 🟢 Mechanics in the PRD
- PRD.md l.58: "The Sources module already offers one way of requesting a sync of any source and keeps a source at one unfinished sync; the panel uses both" is a module-level mechanism and an unverified claim about existing code (README l.53 says the browser can start only Polish portals today). Per the project convention it belongs in the solution design. Also l.59 (a data-availability fact) is a fine constraint but could state the owner-visible consequence only.

### N8. 🟢 The generic error sentence promises an action that may not exist
- T1-R15 (l.48): "Można ją uruchomić ponownie" is shown for every Niepełna or Nieudana sync. Until T3 ships there is no re-run in the panel, and for a disabled source T3-R08 offers none. Either tie the sentence to the presence of the button or accept the mismatch explicitly.

### N9. 🟢 Which sources "infer unavailability" is not named in the requirements
- T1-R05 (l.38), T1-R13, T2 Scope (l.75 "Out of scope: which sources infer unavailability"). The mock-up README (l.51) says only SOLID.Jobs does. A tester building T2-AC01 needs to know it. Name it ("currently SOLID.Jobs") or point to the catalogue attribute.

### N10. 🟢 T2-R04 date versus design
- T2-R04 (l.84) says the tooltip date is "the date the task was deployed". The design (T2 approach item 4, l.110) uses the finish time of the earliest run with a recorded value, with a different fallback text. Not a defect of the range, but the requirement text and the design differ, so one of them should be aligned in Stage 8.

### N11. 🟢 Two buttons for one dialog
- T3-R01 (l.110): "Synchronizuj wszystkie" and "Wybierz źródła" open the same dialog and differ only in the pre-check. The first label promises an immediate bulk action but needs a second confirmation. Owner-chosen in the mock-up; mention only so the label's expectation is a conscious decision.

---

## Count
- 🔴 Blocker: 0
- 🟡 Major: 10 (M1-M10)
- 🟢 Nit: 11 (N1-N11)
