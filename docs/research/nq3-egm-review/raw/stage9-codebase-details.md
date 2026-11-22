# Stage 9 — Implementation Readiness (fit with the code) — Codebase Details Goldfish

Scope: `docs/specs/nq3-panel-synchronizacji/solution-design.md` (whole file) and `docs/research/nq3-egm-review/tickets-export.md` (epic `oferty-pracy-nq3` and tickets `.1`–`.5`).
Method: every claim about existing code, tables, queues, routes, pages and scripts was checked against the repository (main tree, not `.claude/worktrees`). Read-only. Nothing was run.

Totals: 🔴 0 · 🟡 6 · 🟢 9

## What was verified and holds

The "Data (Observed, 2026-11-22)" facts that match the code:

- **Sync run columns.** `source_sync_runs` has `trigger` (`manual`, `scheduled`), `status` (the five values), `created_at`, `started_at`, `finished_at`, `pages`, `seen`, `revisions`, `error` and `diagnostics`. The scope-to-source link is `source_scopes.source`. Sources: `migrations/1770000000001_sources.cjs`, `migrations/1770000000005_jobspy.cjs`.
- **Attempt number.** It is not stored. `migrations/1770000000024_sync_run_without_queue_job.cjs` drops `job_id` and `attempt`.
- **Observation history.** `source_run_seen` has `PRIMARY KEY (run_id, source_ad_id)` and no other index. It is referenced only in migration 0001 and in `modules/sources/infrastructure/persistence/source-ads.ts`.
- **Advisory lock per source.** `pg_advisory_xact_lock(hashtext('source-sync-turn:<source>'))` in `modules/sources/infrastructure/persistence/sync-runs.ts` (`lockSourceRequests`), taken inside `admitRun`.
- **Final-status paths.** The worker's `finish()` in `execute-sync-run.ts` writes the final status in one transaction with `markAbsentAdsUnavailable`. The failure handler is `endFailedSyncRun`, registered in `plugins/sources.ts`.
- **Other claims that hold:**
  - `markAdsAbsentFromRunUnavailable` marks only `availability='available'` ads (T2 "already unavailable is not counted").
  - `revisions` counts new content versions, and a new ad always adds one.
  - `source_ads` is unique per `(source, external_id)`.
  - `requestSync`/`admitRun` give "one request, already running returns the existing run" (T3).
  - The scope defaults (PHP · senior) hold for SOLID.Jobs, Himalayas and JobSpy. The Polish defaults are 50 ads, 5 pages, 60 requests.
  - `UnknownConnectorError` and `SourceDisabledError` exist for T3 "skipped".
  - `connector.infersUnavailabilityFromAbsence` is true only for SOLID.Jobs.
  - The `migrate` service in `compose.yaml` runs before web, worker and periodic start.
  - The offer-list route/page elements T5 removes exist: the summary, notice, two `<details>` sections, `importPolish`, the 5 s timer, and `polish.post.ts`, `polish.get.ts`, `jobspy.get.ts`.
  - The CLI status scripts (`scripts/source-status.ts`, `jobspy-status.ts`, `polish-status.ts`) and the tests for T3-AC09 and T5-AC05 exist.
- **Dependencies between tickets.** `.2`→`.1`; `.3`→`.1`; `.4`→`.1`,`.3`; `.5`→`.3`. They match what the design needs.
- **Acceptance criteria.** The ticket acceptance criteria copy the requirements one-to-one (T1-AC01..12, T2-AC01..05, T3-AC01..09, T4-AC01..07, T5-AC01..05).

## 🟡 Major findings

### M1. No file boundary, no names, no route contracts (Zero-Decision Rule, Target Scope)
- **Where:** `solution-design.md` line 3 ("*Approach* ... leaves names and placement to the implementer"), T1 Approach 1–4 (lines 24–29), T2 Approach (lines 101–110), T3 Approach (lines 132–138), T4 Approach (lines 163–167), T5 Approach (lines 188–193). Tickets `.1`–`.5` add no file list.
- **Code it touches:**
  - Persistence and run state: `modules/sources/infrastructure/persistence/sync-runs.ts` (`runColumns`, `RunRow`, `markRunFinished`, `RunRecord`), `modules/sources/sync-run-state.ts` (`SyncRun`, `finishRun`), `modules/sources/execute-sync-run.ts` (`finish`, `endFailedSyncRun`), `modules/sources/mark-absent-ads-unavailable.ts` and `infrastructure/persistence/source-ads.ts` (`markAdsAbsentFromRunUnavailable` returns `Promise<void>` today).
  - Module entries and docs: `modules/sources/index.ts`, `modules/sources/view.ts`, `modules/sources/README.md` (its operation tables are the module's contract).
  - Migrations and routes: migrations after `1770000000032_profile_assignment.cjs`, routes under `server/api/`, the new page under `app/pages/`.
  - Four pages carry their own copy-pasted `<nav class="app-nav">`: `app/pages/offers.vue`, `app/pages/profile.vue`, `app/pages/companies/index.vue`, `app/pages/companies/[id].vue` (T1-R01, T1-AC01).
- **Discrepancy:** The design names no file as Create, Modify or Delete. It fixes none of the following:
  - the migration file names, column names and types (for example whether *new ads* has `CHECK >= 0`), and the index name;
  - the page path and the HTTP routes: method, URL, request and response shape, status codes;
  - which shared handler the routes use. `server/utils/http.ts` has `apiHandler` (no-store plus an Origin check for non-GET), while the only existing browser POST, `server/api/sources/polish.post.ts`, hand-rolls its own Origin, content-type and size checks. The design does not say which convention a new POST route follows. The route that starts syncs changes state, so the Origin check matters.
  - the new types a browser page may import. `tests/module-boundaries.test.ts` requires views to reach modules only through `modules/<m>/view.ts`.
- **Rationale:** An implementer must invent all of these, which the standard forbids. It also cannot enforce a write allowlist. This is reported once, per the reviewer rule for plans that list no Create/Modify/Delete files.

### M2. Test infrastructure not named: isolated-schema migration lists
- **Where:** Verification sections of T1 (lines 87–91), T2 (124–126), T3 (152–155), T4 (179–182).
- **Code:** `tests/sync-run.fixtures.ts` exports `sourcesMigrations`. It is a hand-written list ending at `1770000000024_sync_run_without_queue_job`, and it builds the isolated schema of `modules/sources/{execute-sync-run,request-sync,sync-run-state,sources,save-batch}.integration.test.ts` and `tests/{sources-sync,sync-entry-points,himalayas-sync,polish-sync,jobspy}.integration.test.ts`.
  - Several other suites (`tests/ai-jobs`, `companies`, `profile.integration`, `matching-ai.fixtures`, `read-source-ads`) list migrations themselves, but only up to `1770000000001_sources`.
- **Discrepancy:** The design promises "integration tests on a real database" but never says the new T1 and T2 migrations must be appended to `sourcesMigrations`. Without that, every sources integration test fails on the new `runColumns`, because `runColumns` will select the new columns. The repository has already hit this once (commit `3c758a2`, which added a migration to the isolated schema of `tests/profile.http.integration.test.ts`).
- **Second gap:** The test "the backfill gives the same values as the final-status path" (line 89) needs a two-stage setup: seed runs and observations, then apply the backfill migration. The shared helper applies all migrations at once, and the design does not say how to stage this.
- **Rationale:** This is test infrastructure (a shared fixture), and the design documents it at neither the file level nor the step level.

### M3. "Catalogue of sources with display names" is described as existing, but only half of it exists
- **Where:** line 9 (Sources module "owns ... the catalogue of sources with their display names and whether each infers unavailability"), line 55 (`sources` in the history read), line 136 (T3 item 4: "a read of the catalogue with ... enabled, the reason when it is not, the id of its unfinished run").
- **Code:**
  - Display names exist only in `modules/sources/domain/jobspy-catalog.ts` and `modules/sources/domain/polish-catalog.ts`. They are used for ads in `domain/ad-projection.ts` lines 137–146.
  - SOLID.Jobs (`solid-jobs`) and Himalayas (`himalayas`) have no display name anywhere in `modules/`, `app/` or `server/`. The registry `sourceConnectors` has only the stable id (`connector.name`).
  - `readSourceCatalog` in `modules/sources/read-sync-state.ts` returns only JobSpy and Polish portals, each with its latest run. It covers neither SOLID.Jobs nor Himalayas and has no unfinished-run id.
  - There is no "reason a source is disabled" in code. `jobspyCatalog[...].reason` is a portal description shown whether or not the source is enabled. The Polish catalogue has no reason. `enabled()` just reads an environment variable (`POLISH_SOURCES`, `JOBSPY_ENABLED`, `JOBSPY_SOURCES`, `JOBSPY_LINKEDIN_ACCESS_CONFIRMED`). Google Jobs is hard-disabled by its `restriction: 'unavailable'`. The disabled-reason texts of the mock-up ("Wyłączone w konfiguracji", "Niepodłączone") exist only in `docs/prototypes/synchronizacje/index.html`.
- **Discrepancy:**
  - The design presents the catalogue as owned and existing. Display names for two sources and every disabled reason must be created, and the design does not say where they live or what they say.
  - It also leaves three overlapping catalogue shapes (history `sources`, T3's dialog read, T4's warning list) next to the existing `readSourceCatalog`, without saying whether they are one read or three. Architecture rules "a second mechanism for the same thing" and "a fixed list with two owners" apply.
- **Rationale:** T1-R08 (the source filter lists every catalogue source) and T3-R02 (the reason shown in the dialog) cannot be implemented without these decisions.

### M4. "Today" and day grouping have no time zone; the project's only precedent is Europe/Warsaw
- **Where:** line 47 (`period: today (since local midnight)`); the grouping by day in T1-R03 and the page rendering (line 29).
- **Code:** `modules/sources/domain/schedule-day.ts` fixes `Europe/Warsaw` for the schedule day. `compose.yaml` and the `Dockerfile` set no `TZ`, so the Node/Postgres process defaults to UTC in a container. The history read runs in the server, while "Dziś/Wczoraj" headings are rendered in the browser.
- **Discrepancy:** "Local midnight" is undefined for a server-side read. A UTC server gives a different "today" than the owner's day for two hours of every Warsaw day, and the server filter can disagree with the browser's day headings. T1-AC06 (the `today` filter) cannot be tested without this.
- **Rationale:** An unstated design choice that the implementer must make (whose midnight, where it is computed).

### M5. "A source keeps at most one unfinished run ... guarded by ... unique partial indexes" misdescribes the code
- **Where:** line 17 (Data, Observed). Line 82 builds the concurrency argument ("one unfinished run per source, so no other run of the source saves observations meanwhile") on it. T4 and the T1 "requested before R" rule depend on it.
- **Code:**
  - `migrations/1770000000014_sync_run_state.cjs` creates `source_one_queued_run` and `source_one_running_run`, both on `(scope_id)`, so one queued and one running run per scope, not per source. A source with several scopes is not constrained, and a scope may hold one queued plus one running run. `persistence/sync-runs.ts` states that the indexes "never conflict" under the lock.
  - What actually keeps one unfinished run per source is the per-source advisory lock in `admitRun` plus the `source-sync-run` queue's exclusivity key `source` (`infrastructure/worker/sync-queue.ts`).
  - The same file keeps `ASSUMPTION(oferty-pracy-2ba.5/ASM-1)`: a source "may still hold several unfinished runs requested before B5".
- **Discrepancy:** The mechanism is wrong (indexes per scope), and the invariant is not unconditional for legacy runs. For the "new ads" count this matters only if runs of one source overlap, which is a pre-B5 corner. The design never names the real guards, and says nothing about T1 or T4 for such runs (for example the backfill, which orders by request time and treats every earlier run as a prior sighting).
- **Rationale:** Rated Major, not Blocker: the post-B5 invariant holds, and only the attributed mechanism and the legacy caveat are wrong. A later reader who relies on "the database enforces it" would be wrong.

### M6. T5 documentation changes are understated: README and architecture README describe the removed form and routes
- **Where:** line 193 (T5 Approach 4: "the README stops naming the removed routes"); the same gap in ticket `.5`.
- **Code and docs:**
  - Root `README.md` line 130 (`GET /api/sources/jobspy` as the status), line 148 (a whole paragraph that tells the user to use the "Polskie serwisy — pobieranie ofert" section and "Pobierz oferty"), line 174 (`POLISH_SOURCES` "enables the manual buttons"; the `POST`/`GET /api/sources/polish` routes).
  - `docs/architecture/README.md` line 122 links to the three route files that T5 deletes, and line 95 says Sources offers "manual requests for Polish sources".
  - `modules/sources/README.md` describes the status reads as serving the application (section "Requesting a sync").
- **Discrepancy:** The design names the routes in one README. After T5 at least three passages of the root README describe a UI that no longer exists, and `docs/architecture/README.md` (which AGENTS.md names as the description of the current code) holds links to deleted files. The new page and its routes are not added to the C4 description either.
- **Rationale:** These are documents that state current behavior and will become false.

## 🟢 Nits

- **N1. Worker finish is conditional on `running` only.** Line 18 says both ends write "conditionally on the run still being queued or running". In code, the worker's `finish()` takes `holdRun` (`SELECT ... FOR UPDATE ... status='running'`) and then calls `finishRun(..., ['running'])`. Only `endFailedSyncRun` uses `['queued','running']`. The conclusion (one end wins) holds. Also, `endFailedSyncRun` reads and writes outside any transaction today, so the design's "both paths compute new ads in one transaction" (line 27) is a change to it, not a description.
- **N2. "The status routes ... only the offer list and tests used" (line 190).** `app/pages/offers.vue` does not call `/api/sources/jobspy` or `/api/sources/polish`. It reads the same catalogues embedded in `/api/offers` (`server/api/offers/index.get.ts`). The two routes are used by `tests/offers.integration.test.ts` (A16-AC08) and documented for operators in README line 130. That test also asserts the `jobspy`, `polish` and `sync` keys of `/api/offers`, and `tests/sync-requests-without-queue.integration.test.ts` uses `POST /api/sources/polish` for the "queue unavailable → 503" case. The design's "Tests that called the removed routes are removed or moved" covers the second but not clearly the first.
- **N3. Dead public exports after T5.** `polishEnabled` (exported from `modules/sources/index.ts`) has no client left once `server/api/sources/polish.post.ts` goes. `PolishSource` in `modules/sources/view.ts` loses its only consumer, `app/pages/offers.vue`. The architecture rule "operations are internal by default" asks for removal. The design does not mention it.
- **N4. "Odśwież widok" sits inside the summary block T5 removes.** `app/pages/offers.vue` lines 305–315 render the button in `.sync-summary`. T5-R01 and T5-AC01 keep it, but the design (line 190–192) says only "drops the summary". Its new place is left to the implementer.
- **N5. Runs of a source missing from the registry.** `execute-sync-run.ts` handles `UnknownConnectorError` for a stored run, so a stored run can reference a source with no connector. The history read lists "every sync stored" (T1-R02) and its `sources` catalogue is built from the registry, so the display name of such a run is undefined. The design's "malformed input" column has "—" for the history read.
- **N6. T4 ordering and index claim (lines 164, 177).** The existing index is `source_runs_history(scope_id, created_at DESC)`, per scope. "Latest finished" and "three latest finished" per source across scopes need a join and are not covered by it. Whether "latest" means `finished_at` (the existing `findLatestCompleteRun` uses it) or `created_at` is not stated. The data volume is small, so only the unstated order key matters.
- **N7. Line 83 vs line 95.** The backfill row says it "runs while the application is stopped by the deployment". `compose.yaml` orders `migrate` before web, worker and periodic only through `depends_on`; the old containers keep running until recreated. The Rollout paragraph (line 95) already accepts that a run may finish between the migration and the new code, so the two paragraphs disagree.
- **N8. T3-AC06 mechanism (line 154).** "A queue refusing one of three" needs an injection point. `requestSync` accepts `connectors` and `now` only, and `sendJob` is imported directly from `lib/queues`. Existing tests refuse the whole queue through an unreachable `DATABASE_URL` (`tests/sync-requests-without-queue.integration.test.ts`). The design does not say how to refuse exactly one source. The mapping of non-queue errors (database failure) to "not queued" is also not stated. `polish.post.ts` maps every error other than `SourceDisabledError` to 503.
- **N9. Ticket reference (all five tickets, PS-AC02).** The tickets cite `/architecture/moduly-i-zasady-kodu.md`. No such path exists at the repository root; the file is `docs/architecture/moduly-i-zasady-kodu.md` (the relative link in `requirements.md` is correct). The tickets are otherwise consistent with the design and the requirements.

## Final count

🔴 Blocker: 0 · 🟡 Major: 6 (M1–M6) · 🟢 Nit: 9 (N1–N9).
