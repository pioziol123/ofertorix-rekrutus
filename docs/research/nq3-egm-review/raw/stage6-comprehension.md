**What this proposes**

A new page "Synchronizacje" for a single owner who collects job ads from several sources. The page shows a history of every "ad sync" (one fetch of ads from a source, manual or scheduled) as one line per sync: time, source, result (new ads, changed ads, ads marked unavailable) and a state label (queued, running, complete, incomplete, failed). A drawer shows the details and the error text. The page has filters, paging, and an address that carries the view. From the same page the owner can request a sync of one, several or all enabled sources through a dialog, with a fixed search scope "PHP · senior", and can re-request a sync from its details. A summary strip counts syncs in progress, sources needing attention and new ads in 24 hours. A warning lists sources with no complete sync for 72 hours or with 3 failed syncs in a row. Finally, all sync information and the Polish portals' import form are removed from the offer list, and so is its self-refresh timer. The work is split into five bd tasks, T1 to T5. T2 depends on T1. T3 depends on T1. T4 depends on T1 and T3. T5 depends on T3.

**How the existing system works, per this document**

A "Sources" module owns a catalogue of sources (display name and a flag for whether the source "infers unavailability from absence"), the sync runs, the observation history and the content versions. A sync run belongs to a "scope" of one source. It stores trigger, status, request/start/finish times, counts (`pages`, `seen`, `revisions`), an error text and diagnostics. An advisory lock and unique partial indexes keep a source at one unfinished run. A run reaches its final status either through the worker, in the same transaction as marking absent ads unavailable, or through the failure handler after the job's last attempt. The observation history has one row per (run, ad), keyed by run first. Before this epic the browser could start only the Polish portals, through a form on the offer list. SOLID.Jobs, Himalayas and the JobSpy portals started only from the command line, and SOLID.Jobs also from a daily schedule. Neither the "new ads" count nor the "marked unavailable" count was stored. The offer list read currently returns sync state and the portal catalogues, and the offer page reloads itself on a timer.

---

# Findings

No 🔴 Blocker: every section could be paraphrased. The findings below are places where the paraphrase needed a guess, or where two documents disagree.

## 🟡 Major

### M1. "Scope" is used for at least three different things and is never defined
- Files and lines:
  - requirements.md: line 37 (T1-R04, "no scope"), line 40 (T1-R07 tooltip, "ustawiony zakres źródła"), line 86 (T2-R06, "the ads of the scope that earlier syncs saw"), line 112 (T3-R03, "Fixed scope … PHP · senior").
  - solution-design.md: line 15 ("belongs to a scope of one source"), line 33 ("every scope of a source counts as the same source"), line 177 ("existing order of runs per scope").
- Rationale: the reader cannot tell what a scope is, so these questions have no answer:
  - Is a scope a search query (technology and level), a fixed set of search parameters, or the whole portal range?
  - Is "one unfinished run per source" really per source or per scope? Line 18 says per source and line 177 says "per scope".
  - T2-R06 limits marking to "ads of the scope". What happens to an ad that another scope of the same source saw earlier?
  - T1-R06 and the SD deliberately merge all scopes of a source for counting new ads, yet the marking step works per scope. Nothing says why the two rules differ.
  - The row shows no scope (T1-R04), so a reader cannot tell syncs of different scopes apart.
  - T3-R08 "Uruchom ponownie" re-requests with the fixed scope. The reader cannot tell whether that equals the scope of the sync being repeated.
- Needed: a one-sentence definition of "scope" and of the relation between scope and source.

### M2. The label "W toku" names two different things
- Files and lines: requirements.md line 9 (state W toku = running), line 116 (T3-R07, "W kolejce and W toku" as two states), line 147 (T4-R01, "queued or running"), line 160 (T4-AC01, "two queued and one running… 'W toku' shows 3").
- Rationale: as a state, "W toku" means running only, and queued is "W kolejce". As the strip tile it counts queued plus running. The PRD (line 17) calls the tile "syncs in progress". An implementer or tester will not know whether the tile or the state is meant. The tile also shares its name with the state-filter value, so the strip looks like it should match the filter.
- Needed: either rename the tile (for example "W kolejce i w toku") or state in T4-R01 that the tile's name differs from the state's.

### M3. Disabled sources in the strip: the requirements and the SD contradict each other
- Files and lines: requirements.md line 154 (T4-R08: "Disabled sources are never counted or listed"); solution-design.md line 171 ("Disabled sources are left out of needing attention and the warning list; their runs still count in in progress and new in 24 hours").
- Rationale: "never counted" and "their runs still count" cannot both hold for "in progress" and "new in 24 h". T4-R01 and T4-R03 themselves do not mention enabled or disabled. T4-R02 and T4-R04 say "enabled sources". The SD's reading is plausible, but a reader of the requirements alone gets the opposite. T4-AC02 and AC04 test only the needing-attention and warning cases, so no criterion decides this.

### M4. Normative texts are only "those of the mock-up", which sits outside the reviewed documents
- Files and lines: requirements.md line 7 ("the mock-up is evidence of layout and wording"), line 40 (T1-R07: "the texts are those of the mock-up", only the Pełna text is quoted), line 60 (T1-AC05).
- Rationale:
  - The four other state tooltips (W kolejce, W toku, Niepełna, Nieudana) are not given. T1-AC05 says only "its meaning in a tooltip".
  - Line 7 says the mock-up is evidence of wording, not of data. Line 40 makes it the source of the requirement's text.
  - A reader without the mock-up cannot write or check those texts.
  - The same applies to "variant C" (PRD line 7). Only its gist is given, which is acceptable for the PRD but not for the exact wording.
- Needed: quote the four missing tooltip texts, or say explicitly that the exact text is taken from the mock-up README and cite the section.

### M5. What a finished sync shows when its stored "new ads" is null is undefined, and the requirements say it cannot be null
- Files and lines: requirements.md line 39 (T1-R06: "Both are known for syncs from before this task"), line 38 (T1-R05); solution-design.md lines 35-36, 95, 171 (T4 "runs without a stored count add 0"); also solution-design.md line 83 ("application stopped by the deployment") against line 95 ("a run finishing between the migration and the new code").
- Rationale:
  - The SD accepts that a run finishing between the migration and the new code stays null and "show[s] '—'". The requirements do not know this case. T1-R05 prescribes "+N nowe" for a finished sync and T1-R13 prescribes "—" only for queued and running syncs.
  - T4-R03 (via the SD) treats null as 0, but the row shows "—". The two readings differ.
  - The SD is internally inconsistent about deployment. Line 83 says the backfill "runs while the application is stopped". Line 95 says a run can finish between migration and new code. If the application is stopped, no run can finish.
  - T1-AC03 ("this holds for syncs stored before the task") cannot hold for such a run.
- Needed: state in the requirements the display for a finished sync with null new ads, and remove or explain the "stopped" versus "between" conflict.

### M6. "Enabled" and "disabled" sources, and the "reason it is disabled", are never defined
- Files and lines: requirements.md line 9 ("enabled or not"), line 111 (T3-R02), line 114 (T3-R05), lines 148, 150, 154; solution-design.md line 135.
- Rationale: enabled and disabled are central to T3 (which sources can be checked), T4 (which are counted) and T1 (the filter lists all). Nothing says what makes a source disabled, who sets it or where that is read. The dialog must show "the reason it is disabled" (T3-R02, SD item 4), and the only hint is "the catalogue". Without a list of possible reasons, T3-AC02 cannot be checked ("a disabled source its reason"). Also unclear is the case where a source is disabled while it has an unfinished sync. T3-R08 covers only "disabled source" for the restart button.

### M7. Core domain nouns are defined only through the glossary link, and "ad", "offer" and "content version" are not told apart
- Files and lines: PRD.md line 3 ("Terms follow the glossary"); requirements.md line 3, line 9 ("have their glossary meaning"), line 39 (T1-R06: "new content versions"); PRD.md line 38 ("The panel counts ads, not offers"); solution-design.md line 11.
- Rationale: the documents do link the glossary, but they name no individual glossary entry. The reader must still guess these things:
  - what an "ad" is as against an "offer", and why the panel deliberately counts ads and the Offers module is "not involved";
  - what a "content version" (a saved revision of an ad?) is;
  - what "complete source sync" means beyond the one tooltip sentence;
  - what "ad unavailable at the source" means: only that the ad disappeared from the source, or also other states.
- The "changed = content versions minus new" rule also assumes every new ad creates exactly one content version. That is never stated. Hence "never below zero" has no explanation.
- Needed: one inline sentence each for ad, offer, content version and complete sync, or per-term links.

### M8. The trigger of a sync started from the command line is not stated
- Files and lines: requirements.md line 9 ("A sync's trigger is manual or the daily schedule"), line 34, line 119 (T3-R10), line 118 (T3-R09: "A sync requested from the panel is manual"); solution-design.md line 15 (`manual`, `scheduled`).
- Rationale: three ways of starting exist (panel, command line, schedule) but only two triggers. The reader must guess that a command-line sync is "manual". The history filter "Trigger", the drawer icon ("Uruchomiona ręcznie") and T1-AC02 depend on it. The SD says the schedule exists only for SOLID.Jobs. Could another scheduler value exist? Nothing says.

### M9. After "Uruchom ponownie", it is not stated whether the list and the strip reload
- Files and lines: requirements.md line 117 (T3-R08), line 116 (T3-R07), line 153 (T4-R07: strip reloaded "after a confirmed request of T3-R07"); solution-design.md line 136.
- Rationale: T3-R07 describes the post-confirmation behaviour (summary, one reload, state filter set). T3-R08 says only that the details of the new sync open. The list behind the drawer is not said to change. The "in progress" count is not said to change either, and T4-R07 ties reloading to T3-R07 only. A reader cannot tell whether the new queued sync appears in the list or whether the strip count goes up.
- Related gap in T3-R07: it sets the state filter to W kolejce and W toku. The text does not say whether the source filter, period (default 7 days), trigger and page stay as they were. A leftover source filter or a 7-day period could hide the syncs just requested, or an unfinished run older than 7 days.

### M10. Precedence and wording of the "—" cases for unavailable counts differ between the requirements and the SD
- Files and lines: requirements.md lines 83-84 (T2-R03, T2-R04), line 38 (T1-R05), line 95 (T2-AC04); solution-design.md lines 106-110.
- Rationale:
  - T2-R04 says "A sync that finished before this task keeps '—'" (any status, tooltip with the deployment date). T2-R03 gives an incomplete or failed sync a different tooltip. For a pre-task incomplete sync the two requirements collide, and T2-AC04 as worded would give the R04 tooltip. The SD item 3 resolves it silently by testing "incomplete or failed" first.
  - The requirements promise the date "the task was deployed". The SD derives it from "the finish time of the earliest run with a recorded value". These are different dates in general, and there is a third fallback text ("Liczone od wdrożenia tej funkcji").
  - It is unclear whether the row text is "—" alone or "— niedostępne" after T2. T1-R05 line 38 uses "— niedostępne", T2-R03 line 83 says "shows '—' in the row".
- Needed: one precedence rule and one source for the date.

### M11. A persistent failure in storing "new ads" can leave a run unfinished, and one unfinished run blocks its source
- Files and lines: solution-design.md lines 18, 27, 82.
- Rationale: both final-status paths (worker and failure handler) now compute the count in the same transaction as the status. The table (line 82) says a failure rolls back, the job is retried, and "the failure handler is delivered again by the queue". It does not say what ends the run if the count query keeps failing. Both paths fail, so the run stays "running", and the "one unfinished run per source" guard (line 18) then blocks every later sync of that source. The document does not say whether this is accepted, or whether the failure handler stores the status without a count in that case.

## 🟢 Nit

### N1. Source families are named but not enumerated
- PRD.md line 11, requirements.md lines 38, 119, solution-design.md line 135. "Polish portals" and "JobSpy portals" are never listed. The reader does not know which sources infer unavailability from absence. T2 puts that "out of scope", yet T1-AC04, T2-AC01 and T3-AC03 need such a source. A short table (source, family, infers unavailability, trigger paths) would remove the guess.

### N2. Time zone of "today", "Dziś" and day grouping
- requirements.md line 36 (T1-R03), line 41 (T1-R08); solution-design.md line 47 ("since local midnight"). "Local" is not tied to a place (server or browser). The page groups rows, and the history read filters, so the two could disagree near midnight.

### N3. "Pages" is overloaded
- requirements.md line 112 ("5 pages and 60 requests" of the Polish portals) against the panel's own pages (T1-R09), and solution-design.md line 15 (`pages` as "portions"). The drawer shows "portions fetched" (T1-R14). The Polish limit text reads like panel pages.

### N4. Status names and Polish labels are mapped only implicitly
- solution-design.md lines 15, 45 (`queued`, `running`, `complete`, `partial`, `failed`) against requirements.md line 9 (W kolejce, W toku, Pełna, Niepełna, Nieudana). The mapping is natural but not written. "partial" must be guessed to be "Niepełna". Also line 46 uses `scheduled` against "schedule" at line 41.

### N5. Whether `seen` updates while a sync is running
- requirements.md line 38 (T1-R05: "the number of ads found so far"), line 46 (T1-R13); solution-design.md line 15. The SD says only that `seen` is the number of unique ads seen. Whether it is written during the run is not stated, so the "so far" display and T1-AC04 depend on an assumption.

### N6. Time-bound criterion
- T1-AC04 (requirements.md line 59, tickets-export.md lines 62-64) requires "— niedostępne" for a finished sync, but T1-R05 limits this to "until T2". After T2, the T1 criterion is false. The T1 ticket carries it with no expiry note.

### N7. "Needing attention" counts sources, the PRD says syncs
- PRD.md line 17 ("the syncs needing attention") against requirements.md line 148 (T4-R02, "number of enabled sources"). The wording differs, and the tile name "Wymaga uwagi" appears only in T4-AC02 (line 161), not in the requirements.

### N8. Collection-task item numbers are given without a link
- PRD.md lines 33-38 and requirements.md lines 28, 104, 141 cite "item 36/37/39/48" of `oferty-pracy-sz5`. The reader cannot resolve them from the documents. "Item 36" (sources that can never sync completely) matters for T4: a source that always ends Niepełna would be flagged forever.

### N9. Prefix "PS-" is not explained
- requirements.md lines 19-20 (PS-AC01, PS-AC02) and solution-design.md line 69 (PS-D01). The decision numbering exists for T1 only. The reader may think T2-T5 had no decisions.

### N10. "Navigation" and "Odśwież widok"
- requirements.md line 34 (T1-R01) and 180 (T5-R01). The navigation and the "Odśwież widok" button are introduced as known, with no description.

### N11. Wording that hides the mechanism
- solution-design.md line 134 ("the existing one-way request of a sync"), line 28 ("as the offer list does with its details"), line 32 ("run that never started"), line 18 ("a dead worker"), line 190 ("the JobSpy and Polish portals' catalogues"). Each leans on existing code. "Catalogues" in T5 also clashes with "catalogue sources" in the requirements (line 9).

### N12. "Uruchom ponownie" and scope
- requirements.md line 117. The name suggests repeating the same sync, but it always uses the fixed scope PHP · senior (T3-R03). An earlier sync started from the command line with another scope would be repeated with a different one. This follows from M1, but the owner-facing label may mislead.

### N13. PRD wording about the fixed scope
- PRD.md line 27 ("Every source searches one fixed scope") reads as a global rule. SD line 138 says it applies only to requests from the panel. The command line and the form (until T5) still accept other scopes.

### N14. Ads that return after being marked unavailable
- requirements.md line 85 (T2-R05: "not counted separately"). It does not say what is not counted, or whether a returning ad is "changed" in T1-R06. PRD line 36 says the case is out of scope, so a pointer would settle it.

### N15. Tickets (tickets-export.md)
- Field "Spec:" is `requirements.md` for nq3.1 and nq3.2 (lines 33, 111) and `PRD.md` for nq3.3, nq3.4 and nq3.5 (lines 161, 226, 283).
- The path in PS-AC02 (lines 51, 128, 177, 242, 300) is `/architecture/moduly-i-zasady-kodu.md`, which does not resolve from the repository root. The requirements use `../../architecture/...`.
- Ticket criteria cite requirement IDs (T1-R08, T2-R03, T2-R04, T3-R06, T3-R07) with no text. The reader must open requirements#tN, which only the METADATA links reach. The ticket lists criteria but not their "Check" column, so the way of proving each is lost.
- The ticket descriptions are Polish and the criteria English. The epic lists its children in a different order from the numbering (lines 20-24), and nq3.3's ticket gives no reason for depending on nq3.1 (line 214), or nq3.4's on nq3.3 (line 274).
- The epic page (line 8) states a PRD link but not the stage-to-task mapping that PRD "Stages" implies.

### N16. Dependencies not justified
- Tickets: nq3.2 (T2) depends on nq3.1 and nq3.5 on nq3.3 only. The documents never state why, for example T2 needs T1's end-of-sync transaction (solution-design.md line 104 says "next to the new ads of T1"). A reader of the tickets alone sees a bare edge.

---

# Count

- 🔴 Blocker: 0
- 🟡 Major: 11
- 🟢 Nit: 16
