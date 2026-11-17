# Fetching and syncing offers — solution design

Status: **design of the implemented stage**, 2026-10-31. Rationale: [requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-04/AC-04, R-05/AC-05, R-06/AC-06, R-07/AC-07. The owner requested the implementation after narrowing the scope to PHP Senior. Below is the design of this stage and a clarification of the implementation.

## Scope and starting point

**Confirmed:** the order setup → fetching → list. At this stage we do not build the UI, rating, profile or research. Current scope: only PHP, the Senior level according to SOLID.Jobs filters. Staff, Vue.js and AI agents are postponed beyond this stage.

The existing setup provides PostgreSQL, `node-pg-migrate` migrations, `lib/db.ts` with a connection pool, `lib/queue.ts` with pg-boss, a separate `worker/index.ts` and Vitest tests. The worker handles a technical queue and the import queue. This stage extends these elements while keeping the setup test working.

Import and status are handled by a CLI in the `tools` container, execution in `worker`. No data endpoints were added at the import stage. The next stage, the list, exposes them locally without login, in line with the owner's later decision.

## Source contract and limitations

Read again on 2026-10-31: [API page](https://solid.jobs/api-ofert-pracy), [operator's client](https://github.com/solid-company/solid-jobs-client), [dictionary](https://raw.githubusercontent.com/solid-company/solid-jobs-client/main/DICTIONARIES.md). The API uses campaign, pagination from 0, a version header and the jobOfferKey identifier. PHP has a source subcategory. After the scope was narrowed to Senior only, we use the Senior level filter directly; we do not implement local recognition of Staff. The operator's minimum pay filter checks the lower bound, so it does not match our rule of partially matching salary ranges. We do not use it in this import.

The adapter will use Node's native fetch, with no new SDK. Configuration: `campaign=oferty-pracy-local`, `X-Api-Version: 1.0`, `pageSize=100`, sorting `validFrom asc`; pages sequentially, at least one second between requests, a 30 s timeout. One automatic retry of a transient error, taking Retry-After into account with a bounded waiting time. After the second error the run is incomplete or failed, with an explicit reason.

The API does not provide a confirmed atomic multi-page snapshot. A completed run is an observation by our importer, not evidence that a recruitment has ended or that the portal did not change during the read.

## Specialisation scope and qualification

**Confirmed by the owner:** only PHP, the Senior level.

Reading the IT section with `search.categories=Developer`, `search.subCategories=PHP` and `search.experiences=Senior`. The scope is catalogue-based: it matches the source's labels, with no promise of finding PHP/Senior roles categorised in other sections or levels. We do not read the whole of IT and do not run searches for Staff, Vue and AI agents. We do not need text classification of seniority for this stage.

The read parameters and their fingerprint are saved with the run. Missing other data, e.g. a salary range, does not exclude a fetched entry. Unknown or conflicting values from the response are kept without imputation, with the source indicated. A filter change is not evidence that previously fetched ads are unavailable.

## Minimal write model

A new SQL migration in the existing mechanism, with no ORM. The tables are owned by the sources module, not a model of the whole product.

| Table | Contract |
| --- | --- |
| source_scopes | UUID, source, canonical read parameters JSONB, qualification rules version, scope fingerprint. Contains no secrets. |
| source_sync_runs | UUID, scope_id, trigger manual/scheduled, status queued/running/complete/partial/failed, start/end, page/entry/change counters, a safe error. The previous complete run remains addressable after a failure. |
| source_ads | UUID, unique source/external_id, URL, first/last detection, current version, qualification and evidence, availability, expiry data. No Organization or Application process is created for now. |
| source_ad_revisions | UUID, source_ad_id, hash of stable content/fields, raw payload JSONB and read date; an identical state does not create another revision. |
| source_run_seen | unique run_id + source_ad_id: an observation of an entry in a run, independent of the profile match. |

Optional data keep absence/null as in the source; we do not impute pay, country of work, company role or missing technologies. Unrecognised enum values stay in the payload instead of causing the loss of a whole page. A missing stable key or an invalid pagination envelope prevents the run from being considered complete.

Raw HTML is saved as data; we do not execute it and do not add a renderer now. In the next stage the list must use a safe presentation. The kept versions do not yet create an obligation to build a view of past contents.

## Execution and concurrency

1. The CLI validates the configuration, creates a run and enqueues a job through the existing pg-boss. Saving and sending must be one transaction on the same SQL client; the transactional adapter will be checked with a rollback test.
2. The worker obtains a dedicated lock for the source/scope; it does not hold a transaction during network calls. A concurrent request points to the already active run instead of fetching the same scope a second time.
3. Each correct page is saved atomically: upsert, a possible revision, observations and counters. A later failure does not remove correct pages.
4. Completeness requires the full set of correct pages, consistent metadata and no detected duplicates/gaps indicating an unstable set. A visible change of counters or pagination gives partial; we do not mark disappearances then.
5. After a complete comparable run, the absence of an observation can be marked as unavailability. Expiry follows from the source's date. Neither state means the recruitment has ended.
6. The status and the result are saved durably, independent of the queue's technical history. An entry coming back restores availability; it does not create a second source offer.

Recovery after a failure requires a testable contract: the lock of a dedicated connection disappears when the process is lost; at startup/on a periodic check the worker marks an abandoned running as partial/failed only after confirming there is no active lock. A further request must not return a dead run indefinitely. A retry starts from page 0, keeping idempotency and the previous history. A technical redelivery does not reset the limit of automatic attempts.

## Commands and schedule

Package scripts:

- `pnpm source:sync` — validates the scope, enqueues a run and prints its id; optionally waits for the result up to a bounded time.
- `pnpm source:status [run-id]` — state, counters, error and the last complete sync.

Example execution through `docker compose run --rm tools ...`. After a worker restart the new modules must be started; the existing smoke test still works.

The schedule is once a day in Europe/Warsaw, the time in the configuration. At startup and periodically we check for an overdue run; after a break we create one run, without replaying every day. One source and a small volume allow us not to add a new scheduling service. A missing valid configuration does not quietly start a full IT import; the status explains what is missing.

## Verification and coverage

| Requirement | Method and evidence |
| --- | --- |
| R-04 / AC-04 | Multi-page fixtures and a limited trial of the real API; matching identifiers/URLs/payloads. Repeated import: no duplicates and no unnecessary revisions. A query test confirms the Developer/PHP/Senior filters and that incomplete response data is kept without adding values. |
| R-05 / AC-05 | Controlled time in Europe/Warsaw, several missed days, start and periodic check; exactly one overdue request. Two CLIs at once without a parallel import. |
| R-06 / AC-06 | An error after saved pages, 429 and a second error, invalid data; correct pages kept, the last full date unchanged, no false disappearances. Killing the worker and a retry without a dead lock. |
| R-07 / AC-07 | Absence/return of an entry, an explicit expiry date, a scope change and unstable pages; different availability states, no deletion of history. |
| Setup integration | Migration of a new/previously created database, rollback of data+job, technical queue tests still passing, lint/typecheck/build. No AI connections and no new data endpoints. |

Verification is done by Vitest tests of the adapter and the PostgreSQL/pg-boss integration, prepared with a separate tester. The final results are recorded in Beads task oferty-pracy-5zq.

## Implementation clarification

PHP and Senior are confirmed, with a direct mapping of the source filters. Default 08:00 Europe/Warsaw, changed through SOURCE_SYNC_TIME. The saved schedule_day means the last due slot; a manual import covers that slot. A failed run does not trigger further automatic runs on the same day. A retry of a transient error happens once at the HTTP request level; the queue does not retry the whole import automatically.

The scope and the rule are the evidence of qualification, linked to the ad through the last scope and the run observations; no separate qualification column was added. Conflicting/missing fields stay in the raw payload. valid_to stores the source's date independently of availability; we do not persist a time-dependent bool expired. We compare the hash with the current revision, so a return of earlier content is a new history revision.

A session lock serialises the execution of the source, a separate transactional lock serialises the requests. The atomic send uses pg-boss db.executeSql on the same PostgreSQL client. The queued status after an interrupted delivery is recovered after the end/absence of the job is established; an active delivery may require waiting for the queue to expire (up to an hour). The CLI does not treat exceeding the waiting time as cancelling the import.

API: sortActive (not sortBy). The real API trial on 2026-10-31 and the first complete save: 31 ads, all Developer/PHP/Senior. The next stage is the list; the data is not yet exposed over HTTP.
