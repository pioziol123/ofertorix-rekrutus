# Stage 8 — Intermediate Zoom Out (Skeptical Architect), epic oferty-pracy-nq3

Reviewed: PRD.md, requirements.md, solution-design.md (SD), tickets-export.md, and the reports stage5-zoom-out, stage5-inventive-catalyst, stage6-comprehension, stage7-design, stage7-structural, stage7-style. Baseline: GLOSSARY.md, the architecture rules, `docs/agents/implementation-workflow.md`, the mock-up README. Code read read-only: `modules/sources` (request-sync, sync-run-state, execute-sync-run, source-ads persistence, read-sync-state, connectors), `migrations/1770000000001_sources.cjs`, `queues.json`, `app/pages/offers.vue`, `scripts/polish_*.py`. `node scripts/check-spec-altitude.ts` on the three documents exits 0 with no warning.

Context sufficiency: passes. The set holds together structurally: the five stages, the five requirement sections, the five SD sections and the five tickets map one to one; all 38 acceptance criteria appear in the tickets word for word and in the SD verification lists; the SD's "Observed" facts match the code. The weak points are in the decisions underneath the set, not in its parts.

Count: 0 Blockers, 5 Majors, 6 Nits.

---

## What the earlier reports reveal together

1. **One decision sits under a third of all findings.** PS-D01 (store the number of new ads when a run ends) is the root of: the T1 placeholder "— niedostępne" and the T1/T2 order (catalyst M6, structural M7), the null-count window between migration and deploy (comprehension M5, SD line 95), "runs without a stored count add 0" in T4, the stuck-run risk on the failure path (comprehension M11, catalyst M1), the new index and backfill, the size of T1 (zoom M1), and the design text copied into ticket nq3.1 (zoom N12). The reviewers offer incompatible resolutions to it (compute on read for the page's runs; a per-batch counter; swap T1 and T2). They cannot be adopted one by one: each changes the others. See Major 2 and the decision list below.
2. **The same three owner decisions were challenged by independent reviewers.** The PS-D01 storage, the removal of the offer list's timer (T5-R05) and the snapshot-only page were each raised by two to four reports. All three carry "(owner, 2026-11-22)" and none carries the options the owner discarded. A reviewer or the runner cannot tell whether the owner saw the alternatives, so the Elephant should put them to the owner and not edit the documents on the reviewers' say (Major 3).
3. **The reports diverge on the health strip.** Design M3 says "accept and state the noise"; catalyst M3 says "limit the 3-day rule to scheduled sources"; zoom N5 says "state the first-day consequence". Nobody measured how often a source is complete (Major 5).
4. **A pattern in the evidence base.** The requirements lean on three sources that a fresh reader or the runner cannot rely on: the untracked mock-up (tooltip texts, wording), the code (what "enabled", "scope" and "infers unavailability" mean; display names) and conversations of 21 and 22 November (about 45 "(owner, date)" citations). Findings of comprehension M1, M4, M6, M8, structural M4 and M6, design M9 and M10 and style M4 and M14 are all one root cause: the specification points outward for its definitions. One short "Words" block with those definitions and the five state texts would close about ten findings at once.

---

## 🟡 Major

### M1. The page mixes two moments: "a snapshot from the opening" is false for the list and true for the strip
- Files and lines: PRD.md 24; requirements.md T1-R01 (34), T1-R08 (41), T1-R09 (42), T4-R07 (153), T4-AC07 (166), T3-R07 (116); solution-design.md 28 (item 3: the page loads the history read keyed on the route query), 164-165 (T4 items 2-3).
- Discrepancy: T1-R01 and the PRD say the page shows syncs as they were when it was opened. Every change of a filter, of the page or of the page size is a new history read (SD 28), so the rows show the state at that moment. T4-R07 and T4-AC07 then require that the strip and the warning do not change when the filters change. After a sync finishes, a filter change shows its row as Pełna while the strip still says that it is in progress. The two statements cannot both describe one page, and the criterion T4-AC07 turns the inconsistency into a requirement. Design M4 asked for a refresh control and a label "as of"; it did not see that the page already refreshes the list on every filter change.
- Rationale: the cheapest consistent model is one read of both parts on every navigation of the page (the strip is one small read), or one explicit "Odśwież" that reloads both. If the owner wants the strip frozen, T1-R01 should say "the strip", not "the page". Decide, then fix T1-R01, T4-R07, T4-AC07 and the PRD sentence together.

### M2. PS-D01 and its alternatives miss the derivation that already exists in the schema (`source_ads.first_seen_at`), and with it the one real argument for storing falls
- Files and lines: solution-design.md 26-27, 33-36, 69-72 (PS-D01), 82-84, 95, 164; requirements.md T1-R06 (39), T4-R03 (149); PRD.md 28 and 46 ("the new ads of the last 24 hours"); migration `1770000000001_sources.cjs` line 20; `modules/sources/domain/ad-projection.ts` line 129 (`firstSeen`).
- Discrepancy: `source_ads` is unique per (source, external id) and carries `first_seen_at`, set by the database at insert and never updated (only the schema and the read projection use it). An ad is new in run R exactly when its row was created during R. Because a source has one unfinished run at a time, that equals "an ad of R's observations with `first_seen_at` at or after R's start". The lookup goes by the run's primary key (run first) and the ad's primary key; it needs no index on the observation history, no ordering of runs by request time, no source-wide join and no backfill. It also gives live values for a running sync. The same column answers T4-R03 directly: the new ads of the last 24 hours are the ads first seen in the last 24 hours. The PRD says exactly that; T4-R03 rewrote it as "the sum of stored new ads of syncs that finished in 24 hours", which is what couples T4 to the stored value. Stage 5 proposed two other derivations (zoom M1: compute on read with the same index; catalyst M1: a per-batch counter); neither names this one.
- It also answers the single fair argument for storing that zoom M1 recorded: if history cleanup (collection item 42) deletes old runs, a value derived from older runs would change. A derivation from `first_seen_at` reads only the run's own observations and its own start, so cleanup of older runs cannot change it.
- Caveats to verify before the Elephant proposes it: the date sits on the transaction start of the batch save (inside the run's window, as expected); the pre-B5 runs that could overlap (SD 33 mentions them) may differ; whether every old ad kept its `first_seen_at` is a question for the data, not the code.
- Rationale: PS-D01's "Discarded" line names one alternative, and the stage 5 reports propose two more. The owner decides among four, and should see this one because it is the smallest (no index, no backfill, no new column, no change on either final-status path, no null window). Until then every document carries the stored-count design as settled.

### M3. Owner decisions are marked "(owner, date)" but are not recorded as decisions with their discarded options, and the durable record of the 22 November decisions is the requirements alone
- Files and lines: PRD.md 7 ("The mock-up's README records those decisions"); requirements.md 7 and about 45 citations "(owner, 2026-11-22)"; solution-design.md 9 (module ownership), 95 (the null window "the owner accepted"), 136 (one HTTP request per confirmation), 138 (the form keeps technology and level until T5), 164 (nothing new is stored); requirements.md T5-R05 (184), T4-R01..R03 (not clickable), T1-R01 (no refresh); `docs/agents/implementation-workflow.md`, Readiness checklist ("each of its decisions lists the options the owner discarded with the reason or 'none recorded'").
- Discrepancy:
  - The README records the scope decisions of 21 November and a few of 22 November (icons). It does not record the rest, and it contradicts later ones: live refresh and a navigation dot (README, "Live updates"), the attempt "out of 3", the scope in the details, scheduled syncs "marked Harmonogram" in the list (stage 5 N4 saw some of these). So the PRD's pointer to it is wrong for most of what the requirements decide.
  - Only PS-D01 and PS-D02 are shaped as decisions. The others above are owner choices written as plain steps with no options and no reasons. The checklist asks for either the discarded options or "none recorded".
  - Because the label "(owner)" cannot be checked, it protects nothing: reviewers reasonably reopened five of these decisions (see "What the earlier reports reveal", point 2).
- Rationale: before the hand-off, list the decisions that are the owner's, with the option discarded or "none recorded" for each (a short PS-D03... list in the SD covers it). It lets the runner's reviewer tell a decision from an oversight, and the owner sees in one place what the reviewers asked to reopen.

### M4. Three strip figures are numbers with no way to reach what they count, and one is a count of sources that no screen lists
- Files and lines: requirements.md T4-R01 (147), T4-R02 (148), T4-R03 (149), T4-R06 (152), T4-AC01/AC02 (160-161), T1-R08 (41), T3-R07 (116); solution-design.md 168-171.
- Discrepancy:
  - "Wymaga uwagi" counts enabled sources whose latest finished sync is Niepełna or Nieudana, and is not clickable. The warning list names only sources with no complete sync for 72 hours or with three failed syncs in a row. A source whose latest sync is Niepełna (the always-partial case) is counted in the tile and named nowhere. The history filter by state shows syncs, not sources, and by default only the last 7 days.
  - The warning's name click sets only the source filter. The sync that the warning is about, the latest complete one, is by definition more than 72 hours old and may be older than the default 7 days, so the filtered list does not show it. The SD's health read returns that finish time (SD 170), but no requirement displays it.
  - "W toku" is not clickable, so the owner cannot go from the count to the unfinished syncs; T3-R07 sets the state filter but keeps the 7-day period.
- Rationale: the PRD's goal is "the owner notices a source that keeps failing". Noticing without a path is half the goal. The owner decided "not clickable" (T4-R01..R03), so this is a question to put back: either the tiles set the state filter and the period "all" (a few lines, no new data), or "Wymaga uwagi" lists its source names like the warning, or the owner accepts that the tile is a signal and the history is the search. State the choice in T4.

### M5. The "always on" health warning is treated as certain by four reports and measured by none; the proposed fix cuts the goal
- Files and lines: requirements.md T4-R02 (148), T4-R04 (150), T4 Scope (141), T3-R03 (112); stage7-design M3; stage5-inventive-catalyst M3; stage5-zoom-out N5; `scripts/polish_json_sources.py` 133-134, `scripts/polish_sources.py` 193-194; `modules/sources/infrastructure/adapters/jobspy/runner.ts` 262-278; `queues.json` (the sync queue).
- Discrepancy:
  - Design M3 says a source capped at 50 ads "is never Pełna". The code stops with the offer limit only when a 51st matching record appears. A Polish portal with fifty or fewer matches for PHP · senior ends complete. JobSpy has a "limited" status; whether it is reached for the fixed query is a matter of the data. The certain part is smaller: only SOLID.Jobs is scheduled, so every other source is stale after 72 hours unless the owner syncs it.
  - Catalyst M3 proposes the 3-day rule only for sources that declare `scheduled`. That is one source. The warning would then serve one source and goal 3 and the Success bullet of the PRD (any source "not checked in full for days") would be unmet for the rest. It is a scope cut, not a refinement.
  - Two different purposes hide behind the one list. As a reminder to the owner ("you have not synced Himalayas for four days") staleness of a manual source is correct and "nigdy" is useful. As an alarm ("a source is broken") it is noise for manual sources. The documents never say which the owner wants.
- Rationale: one read of the stored runs (the share of Pełna among the last N finished syncs per source) settles whether the noise is real; the stored data exists today. The Elephant should get that figure before the owner chooses among "accept as a reminder" (and make the list actionable by preselecting those sources in the dialog), "restrict to scheduled sources" and "wait for item 36".

---

## 🟢 Nit

### N1. The SD's shared design says other pages only gain a navigation link and the Offers module is not involved; T5 edits the offer list
- Files and lines: solution-design.md 11 against 186-194 (T5); requirements.md T5 (172-196).
- T5 removes sections, the timer and routes from the offer page and changes what the offer list route returns (`server/api/offers/index.get.ts` composes Sources state today). "Other pages only gain a navigation link" holds for T1 and not for the epic. Say "other pages gain a link; the offer list loses sync information (T5)", and name that the offer list's route stops calling the Sources reads.

### N2. "Findings that look settled by the code" (comprehension M8 and one overstated claim)
- requirements.md 9, 118 (T3-R09), 119; comprehension M8; `modules/sources/request-sync.ts` (trigger "Manual unless the schedule requests"; every entry point goes through it).
- The command line starts a manual sync; the question of comprehension M8 is answered by the code. Put the fact in the Words line ("manual: started by the owner from the panel or the command line") and treat M8 as a Nit. Likewise comprehension M1's sub-question "per source or per scope": the code is per source of any scope (request-sync.ts, admitRun); SD line 18 is right and only line 177 ("per scope") reads like the opposite, because it refers to the existing index `source_runs_history(scope_id, created_at)`.

### N3. T3's closed set of outcomes does not cover the errors of the request it reuses
- Files and lines: solution-design.md 135 (item 2), 144-150; `modules/sources/request-sync.ts` doc of `requestSync` (it can throw for an unknown source, a disabled one, "the connector's error for invalid sync settings").
- Unknown and disabled map to "skipped". An invalid-settings error has no outcome and no count in "Zlecono N, już trwało M, pominięto K". For the fixed scope it should not occur; say so, or map it to "not queued", so the operation has an answer for every input (architecture rules, "Situations every operation answers", item 4).

### N4. The epic's export shows no `load_bearing` or `shared` keys
- Files and lines: tickets-export.md 5-24 (the epic has no METADATA), each ticket repeats PS-AC01 and PS-AC02; `docs/agents/implementation-workflow.md` ("Metadata the runner reads and writes", "Epic hand-off").
- Missing keys mean none. Then PS-AC01 and PS-AC02, repeated in all five tickets, count as per-task criteria when the runner counts tasks waiting for a deviation. At the hand-off the owner should be asked which requirements the epic rests on; likely candidates are T1-R06 (what "new" means; T1 and T4 build on it), T3-R04 (one unfinished sync per source) and T2-R06 (marking and the final state together).

### N5. Reuse for T4: the module already has per-source "latest run" and "latest complete run" reads
- Files and lines: solution-design.md 164-165, 177; `modules/sources/read-sync-state.ts` 34-61; `infrastructure/persistence/sync-runs.ts` (`findLatestRunRecord`, `findLatestCompleteRun`).
- The SD describes a new computation "per enabled source its latest finished run, its latest complete run and its three latest finished runs" without saying that two of the three queries exist (they feed `readSyncState().lastComplete` for the command-line status). The implementer should extend those persistence queries and not write a second pair (architecture rules, costs, item 3).

### N6. Findings that stage 5 and 7 raised and that this stage checked and found overstated
- stage7-design M2 (a stuck sync locks a source "with no way out"): `queues.json` gives the sync queue 3 attempts and a time limit of 3600 s per attempt, and the failure handler ends a run after the last attempt, also a dead worker's (execute-sync-run.ts, `endFailedSyncRun`). A running sync therefore ends within hours. What remains is a queued run while the worker is stopped; that is an accepted-risk sentence, not a missing requirement.
- stage7-style notes on altitude (for example PRD line 58 "mechanics"): `check-spec-altitude.ts` exits 0 on all three documents, so these are style preferences, not a gate failure of the readiness checklist.
- stage7-design M10 (the mock-up is untracked): true, but the three specification documents and this review directory are untracked as well; `node scripts/check-spec-sync.ts` enforces the exchange point at the hand-off, so the point only matters for the four tooltip texts that exist nowhere else (put them in T1-R07).

---

## Decisions the owner must take, in this order

The order matters: a later decision depends on the earlier ones.

1. **How "new ads" is obtained (PS-D01).** Options: keep the stored value written at the end of a run (index, backfill, null window, change on both final-status paths); the per-batch counter (catalyst M1); compute on read with an index (zoom M1); compute on read from `first_seen_at` (this report, M2). Consequences to carry with the answer: whether T1-R13 shows "—" for running syncs, whether the T1/T2 order and the T1-AC04 placeholder stay, whether T4-R03 sums per run or reads the ads, whether the null window and the failure-handler row of the SD disappear, and the size of T1. Ask once, with the four options and these consequences.
2. **What the page promises about freshness (M1 here, design M4).** One read of list and strip on each navigation, a refresh button for both, or a frozen strip. Decide together with T3-R07 and T4-R07.
3. **What the strip tiles lead to (M4).** Tiles that open the filtered history (state, period "all"), a named list for "Wymaga uwagi", or accept as signals.
4. **What the health warning is for (M5).** A reminder (all enabled sources, actionable) or an alarm (scheduled sources and failures). The answer fixes T4-R04 and the PRD goal 3. Get the completeness rate per source from the stored runs first.
5. **T5-R05, the offer list's timer.** Keep the refresh for a waiting AI assessment (remove only the Polish-import branch) or record in the PRD that the offer list no longer refreshes by itself and that the owner accepts it (five reports raised this).
6. **Where the catalogue facts live** (display names, reason for "disabled", unfinished run id): one catalogue read for the filter, the dialog and the details button, with the connector or the catalogue as the single owner of the names (zoom M2, catalyst M4). Needed before T1 and T3 are written, because the history read's `sources` entry is the first shape.
7. **Owner-approved extras to keep or defer** (each is YAGNI by the stage 5 reports, and the owner approved them on the mock-up): the typed-digit page list, the 16 px tooltip guarantee, two buttons for one dialog, the date in the T2 tooltip. One question: keep all, or move the named ones to the collection task `oferty-pracy-sz5`.

After 1 to 4 are settled, the Elephant edits the three documents and the tickets once: PRD (Risks accepted, the strip, T5-R05, the Words block, the pointer to the README), requirements (T1-R01, T1-R05, T2-R03/R04, T3-R07/R08, T4), SD (decision list, catalogue read, health read), and ticket nq3.1's description.
