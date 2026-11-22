# Stage 5 - Inventive Catalyst Goldfish (REVIEW mode), epic oferty-pracy-nq3

Reviewed: PRD.md, requirements.md, solution-design.md (SD), tickets-export.md. Baseline read: GLOSSARY.md, architecture rules, module map, mock-up README and index.html. Source checked: modules/sources (save-batch.ts, execute-sync-run.ts, sync-run-state.ts, request-sync.ts, read-sync-state.ts, infrastructure/persistence/*, connector contract and adapters), migrations/1770000000001_sources.cjs, app/pages/offers.vue.

Paths below are relative to /Users/piotrziolkowski/Documents/oferty-pracy. Spec paths: PRD = docs/specs/nq3-panel-synchronizacji/PRD.md, REQ = .../requirements.md, SD = .../solution-design.md.

Context sufficiency: passed. The objective (panel to start and read ad syncs, sync information off the offer list) is clear. Owner aims for MVP, so simpler alternatives are weighed highly.

Count: Blocker 0, Major 7, Nit 6.

---

## 🟡 Major

### M1. New ads are computed at the final status in two places; an incremental counter in the existing batch save removes the index, the second path and a stuck-run risk

- Where: SD lines 26-29 (approach 1-2), 31-36, 69-72 (PS-D01), 82 (situations row), 95 (rollout); REQ T1-R06 (line 44); PS-D02 (SD 74-76).
- False compromise accepted: "Stored value needs a write at the end of the run, so we must (a) add an index on the observation table by ad, (b) compute the count in a transaction on both finishing paths (worker `finish()` and the failure handler `endFailedSyncRun`), (c) backfill, (d) accept null for in-flight runs." The owner decided to store the value (PS-D01); the compromise is in HOW it is stored, not that it is stored.
- Evidence in code: the run already keeps incrementally maintained counters `seen` and `revisions`, updated in the same transaction as each batch (`modules/sources/save-batch.ts` calling `addBatchToRunCounters` in `infrastructure/persistence/sync-runs.ts`). `source_ads` is unique per (source, external_id) (migration 1770000000001), so "an ad this source never showed before" is exactly "the batch's upsert inserted the row". `upsertObservedAd` (`infrastructure/persistence/source-ads.ts`) is the single place that knows it.
- Proposed resolution (Segmentation / Preliminary Action, in the existing pattern): add `new_ads` to `source_sync_runs`; `upsertObservedAd` returns whether it inserted (for example `(xmax = 0) AS inserted` in the upsert's RETURNING); `saveBatch` counts inserts and passes them to `addBatchToRunCounters`. Changed ads can then be counted the same way (a revision added to an ad that already existed), so PS-D02 and the "minus, never below zero" clamp disappear. No change to `finish()` or `endFailedSyncRun`, no index on `source_run_seen`, the failure handler path and the "delivered again" row of the situations table vanish, and a running sync can show new and changed so far (T1-R13 "—" for running becomes optional). The one-time backfill stays, but it is one pass using the primary key (`DISTINCT ON (source_ad_id)` ordered by run request time, then id, grouped by run), because an ad belongs to exactly one source, so "of the same source" needs no extra join.
- Why it matters beyond elegance: the SD couples run finishing to a new query ("a failure rolls back the final-status transaction", SD 82). `endFailedSyncRun` is the last resort that ends a run whose worker died. If the count query fails persistently there, the run can never reach a final status and, with one unfinished sync per source, blocks that source for good. A counter written during the batch save cannot make finishing fail.
- Secondary liabilities: relies on the `xmax = 0` idiom (or an equivalent two-step insert); runs in flight during deployment undercount new ads (same class of gap the SD already accepts at line 95); the pre-B5 overlapping-run ordering edge (SD 33) is not reproduced by the incremental count, which is acceptable because only one run per source can be unfinished since B5.

### M2. T5-R05 removes the offer list's auto-refresh for AI assessment too, which is not sync information

- Where: REQ T5-R05 (line 184), T5-AC03 (194); SD T5 approach 3 (line 192).
- Code: `app/pages/offers.vue` lines ~199-211 hold ONE timer that reloads the list when `matching.pending > 0` OR a Polish-portal run is queued or running. The requirements remove the whole timer "also while an AI assessment is waiting". After this change, a bulk AI assessment started from the list no longer updates the ratings on the list; the owner must press "Odśwież widok". (The per-offer `OfferMatching.vue` keeps its own timer, so only the list view regresses.)
- False compromise: "the timer was an import-state feature, so delete it entirely."
- Proposed resolution: remove only the Polish-run branch of the condition (the sync part), keep the `matching.pending` branch. T5-AC03 becomes "with no AI assessment waiting the list never reloads by itself". Pattern: Extraction (separate the interfering concern, leave the other).
- Secondary liabilities: one timer stays in the offer page. If the owner really wants no polling anywhere, record it as an explicit decision that bulk assessment loses live refresh; the requirement text says "(owner, 2026-11-22)" but never names this cost.

### M3. The source-health warning will be permanently on for sources that are manual-only or never complete, which defeats its purpose

- Where: REQ T4-R02, T4-R04, T4-R05 (lines 148-151), T4-R08 (154); PRD Goal bullet 3 (line 19) and Success (line 45); out-of-scope item 36 (PRD 35 refers to REQ T4 scope 141).
- Evidence: only SOLID.Jobs is scheduled (`scheduled: true` in `solid-jobs/connector.ts`; every other connector declares `scheduled: false`). The 3-day rule T4-R04 applies to every enabled source, and "never had a complete sync" is also listed ("nigdy"). So on day one every enabled source the owner does not sync daily by hand (JobSpy portals, Himalayas, four Polish portals) is listed, and the list is capped to three names plus "i N innych". The mock-up README itself says LinkedIn always ends partial; "needing attention" (latest finished is Niepełna or Nieudana, T4-R02) will be at least 1 forever. The owner excluded "sources that can never be synced completely" (item 36) from this epic, so the epic ships a warning it knows will be noisy.
- False compromise: "one threshold for all sources is the simplest rule."
- Proposed resolution (Dynamics, reusing a field that exists): apply the 3-day staleness rule only to sources whose connector declares `scheduled`, or to sources that have at least one finished sync (no "nigdy" for sources never used). Keep "3 failed in a row" for every enabled source that has run, because failures are meaningful for manual syncs too. This is one condition in the read, no new data.
- Secondary liabilities: a manual-only source that the owner forgets never raises the staleness alarm; the owner loses "nigdy" as a nudge. Both are cheaper than a warning the owner learns to ignore. If item 36 is later built, a per-connector "complete result expected" flag fits the same place.

### M4. The catalogue the panel needs is assumed, not designed: display names, disabled reason and three overlapping reads

- Where: SD lines 9 and 55 (catalogue "with display names"), 136-141 (dialog read), 163-170 (health read); REQ T1-R08 (41), T3-R02 (111).
- Evidence: the connector contract (`modules/sources/infrastructure/adapters/connector.ts`) has `name` (a stable id), `enabled(): boolean`, `scheduled`, `infersUnavailabilityFromAbsence` and no display name and no reason. Display names exist only in the JobSpy and Polish catalogue files; SOLID.Jobs and Himalayas have none in the module (their labels live only in UI text such as `app/pages/offers.vue`). The mock-up's reasons are two strings: "Wyłączone w konfiguracji" and, for Google Jobs, "Niepodłączone". The module already has two older reads shaped for the old view (`readSourceCatalog`, `readSyncState`, used by `server/api/offers/index.get.ts`, the two status routes and the CLI status scripts); SD T5 removes the routes but never says what happens to `readSourceCatalog`.
- Contradiction with the architecture rule 2 ("a view asks the modules as rarely as it can"): the page will call the history read (with a `sources` list: id, name, infers flag), a separate catalogue read for the dialog (enabled, reason, unfinished run id), the health read and the details read. Two of them return different shapes of the same catalogue (cost 3, "a second mechanism for the same thing").
- Proposed resolution: (a) say in the SD that the connector contract gains a `label` (the single owner of the display name; the list of names is then not a fixed list with two owners) and that the disabled reason is one constant "Wyłączone w konfiguracji" (Google's "Niepodłączone" collapses into it, or comes from the existing `connected` flag); (b) let the history read's `sources` entries also carry enabled, reason and the unfinished run id, so the dialog opens from data the page already holds (the SD already accepts a stale dialog, see T3-R04 and SD 150); drop the separate dialog read; (c) name which of `readSourceCatalog`/`readSyncState` survive after T5 (the CLI status scripts still use `readSyncState`).
- Secondary liabilities: the history read returns a little more than a filter needs (rule 2 explicitly allows this); the dialog's "już trwa" marks are as old as the page, which the server-side check already covers.

### M5. Pager page-list popup and edge-aware tooltip are the costliest UI items and not needed for an MVP history

- Where: REQ T1-R07 (line 40: 16 px from the window edge), T1-R09 (42: typed digits filter the page list, Backspace, Enter, Escape, outside click), T1-AC05 (60), T1-AC07 (62); SD line 91 (check of tooltip at the right edge).
- Evidence: the offer list's pager (`app/pages/offers.vue` ~line 843-860) is plain "Poprzednia / Strona X z Y / Następna". The mock-up README says the history pager works "like the offer list"; the popup was added later. With a default period of 7 days and 20 per page, the history is a few pages. The 18-page case comes from four months of fictional data.
- Proposed resolution (Cheap Dispensables): ship the same pager as the offer list plus the 10/20/50/100 size choice; keep the popup list of page numbers as a follow-up in the collection task `oferty-pracy-sz5` (item 49 or similar). Keep the tooltip but drop the "16 px from the edge, also at the right edge" guarantee, or use the UI library's tooltip, which already positions itself. Two acceptance criteria and a free-form keyboard model leave the unattended task.
- Secondary liabilities: the owner approved the mock-up behaviour, so this is the owner's call; the cost is a visible difference from the mock-up and a later task.

### M6. Task order forces a throwaway interim state: T1 renders "— niedostępne" only for T2 to replace it

- Where: REQ T1-R05 (line 38, "Until T2 ... shows '— niedostępne'"), T1-AC04 (59), T2-R02 (82), SD line 57 and T2 approach 3-4 (lines 103-110); tickets .1 and .2 (tickets-export lines 30-170); PRD stages 1-2 (lines 50-51).
- False compromise: "the page comes first, recording the unavailable count second, so the page needs a placeholder."
- Evidence: recording the number is a storage change in `finish()` (the complete path already runs `markAbsentAdsUnavailable` in the finishing transaction) and needs no page. T2 depends on T1 only to have somewhere to show the value.
- Proposed resolution (Preliminary Action): swap stages 1 and 2, or merge them into one "record the result of a sync" task (one migration adding both columns, one change at the two writing points, the marking statement returning its row count) followed by the history page, which then renders only final states. T1-R05's interim wording, T1-AC04's third clause, the "not part of T1" note in SD 57 and the transitional test all disappear, and the "counted since <date>" tooltip date is earlier in the real data.
- Secondary liabilities: if M1 is adopted the two columns are written at different places (batch save versus finish), so merging saves one migration, not one change point; a bigger first task for the unattended runner if merged (swapping alone avoids that).

### M7. "Needing attention" and the fourth strip item have three different definitions across PRD, requirements and the approved mock-up

- Where: PRD line 28 ("a strip with ... the syncs needing attention ... and the sources without a complete sync for 3 days") and Goal line 19; REQ T4-R02 (line 148: number of enabled sources whose latest finished sync is Niepełna or Nieudana) and T4-R04/R06 (150, 152: the 3-day list is a separate warning, not a strip item); mock-up `docs/prototypes/synchronizacje/index.html` line 280 and 383 ("wymaga uwagi (7 dni)": count of partial or failed syncs created in the last 7 days).
- Discrepancy: PRD counts syncs, requirements count sources, the mock-up counts syncs in a 7-day window. The mock-up is declared "evidence of layout and wording, not of data" (REQ line 7), so the requirement wins, but the PRD wording and the label "Wymaga uwagi" (no "(7 dni)") will confuse the reader of the PRD. The strip described in the PRD has four items, the requirements three plus a separate warning.
- Proposed resolution: correct PRD line 28 to say "the sources needing attention" and that the 3-day list is a warning under the strip; add one sentence to REQ T4 that the mock-up's 7-day window is deliberately not carried over. No design change.
- Secondary liabilities: none.

---

## 🟢 Nit

### N1. Two buttons that open the same dialog
REQ T3-R01 (line 110): "Synchronizuj wszystkie" and "Wybierz źródła" differ only in the preselection. One button "Synchronizuj" with a "zaznacz wszystkie włączone" checkbox in the dialog would do. Owner chose both in the mock-up; mention only if the owner wants less UI.

### N2. No way to refresh the page except reloading the browser
REQ T1-R01 (line 34) and T3-R07 (116): the page "does not refresh by itself" and after confirming it reloads once; afterwards the owner sees "W kolejce" until reload. The offer list already has "Odśwież widok" for this. A button that re-runs the three reads costs a few lines and matches the pattern (out of scope item 48 is about automatic refresh, not a button).

### N3. "Today" and "since local midnight" have no stated time zone
SD line 47 and REQ T1-R08 (41), T4-R03 (149 uses 24 hours, which is fine). Say whether "local" means the server's zone or the browser's; the address carries only `period=today`, so the server decides.

### N4. The date machinery for the "Liczone od" tooltip
REQ T2-R04 (line 84), SD lines 110 and 116-117: an extra history-read field (earliest finished run with a recorded value) and a fallback text, for one tooltip on at most one source (only SOLID.Jobs infers unavailability, per the mock-up README). A fixed text "Nie liczono przed wprowadzeniem tej funkcji" needs no field. The owner asked for the date, so keep it if wanted.

### N5. Trigger filter, but the row shows no trigger
REQ T1-R04 (37) removes the trigger from rows and T1-R08 (41) keeps a trigger filter; the owner can filter by something they only see in the drawer. Harmless; the filter is cheap.

### N6. "Fixed panel scope" is described as a new concept
SD lines 134 and 138: for the Polish portals the fixed scope is simply the request with only the source set (`polishQuery` already defaults to PHP, senior, 50 offers, 5 pages, 60 requests); the other connectors ignore the request and already search PHP and senior (SOLID.Jobs `subCategory: 'PHP'`, Himalayas `q: 'PHP'`, JobSpy `search_term: 'Senior PHP'`). No list of scopes is needed; the SD may say "request with no scope input for every source except the Polish portals, which get only their name". This also avoids a second list that must stay in step with the connectors (cost 4).

---

## Where no false compromise was found

- Ownership of every read in the Sources module and a page without rules: balanced and consistent with the architecture rules (SD 9-11).
- Bulk request with independent per-source outcomes (SD 134-150): reuses `requestSync`, which already holds the per-source advisory transaction lock and the one-unfinished-run rule, so concurrency and repeated calls are inherited, not reinvented.
- T4 health read computed from stored runs, nothing stored: the right choice (SD 164).
- Removing the browser route of the Polish import and keeping the CLI (T5): consistent with "one action is one process at every entry point".
