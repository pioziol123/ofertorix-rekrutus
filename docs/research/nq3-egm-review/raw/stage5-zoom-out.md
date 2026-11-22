# Stage 5 — Initial Zoom Out review (Skeptical Architect), epic oferty-pracy-nq3

Reviewed: PRD.md, requirements.md, solution-design.md (all in `docs/specs/nq3-panel-synchronizacji/`) and `docs/research/nq3-egm-review/tickets-export.md`. Baseline: GLOSSARY.md, architecture rules and the approved mock-up. Source code checked read-only (`modules/sources`, `server/api`, `app/pages/offers.vue`, `scripts`, `migrations`).

Context sufficiency: passes. The PRD says what and why (a panel that starts syncs of any source and keeps a history, with sync information removed from the offer list). The facts the SD records under "Data (Observed)" hold up against the code: no index starts with the ad, one unfinished run per source behind an advisory lock and partial unique indexes, the attempt number is gone, the final status is written conditionally in two places. The requested-sync path (`requestSync`/`admitRun`) already gives "one way of requesting any source" and "one unfinished run per source", and the SD reuses it. The set is well built and the reuse of `requestSync` is right.

Summary: 0 Blockers, 5 Majors, 12 Nits.

---

## 🟡 Major

### M1. New ads are stored at the end of a sync (PS-D01): premature optimisation that needs a new index, a backfill and a change on the critical final-status path
- Where: solution-design.md lines 26-27 (approach 1-2), 31-36 (contract), 69-72 (PS-D01), 82-84 (situations), 93-95 (rollout); requirements.md T1-R06 (line 39), T1-AC03 (line 58).
- Discrepancy: the stated reason is "optimising reads; the history is read far more often than a run ends". There is no measured bottleneck, and the data is small: at most 100 runs per page; one daily scheduled source plus manual runs gives low thousands of runs over months; the SD itself calls the count "one indexed query per run". The architecture rules (costs of design decisions, item 5) accept a stored copy only for a need to keep the state from a given moment; the performance reason is not one of those. The stored copy brings:
  - a permanent index on `source_run_seen` (write cost on every observation insert);
  - a one-time backfill migration;
  - a new SQL step inside both terminal paths. `finish` is already a transaction; `endFailedSyncRun` currently calls `finishRun` with no transaction, so that path has to be restructured;
  - a new failure mode on the critical path: a failing count query rolls back the final status, so the run stays `running` and the job is retried (SD line 82);
  - a window of null counts between migration and deploy (SD line 95), which the SD admits.
- Simpler options the SD does not discuss (it only discards "compute on read"):
  1. Compute on read for the runs of the page only, with the same index (or no index at this volume). No backfill, no change to the terminal paths, and live values for queued and running runs. T4's "new in 24 h" is bounded the same way.
  2. If a stored value is wanted, add it as a third per-batch counter next to `seen` and `revisions`. `saveBatch` already calls `addBatchToRunCounters(run.id, {uniqueAds, revisions})`, and `upsertObservedAd` can report whether the `source_ads` row was inserted, because an ad is created exactly when a run first observes it. The terminal paths stay untouched, the value is also live while the run is running (T1-R13 then needs no "—"), and the permanent index goes away. The one-time backfill can group by ad without a permanent index.
- Fair counterpoint to record if PS-D01 stays: the one real reason for a stored value is retention. If history cleanup (collection item 42, out of scope) ever deletes old runs, a value derived on read would change for later runs. The SD does not give this reason; it should, or the decision should be revisited. The decision is marked "Owner, 2026-11-22", so the Elephant should confirm that the owner saw these alternatives.
- Effect on size: if PS-D01 goes, T1 shrinks. At 17 requirements and 12 criteria it is near the "reviewable in one sitting" limit of docs/agents/implementation-workflow.md.

### M2. The source catalogue the panel needs does not exist as the SD describes it, and it is read twice
- Where: solution-design.md line 9 (module "owns the catalogue ... with display names and whether each infers unavailability"), lines 54-55 (history read returns `sources`), line 136 (T3 step 4, a second catalogue read with enabled, reason and unfinished run id); requirements.md T1-R08 (line 41, "every catalogue source"), T3-R02 (line 111, "greyed out with the reason it is disabled"), T3-R08 (line 117).
- Discrepancy, against the code:
  - `SourceConnector` has `name`, `infersUnavailabilityFromAbsence`, `scheduled` and `enabled(): boolean`. It has no display name and no reason for being disabled.
  - Display names exist only in the JobSpy and Polish catalogues. SOLID.Jobs and Himalayas have none.
  - The disabled reasons ("Wyłączone w konfiguracji", "Niepodłączone") exist only in the mock-up (index.html lines 169-172). In code, `sourceEnabled` is a configuration check and `connected: source !== 'google'` is hard-coded in `readSourceCatalog`.
  - `readSourceCatalog` is a public operation that already returns names, enabled and the latest run, for JobSpy and Polish. The SD never mentions it, never says whether the new read replaces, extends or sits beside it, and never says that the connector contract or catalogue must grow. Architecture rules, cost 3: "a second mechanism for the same thing"; the SD must search by meaning.
  - The `sources` list in the history read (id, name, infers flag) and the dialog's catalogue read (id, name, enabled, reason, unfinished run id) overlap. Moreover, the details read (line 61) returns neither "source enabled" nor "source has an unfinished run", which T3-R08 needs to show or hide "Uruchom ponownie". The rule "get everything from one call to each module" (architecture rules, dependency rule 2) points to one catalogue read used by the filter, the dialog and the details button.
- Rationale: an implementer will invent display names and reason texts, or build the second read. State one catalogue read, where names and reasons come from (the owner's wording is in the mock-up), and its relation to `readSourceCatalog` (which the CLI status scripts still use, so it is not dead after T5).

### M3. T4-R08 contradicts T4-R01/R03 and the SD on disabled sources
- Where: requirements.md line 154 (T4-R08: "Disabled sources are never counted or listed"), lines 147 and 149 (R01, R03: counts of all queued/running syncs and of all syncs finished in 24 h); solution-design.md line 171 ("their runs still count in in progress and new in 24 hours").
- Discrepancy: the requirement says never counted; the SD says they still count in two of the three figures. No acceptance criterion covers the case (T4-AC01 and AC03 have no disabled source), so a test-first implementer follows the requirement and a reviewer holding the SD fails it. A disabled source can still have an unfinished run (disabled meanwhile, T3-R05), so this is reachable.
- Rationale: pick one. Narrow T4-R08 to "needing attention" and the warning list (what T4-R02/R04/R05 already say), or change the SD, and add a criterion for it.
- Related small gap (Nit-level, same fix): "latest finished sync" (T4-R02, R04, R05) is not defined as latest by request or by finish time. The history orders by request time; one unfinished run per source makes them equal except for runs from before that rule.

### M4. Requirements and SD disagree on the "since" tooltip of T2, and T2-R03/T2-R04 overlap
- Where: requirements.md line 84 (T2-R04: tooltip "Liczone od <date the task was deployed>"), line 83 (T2-R03); solution-design.md lines 104-110 (approach 3-4), line 116.
- Discrepancy: the requirement says the deployment date. The SD derives "the finish time of the earliest run with a recorded value" and, until one exists, shows "Liczone od wdrożenia tej funkcji" with no date. These are different texts and dates, and T2-AC04 ("the tooltip of T2-R04") cannot be checked the same way. The derived date can lag the deployment by days (the first complete SOLID.Jobs run after it). It also adds a field to the history read contract (`unavailable counted since`) only to avoid recording a deployment date. A run that finished before the task as Niepełna or Nieudana is covered by both R03 ("only a complete sync marks") and R04 ("a sync that finished before the task"); the SD resolves it silently by status order (lines 106-109).
- Rationale: one text and one rule. Either make the requirement say "from the first complete sync after the deployment, or no date yet", or keep a plain deployment date. State which tooltip an old incomplete sync gets.

### M5. T5-R05 removes the offer list's automatic refresh for AI assessments, which is not sync information and is not in the PRD
- Where: requirements.md line 184 (T5-R05), line 194 (T5-AC03); solution-design.md lines 192 (approach 3, "the timer that reloaded the list"); PRD.md lines 28-31 and 46 (only sync information and the import form leave the offer list); tickets-export.md lines 285-290 (nq3.5 description: "samoczynnego odświeżania").
- Discrepancy: the timer in `app/pages/offers.vue` (lines 199-210) refreshes the list when `matching.pending > 0` (a pending AI assessment) or when a Polish import is unfinished. Removing the whole timer also stops the offer list from showing a finished assessment without a manual reload. That is a visible change to the assessment flow of the Matching module, in an epic about syncs. The PRD never names it; the PRD "What changes" and "Success" read as if only sync information goes. The requirement records the owner's decision (2026-11-22) but the PRD does not carry it.
- Rationale: either keep the assessment refresh (remove only the Polish-import branch of the timer, the minimal change) or state the removal in the PRD (What changes, Success) so the owner and any reader see it. Without that, a reader of the PRD would not expect T5-AC03.

---

## 🟢 Nits

### N1. "Fixed panel scope" is an existing default, not a new construct
- Where: solution-design.md line 134 (T3 approach 1); requirements.md T3-R03 (line 112).
- SOLID.Jobs, Himalayas and every JobSpy source already ignore a scope request and use fixed PHP/senior parameters. For a Polish portal, `polishQuery` already defaults to technology PHP, level senior, 50 ads, 5 pages, 60 requests. So "the panel's fixed scope" is `requestSync({source, scopeRequest: {source}})` for the Polish portals and nothing for the rest. Say that, so an implementer does not add a new scope definition beside the connector's own.

### N2. T1 ships a placeholder that T2 replaces; recording the count waits for the display
- Where: requirements.md T1-R05 (line 38), T1-AC04 (line 59), T2-R02 (line 82); solution-design.md line 57; tickets nq3.2 depends on nq3.1 (lines 152-153).
- T1-AC04 ("— niedostępne" for a finished sync of such a source) becomes false after T2, so its test has to be rewritten. The ads marked unavailable cannot be reconstructed later (PRD line 59), yet recording is scheduled after the whole history page. Recording the count (column plus the count from the existing marking statement) does not need T1; only its display does. Consider making the recording independent of nq3.1, or putting it into T1, so no run is lost while the page is built.

### N3. Time zone of "today", "Dziś/Wczoraj" and the day groups is not stated
- Where: solution-design.md line 47 (`today` = "since local midnight"); requirements.md T1-R03 (line 36), T1-R08 (line 41).
- The codebase uses Europe/Warsaw explicitly (`offers.vue` date helpers; the daily schedule). "Local" can mean the server's zone (often UTC in a container) or the browser's. Name the zone, so the grouping and the `today` filter agree.

### N4. The PRD points at the mock-up README as the record of decisions, but that README contradicts the requirements in places
- Where: PRD.md line 7; README `docs/prototypes/synchronizacje/README.md` lines 40 (attempt "out of 3"), 42 (self-refreshing panel and a navigation dot), 69 (scheduled syncs "marked Harmonogram" in the list; line 71 says the list shows no trigger); requirements.md T1-R04, T1-R14, out-of-scope item 48.
- A fresh reader following the PRD to the README would implement live updates and an attempt number. Say in the PRD that the requirements win over the README where they differ. Also: requirements.md line 141 puts "which sources can never be synced completely (item 36)" out of scope for T4; the PRD's out-of-scope list (lines 33-38) does not mention item 36.

### N5. Known limit of the health warning is not in the PRD
- Where: requirements.md T4-R04 (line 150) and line 141; PRD.md lines 19, 44-45.
- Only SOLID.Jobs is scheduled; the other sources run only when someone starts them. Every enabled source that is not synced for 3 days, or never was ("nigdy"), is listed, and a source whose scope can never complete is listed always. The PRD's Success promises only that such a source "is pointed out". State the consequence (a long permanent list for on-demand sources) and the pointer to item 36, so the owner sees what the warning will show on the first day.

### N6. Bespoke UI detail in the product documents, and a heavy pager
- Where: requirements.md T1-R07 (tooltip 16 px from the window edge, line 40), T1-R09 (page list that filters by typed digits, Backspace, Enter, Escape, line 42), T1-AC05, AC07.
- These are owner-approved on the mock-up, so only a YAGNI remark: a typed-digits page jump for a list of a few pages, and tooltip geometry, are altitude drops for a requirements document and bespoke UI for a single-owner tool. A standard page select would meet "go to a page". If kept, T1 is the largest task of the epic (see M1).

### N7. T5 also removes the status routes, which no requirement or criterion covers
- Where: solution-design.md line 191 (approach 2: "status routes of the JobSpy and Polish portals ... only the offer list and tests used"); requirements.md T5 (lines 178-186); criteria T5-AC02, AC05.
- The README (lines 130, 174) and `docs/architecture/README.md` line 122 document `GET /api/sources/jobspy` and `GET /api/sources/polish` as operator status endpoints next to the CLI commands, so "only the offer list and tests used" is incomplete. Removing dead routes is reasonable, but the observable change (GET becomes "not found") has no requirement or criterion; add one, or keep the GET routes (the minimum change satisfies T5-R04 by removing only the POST).

### N8. The new request route must keep the guards of the route it replaces
- Where: solution-design.md line 136 (T3 step 3), "Situations" table lines 148-150.
- `server/api/sources/polish.post.ts` checks the Origin, the content type and the body size (`limitedBytes`) before it requests a sync. The new state-changing route should reuse those guards; the SD says only "validate input". One line closes it.

### N9. After confirming a request, only the state filter is set
- Where: requirements.md T3-R07 (line 116).
- If the owner filtered by one source or by trigger "schedule" before confirming, the new manual syncs of other sources are hidden although "Zlecono N" is shown. State whether the other filters are cleared or kept, and say so in T3-AC07.

### N10. Ordering of T5 against T4
- Where: tickets-export.md lines 323-324 (nq3.5 depends only on nq3.3); requirements.md T5-R02 (line 181).
- After nq3.5, and before nq3.4, the owner loses "Ostatni import był niepełny" and the SOLID.Jobs last-import date and has no replacement (the health strip arrives in T4). Make nq3.5 depend on nq3.4 or accept the gap explicitly.

### N11. New domain words are not in the glossary
- Where: PRD.md line 3 ("Terms follow the glossary"); requirements.md lines 38-39 (new, changed, marked unavailable); GLOSSARY.md.
- "New ad of a sync" (new to its source) and "changed ad" are defined only in requirements T1-R06 and the SD. "New" also collides with "new offers" (collection items 45-46). Add the two terms, using the glossary skill's format, so later documents do not drift.

### N12. Small consistency items
- solution-design.md line 84 (backfill "runs while the application is stopped by the deployment") against line 95 (a run can finish between migration and new code). Pick one.
- tickets-export.md lines 50, 128, 177, 242, 300: the PS-AC02 link `/architecture/moduly-i-zasady-kodu.md` does not resolve from a ticket (a leading slash, no `docs/`).
- tickets-export.md lines 37-40 (nq3.1 description) repeats a design decision (stored count, backfill) although tickets should point at the documents and hold no copy of their rules (docs/agents/implementation-workflow.md, "The implementation task").
- Navigation is repeated markup in `offers.vue`, `profile.vue`, `companies/[id].vue` (and `companies/index.vue`), not a shared component; T1-R01 ("every page that has the navigation") means editing each. The SD says "only gain a navigation link", which is accurate; mention the count so the criterion T1-AC01 is checked on every page.
