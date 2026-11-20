# Queues: current behaviour and pg-boss semantics, for the queue and worker libraries

Sources as of: **2026-11-19**, code on `main` at commit `350bb51`. This investigation supports task `oferty-pracy-2ba.1`: it introduces a queue library (the only importer of pg-boss, job definitions with abstract job settings, one send operation usable in a module's transaction) and a worker library (a handler registry keyed by job definition name and a run loop). It moves the four current queues onto them without changing behaviour. The minute cycle in `worker/index.ts` and the recovery calls at startup are out of scope and are only mentioned where a queue depends on them.

This document does not repeat [kolejki-alternatywy-pg-boss.md](kolejki-alternatywy-pg-boss.md), which settles why pg-boss stays and describes the target layout. That document read pg-boss only from its project page and left heartbeat and group concurrency unverified ("What was not confirmed"). This one reads the library's code.

**pg-boss version.** `package.json` pins `pg-boss` 12.38.0, and `pnpm-lock.yaml:4100` resolves it. The main checkout has no `node_modules`. The library was read from an identical 12.38.0 copy in the pnpm store of a worktree: `.claude/worktrees/youthful-wright-57c290/node_modules/.pnpm/pg-boss@12.38.0_@opentelemetry+api@1.10.0/node_modules/pg-boss/dist/`. Below, `pg-boss/dist/...` refers to that directory.

## A. Behaviour inventory per queue

### Shared plumbing

- `lib/queue.ts:5-13` `createBoss(migrate = false)` builds every `PgBoss` instance from `DATABASE_URL` and schema `PG_BOSS_SCHEMA ?? 'pgboss'`. It passes no other options, so `supervise`, `schedule`, the 60-second supervise and monitor intervals and the 2-second polling interval are library defaults (see B.4).
- `lib/queue.ts:15-21` `requireQueued` turns a `null` job id (no job inserted) into an error.
- `lib/db.ts:139-143` `queueDatabase` is the pg-boss `db` adapter. Its `executeSql` runs on `db()`, the transaction's connection inside `transaction()` and the pool outside it. A send with `{ db: queueDatabase }` commits or rolls back with the caller's transaction.
- `scripts/init-queue.ts:10-14` creates the four queues. It runs as part of `pnpm migrate` (`package.json` script `migrate`).
- Processes that hold a `PgBoss` instance:
  - the worker (`worker/index.ts:36`, `pnpm worker`);
  - the web server, through a lazy shared client (`server/utils/http.ts:24-38`), which calls `useAiQueue` and `useSyncQueue`;
  - the CLI sync scripts `scripts/{source,jobspy,himalayas,polish}-sync.ts`, which call `useSyncQueue`;
  - `scripts/smoke.ts`.

  Only the worker calls `work()`.
- Two modules keep the client in a module-level variable set by a `use…Queue(boss)` call (`modules/ai/execution-queue.ts:19-29`, `modules/sources/infrastructure/worker/sync-queue.ts:33-43`). Profile receives the client as a function argument instead (`sendCvTextJob(boss, …)`, `importCvDocument(…, boss)`, `recoverImports(boss)`).
- Worker error policy: `worker/index.ts:42-48` registers `boss.on('error', fatal)`, which exits the process. pg-boss emits `error` when a worker loop's fetch throws (`pg-boss/dist/worker.js` `run()` catch → `onError`, `manager.js` `work()` `onError`). That includes `Queue X does not exist` from `getQueueCache` (`manager.js:1044-1052`, called by `#fetch` at `manager.js:1884`) and a failed heartbeat refresh (`manager.js:612-620`). Any of these ends the worker process today.
- Handler shape: every handler is a batch callback `async (jobs) => { for (const job of jobs) … }`. No `work()` call sets `batchSize`, so the default of 1 applies (`manager.js:1164`).

### `source-sync`

| Aspect | Current behaviour |
| --- | --- |
| Senders | Web: `server/api/sources/polish.post.ts:34-35` → `requestSync`. Worker: the minute cycle's `requestScheduledSyncs` (`worker/index.ts:80`, `modules/sources/request-scheduled-syncs.ts:48`). Scripts: `source-sync.ts:21`, `jobspy-sync.ts:33`, `himalayas-sync.ts:25`, `polish-sync.ts:39`. All go through `requestSync` → `admitRun` → `sendSyncJob`. |
| In the module's transaction | Yes. `admitRun` opens `transaction()` (`modules/sources/sync-run-state.ts:83`), calls `sendJob` and stores the returned id with `setRunJob` (`:96`; `infrastructure/persistence/sync-runs.ts:128` sets `source_sync_runs.job_id`). `sendSyncJob` passes `db: queueDatabase` (`sync-queue.ts:54`) and wraps the send in `requireQueued`. |
| Job data | `{ runId }` (`sync-queue.ts:53`) |
| Queue creation | `syncQueueOptions` = `{ policy: 'standard', heartbeatSeconds: 30, retryLimit: 2, expireInSeconds: 3600 }` (`sync-queue.ts:21-31`, `init-queue.ts:12`) |
| Send options | `syncJobOptions` (`heartbeatSeconds: 30, retryLimit: 2, expireInSeconds: 3600`) plus `group: { id: run.source }` and `db` (`sync-queue.ts:54`). The values repeat the queue's. |
| Work options | `localConcurrency: connectors.names().length`, `groupConcurrency: 1` (`sync-queue.ts:87-90`). Default batch size of 1. |
| Retry | 2 retries (3 attempts), `retryDelay` 0 (default), no backoff |
| Expiry, heartbeat | 3600 s; heartbeat 30 s, refreshed by pg-boss every 15 s (B.4) |
| Singleton | none |
| Group | `run.source`, one active job per source across workers (with the caveat in B.6) |
| Handler reads | `job.data.runId`, `job.id` (→ `jobId`), `job.retryCount` (→ `attempt`), `job.signal` (`sync-queue.ts:92-101`) |
| On throw | `executeSyncRun` throws only when the attempt lost the run, the connector aborted, or the signal is aborted (`modules/sources/execute-sync-run.ts:116-122`). Other connector errors finish the run and return normally. A throw fails the job, so pg-boss retries it and the next attempt takes the same run over by `job_id` and a higher `attempt` (`sync-runs.ts:141-151`). `startInSourceTurn` waits on `job.signal` (`modules/sources/start-in-source-turn.ts:58`), so an aborted signal ends the wait with an error. |

pg-boss state touched outside the handler:

- `findSyncJob` → `boss.getJobById(syncQueue, jobId)` (`sync-queue.ts:70-71`). It is used in two places:
  - `startInSourceTurn` reads the jobs of runs ahead and waits while one is `active` (`start-in-source-turn.ts:43-47`). The call sits inside `transaction()` but passes no `db`, so the read runs on pg-boss's own pool, outside the transaction.
  - `recoverSyncRuns` finishes a run whose job is missing or in `completed`/`failed`/`cancelled` (`modules/sources/recover-sync-runs.ts:13,35-44`).
- `executeSyncRun` takes `findJob` as an injectable parameter, and tests replace it (`execute-sync-run.ts:68`).
- Job ids are stored in `source_sync_runs.job_id` (a uuid) and `attempt` (`sync-runs.ts:24-25,145-151`). The pair (`job_id`, `retry_count`) is the run's ownership token.

### `profile-parse`

| Aspect | Current behaviour |
| --- | --- |
| Senders | Web: `server/api/profile/imports/index.post.ts:20-24` → `importCvDocument(name, bytes, await queueClient())`. Worker: `recoverImports(boss)` at startup and in the minute cycle (`worker/index.ts:63,81`). |
| In the module's transaction | Yes. `import-cv.ts:60-63` runs `setImportStatus(id,'queued')` and `sendCvTextJob` in one `transaction()`. `extract-cv-text.ts:80-83` does the same for a requeue. `sendCvTextJob` passes `db: queueDatabase` and `requireQueued` (`cv-text-queue.ts:11-19`). |
| Job data | `{ importId }` |
| Queue creation | `parseQueueOptions` = `{ retryLimit: 0, expireInSeconds: 120 }` (`cv-text-queue.ts:8`, `init-queue.ts:13`). The policy defaults to `standard`. |
| Send options | the same `parseQueueOptions` plus `db` |
| Work options | none (`cv-text-queue.ts:23`). `localConcurrency` 1, batch 1. |
| Retry | none: 1 attempt |
| Expiry, heartbeat | 120 s; no heartbeat |
| Singleton, group | none |
| Handler reads | `job.data.importId` only (`cv-text-queue.ts:24`) |
| On throw | `extractImport` catches every extraction error and marks the import as needing pasted text (`extract-cv-text.ts:39-64`). Only `takeQueuedImport` or `markTextNeeded` can throw. The job then fails without a retry. The module's own recovery requeues an import that has not moved for 3 minutes (`extract-cv-text.ts:67-85`). The child process has a 30-second timeout (`:53`). |

### `ai-execution`

| Aspect | Current behaviour |
| --- | --- |
| Senders | Web: `research.post.ts`, `matching/index.post.ts`, `offers/[id]/matching.post.ts` and `profile/imports/[id]/prepare.post.ts` call `queueClient()` to connect the AI queue, then a module's `requestExecution`/`requestExecutionGroup` → `admitExecutions` → `sendExecutionJob` (`modules/ai/admit-executions.ts:71`). Worker: `recoverExecutions` and `resumeProposalPreparations` at startup and every minute (`worker/index.ts:69-70,82-83`). The handler also sends: `run-execution.ts` retries through `admitExecutions` (`:428`) and wakes the local slot with `resendExecutionJob` (`:526-530`), and `run-batch.ts:122,143` sends after saving outcomes. |
| In the module's transaction | `sendExecutionJob` passes `db: queueDatabase` and `requireQueued` (`execution-queue.ts:32-40`). Every caller runs inside `transaction()`: `request-execution.ts:189`, `run-execution.ts:422` (retry), `recover-executions.ts:28,79,135` and `run-batch.ts:107,129`. `resendExecutionJob` (`execution-queue.ts:43-53`) passes **no** `db` and no `requireQueued`. It runs outside any transaction on pg-boss's pool, and a `null` id (a deduplicated send) is ignored. Its callers are `recover-executions.ts:96,116,121` and `run-execution.ts:529`. |
| Job data | `{ executionId }` |
| Queue creation | `aiExecutionJobOptions` = `{ retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 300 }` (`execution-queue.ts:12-17`, `init-queue.ts:14`). Policy `standard`. |
| Send options | the same options plus `db`. A resend uses the same options plus `singletonKey: executionId, singletonSeconds: 60`. |
| Work options | none (`worker/index.ts:71-73`). `localConcurrency` 1, batch 1. |
| Retry | 3 retries (4 attempts). Exponential backoff from 30 s (B.2). |
| Expiry, heartbeat | 300 s; no heartbeat. Paid work has its own execution lease in application tables (`run-execution.ts:553-556`, task `0mq.15`), not the pg-boss heartbeat. |
| Singleton | Resend only: at most one job per execution id per 60-second time slot (B.7) |
| Group | none |
| Handler reads | `job.data.executionId` only. Not `id`, `retryCount` or `signal`. |
| On throw | `runExecution` rethrows a failed delivery after recording it (`run-execution.ts:519-522`), so pg-boss retries with backoff. The execution keeps waiting for delivery, and a retry delivers again without calling the provider (`execution-queue.ts:7-11`). `modules/ai/execution.integration.test.ts:505-526` asserts `retryLimit + 1` delivery attempts. Any other throw (for example `No agent adapter`, `:455`) also fails the job and is retried. The claim is conditional on the execution's state, so a duplicate or a retried job is harmless (`execution-queue.ts:42`). |

### `system-smoke`

| Aspect | Current behaviour |
| --- | --- |
| Senders | `scripts/smoke.ts:11` and `tests/setup.integration.test.ts:71-72` send `boss.send(smokeQueue, { checkId })` with no options and no transaction |
| Queue creation | `{ retryLimit: 1, heartbeatSeconds: 30 }` (`init-queue.ts:11`). Expiry defaults to 900 s, policy to `standard`. |
| Send, work options | none |
| Handler | `worker/index.ts:50-57`: inserts `system_checks(id)` with `ON CONFLICT DO NOTHING`. It reads `job.data.checkId` only. |
| On throw | the job fails and is retried once |
| Name | `smokeQueue` lives in `lib/queue.ts:3`, not in a module |

### Tests that import pg-boss or `lib/queue` directly

All integration tests build their own `PgBoss` on an isolated schema and create the queue they need.

| File | What it does with the queue |
| --- | --- |
| `tests/db.integration.test.ts` | Sends on a test queue with `db: queueDatabase` inside a rolled-back and a committed transaction. `getJobById` shows the first job is absent. |
| `tests/setup.integration.test.ts` | `createBoss` and `smokeQueue`. It sends two smoke jobs and polls `getJobById` until a separately running worker completes both. |
| `tests/module-boundaries.test.ts` | Asserts `lib/` holds exactly `contact-details.ts`, `db.ts` and `queue.ts` (`:169-175`). It will need updating when the libraries are added. |
| `modules/ai/execution.integration.test.ts` | Creates `ai-execution` with `aiExecutionJobOptions` and drives it by hand: `fetch` → `runExecution` → `complete`/`fail` (`:150-166`). It reads `<schema>.job` by SQL for `state` and `retry_count`. |
| `modules/sources/execute-sync-run.integration.test.ts` | A test queue with `syncJobOptions` and `heartbeatSeconds: 10`, `superviseIntervalSeconds: 1`, `monitorIntervalSeconds: 1` (`:32,101-109`). It uses `fetch`, `send` with `db` and `requireQueued`, `getJobById` as `findJob`, `complete`, and `work` with `pollingIntervalSeconds: 0.5`. A lost worker's job is retried after its heartbeat lapses with `retryCount` 1 (`:620-658`). It also deletes rows of `<schema>.job` directly. |
| `modules/sources/request-sync.integration.test.ts` | Creates `source-sync` and calls `useSyncQueue` and `workSyncQueue` on a second `PgBoss`. It reads `<schema>.job` by SQL (`group_id`, `state`, `retry_count`) and forces `state='failed'`. It also creates a legacy queue `source-solid-jobs` to test recovery (`:477-480`). |
| `modules/sources/sources.integration.test.ts` | `useSyncQueue`; spies on `boss.send` to make it throw after inserting (rollback test); `getJobById` on the stored `job_id`. |
| `modules/sources/sync-run-state.integration.test.ts` | Sends on a test queue with `db: queueDatabase` and `requireQueued` inside `admitRun`'s `sendJob`. It counts `<schema>.job` rows. |
| `tests/sync-entry-points.integration.test.ts` | Two `PgBoss` instances: one sends through `useSyncQueue`, the other runs `workSyncQueue` with test connectors. |
| `tests/jobspy.integration.test.ts` | `useSyncQueue`; spies on `boss.send` (rollback test); `getJobById` checks the job data and group. |
| `tests/polish-sync.integration.test.ts`, `tests/himalayas-sync.integration.test.ts` | `useSyncQueue`. Polish also checks `getJobById(...).data`. |
| `tests/profile.integration.test.ts` | Creates `profile-parse` and `ai-execution`. It passes `boss` to `importCvDocument` and `recoverImports` and connects `useAiQueue`. |
| `tests/profile.http.integration.test.ts` | Creates `profile-parse` in a test schema and starts the built server with `PG_BOSS_SCHEMA` pointing at it (`:46-69`) |
| `tests/matching-ai.fixtures.ts` | `recordingQueue()`: a fake `{ send }` cast to `PgBoss` that records sends and runs `runExecution` for each `ai-execution` job (`:216-252`). It is used by `ai-lease-migration`, `company-research`, `matching-ad-version`, `matching-ai-migration`, `matching-groups`, `matching` and `research-ai-migration`. |
| `tests/profile-ai-migration.integration.test.ts`, `tests/local-profile.integration.test.ts` | Pass a fake or real `PgBoss` to `useAiQueue`, then call `runExecution` directly |

Tests also depend on queue names, option constants and the module-level `use…Queue` connectors. `syncQueueOptions`, `syncJobOptions` and `aiExecutionJobOptions` are imported and asserted (`aiExecutionJobOptions.retryLimit`). The sync, AI and setup tests read the `job` table by SQL.

## B. pg-boss 12.38.0 semantics

### B.1 `retryLimit` counts retries, not attempts

- `retry_count` is 0 on the first claim. Each later claim of a job that has started before increments it: `retry_count = CASE WHEN started_on IS NOT NULL THEN retry_count + 1 …` (`plans.js:2560`). `types.d.ts:1147-1151` says it "identifies the attempt a worker is holding".
- On failure the job goes to `retry` while `retry_count < retry_limit`, otherwise to `failed` (`plans.js:3021-3028`). Total attempts are therefore `retryLimit + 1`. The default is 2 (`plans.js:85-94`, `types.d.ts:545-549`).
- `retryLimit` must be an integer ≥ 0 (`attorney.js:625`).

### B.2 `retryDelay`, `retryBackoff`, `retryDelayMax`

Computed when the job fails (`plans.js:3086-3094`):

- Without backoff, `start_after = now + retryDelay` seconds. The default delay is 0, so the retry is immediately fetchable.
- With backoff, `start_after = now + LEAST(retryDelayMax, GREATEST(retryDelay,1) × (2^min(16, n+1)/2 + 2^min(16, n+1)/2 × random()))` seconds, where `n` is the `retry_count` of the attempt that failed. The delay is uniformly random between `retryDelay × 2^n` and `retryDelay × 2^(n+1)`. For `ai-execution` (`retryDelay` 30) that is 30–60 s, then 60–120 s, then 120–240 s.
- `retryDelayMax` defaults to no limit. It may be set only with `retryBackoff: true` (`attorney.js:626-628`). `retryDelay` must be an integer.

### B.3 Where options are set, and which wins

- **Queue level** (`createQueue`): `policy`, `partition`, `deadLetter`, `warningQueueSize`, `notify`, plus the retry, expiry, retention and heartbeat options (`types.d.ts:521-580,779-820`).
- **Job level** (`send`): `SendOptions = JobOptions & QueueOptions & ConnectionOptions` (`types.d.ts:716`). That is `id`, `priority`, `startAfter`, `singletonKey`, `singletonSeconds`, `singletonNextSlot`, `group`, `deadLetter`, `db`, plus every retry, expiry and heartbeat option.
- **Precedence** at insert: `COALESCE(send option, queue column, library default)` for each of `expireInSeconds`, `retentionSeconds`, `deleteAfterSeconds`, `retryLimit`, `retryDelay`, `retryBackoff`, `heartbeatSeconds`, `deadLetter` and `retryDelayMax` (`plans.js:2852-2862`). `policy` always comes from the queue (`plans.js:2860`). The values are copied onto the job row, so later changes to the queue do not affect jobs already sent.
- **Work level** (`work`): only consumption options apply. These are `localConcurrency`, `localGroupConcurrency`, `groupConcurrency`, `batchSize`, polling, `heartbeatRefreshSeconds`, `includeMetadata`, priority filters, `perJobResults` and `transactional` (`types.d.ts:995-1040`, `manager.js:1164`). Retry, expiry and heartbeat cannot be set here.
- **`createQueue` on an existing queue does nothing.** `create_queue` inserts `ON CONFLICT DO NOTHING` and returns (`plans.js:1074-1080`). Editing `init-queue.ts` therefore never changes a queue that already exists. `updateQueue` exists, but `policy` and `partition` cannot be updated (`types.d.ts:1357-1370`).
- Sending to a queue that was never created throws `Queue <name> does not exist` (`manager.js:1044-1052`). The queue is looked up through pg-boss's own pool, not the caller's `db`, and cached (`manager.js:1521`). The cache refreshes every 60 s by default (`attorney.js:671-672`).

### B.4 `expireInSeconds` and `heartbeatSeconds`: a lost or slow worker

Two independent mechanisms apply.

1. **In the worker process.** The handler races a timer of `max(expireInSeconds of the batch)` (`manager.js:688`, `tools.js:69-80`). When the timer fires:
   - the handler is treated as failed and the jobs are failed, which means a retry if one remains (`manager.js:734`);
   - the batch's `AbortController` aborts, so `job.signal` aborts;
   - the handler itself is **not** stopped. The worker waits for it to return before fetching again and emits a `handler_overrun` warning (`manager.js:774-805`).

   With a heartbeat, the worker refreshes `heartbeat_on` every `heartbeatSeconds / 2` unless `heartbeatRefreshSeconds` is set (`manager.js:605-633`). The refresh is fenced to the worker's attempt. If a refresh finds the job no longer active under this attempt, that job's signal aborts. A refresh that fails with an error aborts nothing and emits `error`.

2. **In the supervisor.** Every `PgBoss` instance with `supervise: true` (the default, `attorney.js:413`) runs a pass every `superviseIntervalSeconds` (default 60, `attorney.js:663`). Each queue is claimed at most once per `monitorIntervalSeconds` (default 60, `attorney.js:669`; `boss.js:330-332`). The pass fails `active` jobs:
   - when `started_on + expire_seconds < now` (`plans.js:2944-2948`);
   - when `heartbeat_seconds IS NOT NULL AND heartbeat_on + heartbeat_seconds < now` (`plans.js:2949-2953`, `boss.js:400-408`).

   Failing goes through the same retry/failed rule as B.1.

- **A worker that dies with a job active.** With a heartbeat, the job is failed within about `heartbeatSeconds` plus up to one monitor interval: 30–90 s for `source-sync` and `system-smoke` with defaults. It then becomes fetchable after `retryDelay`, and a worker picks it up within one polling interval (2 s default, `attorney.js` `applyPollingInterval`). Without a heartbeat, it waits for `expireInSeconds` plus up to one monitor interval: about 120–180 s for `profile-parse` (which then fails for good, `retryLimit` 0) and 300–360 s for `ai-execution`.
- Every process that starts a `PgBoss` takes part in supervision, including the web server and the CLI scripts. The per-queue claim in the `queue` table keeps it to one pass per interval.
- Limits: `heartbeatSeconds` must be an integer ≥ 10 (`attorney.js:631`). `expireInSeconds` must be ≥ 1 and at most 24 hours (`attorney.js:617-621`). Default expiry is 900 s, and heartbeat is off by default.
- `started_on` is reset on every claim (`plans.js:2557-2559`), so expiry counts from the start of the current attempt.

### B.5 `localConcurrency`

`work()` starts `localConcurrency` independent poll loops (`Worker` instances) in the process. Each fetches up to `batchSize` jobs and runs the handler (`manager.js:1294-1300`, `worker.js` `run()`). The default is 1. It is a per-process bound and coordinates nothing between processes.

### B.6 Groups and `groupConcurrency`

- A job gets `group_id` and `group_tier` only from the send option `group: { id, tier? }` (`manager.js:1497-1498`).
- `groupConcurrency` is a fetch filter applied when `work()` fetches (`types.d.ts:1006-1010`). With a value of 1, a job is fetchable only if no `active` job of the same queue has the same `group_id` (`plans.js:2410-2423`). Above 1, it counts active jobs per group. Jobs without a group are never limited. Jobs in `retry` or `created` do not occupy the group.
- The check is a `NOT EXISTS` subquery in the fetch statement, which locks rows with `FOR UPDATE … SKIP LOCKED`. Two fetches running at the same moment in different transactions do not see each other's not-yet-committed `active` row. Each can therefore claim a different job of the same group. This is an inference from the SQL, not observed. The code already assumes it: `start-in-source-turn.ts:16-31`, ASSUMPTION `0mq.16/ASM-3`.
- `localGroupConcurrency` is the in-memory, single-process variant (`types.d.ts:1001-1005`). The project does not use it.

### B.7 `singletonKey` and `singletonSeconds`

- With `singletonSeconds`, `singleton_on` is set to the start of the current time slot: `floor(epoch(now) / seconds) × seconds` (`plans.js:2846-2850`). A unique index on `(name, singleton_on, coalesce(singleton_key,''))` covers every state except `cancelled` (`plans.js:1247-1248`). A second send for the same key in the same slot is skipped (`ON CONFLICT DO NOTHING`), and `send` returns `null` (`manager.js:1527-1556`). A `completed` job still blocks its slot. Slots are aligned to the clock, not to the first send, so two sends 1 s apart across a slot boundary both insert.
- `singletonNextSlot: true` (`sendDebounced`) retries the insert in the next slot with a deferred start (`manager.js:1538-1551`). The project does not use it.
- `singletonKey` **without** `singletonSeconds` deduplicates nothing on a `standard` queue. Only the `short`, `singleton`, `stately`, `exclusive` and `key_strict_fifo` policies have unique indexes on the key (`plans.js:1238-1246,1277-1281`; `types.d.ts:753-777`).

### B.8 Jobs that no handler takes

- **No `work()` registered.** The job stays `created` and is never fetched. The deletion sweep removes jobs in `created` or `retry` once `keep_until = start_after + retentionSeconds` has passed (default 14 days, `plans.js:2855,3662-3667`). The sweep runs per queue every `maintenanceIntervalSeconds` (default 24 h, `attorney.js:666`). Nothing fails or reports such a job.
- **A handler that does not understand the data.** pg-boss does not inspect `data`. Whatever the handler does decides the outcome: a throw fails the job (retry, then `failed`, then the dead letter queue if configured), and a return completes it. The project configures no `deadLetter`.
- **`work()` on a queue that does not exist.** Registration succeeds (`manager.js:1305` notes that `work()` never required the queue). Every fetch then throws `Queue … does not exist` and emits `error`, which exits the worker today (A, shared plumbing).

### B.9 Several job kinds in one queue

A job's `name` is always the queue name (`plans.js:2843` inserts `'${name}' as name`). `work(name, …)` takes one handler per call. Two `work()` calls on the same queue in one process create two independent sets of poll loops, and either may receive any job. The job row has no field for a kind. The `Job` passed to a handler carries `id`, `name`, `data`, `expireInSeconds`, `heartbeatSeconds`, `retryCount`, `signal`, `groupId` and `groupTier` (`types.d.ts:1141-1155`). Several kinds can therefore share a queue only if `data` carries a discriminator that one handler dispatches on. They would also share the queue's `policy` and its fetch-time options: concurrency, group limit and polling. Retry, expiry and heartbeat can still differ per job through send options (B.3).

### B.10 The `db` option: sending in the caller's transaction

- `send(name, data, { db })` runs the `INSERT` through `db.executeSql(text, values)` (`manager.js:1518-1526`). The adapter only needs `executeSql` (`types.d.ts:18-21`), which `queueDatabase` provides.
- The queue lookup before the insert uses pg-boss's own pool (B.3), so it does not take part in the transaction.
- Errors are rethrown to the caller. pg-boss emits no `error` event when a `db` wrapper was given (`manager.js:1526`: `!wrapper`).
- `tests/db.integration.test.ts:145-165` verifies rollback and commit.
- `getJobById`, `fetch`, `complete`, `fail`, `findJobs` and `update` accept `db` too (`ConnectionOptions`, `manager.js:2671-2676`).
- `work(name, { transactional: true }, handler)` is a separate feature: the handler gets a transaction that commits with the job's completion (`types.d.ts:1024-1036`). The project does not use it.

### B.11 `job.signal`

A job's signal is `AbortSignal.any([batchController, perJobClaimController])` (`manager.js:591-599`). It aborts:

- when the handler outruns `expireInSeconds` (B.4.1);
- when a heartbeat refresh finds the job no longer held by this attempt (B.4.1);
- when a stopping instance fails the jobs still in flight after its grace period (`manager.js:1128-1158`, `worker.abort()`).

It is not aborted when graceful stop begins. `resolveWithinSeconds` aborts the same batch controller to cancel its own timer (`tools.js:76-78`), so the signal is also aborted after a handler returns normally (`manager.js:690-696`). It is not tied to the worker's `stopSignal`.

### B.12 `boss.stop()` with jobs in flight

- Defaults: `{ graceful: true, close: true, timeout: 30000 }`, with a minimum of 1000 ms (`index.js:272,289`).
- Graceful stop (`index.js:298-361`):
  1. Every worker loop is told to stop fetching (`manager.js:1110-1124`, `offWork(..., { wait: false })`). Each loop finishes its current batch: `Worker.stop()` awaits `runPromise` (`worker.js`).
  2. Stop waits for those batches up to `timeout`.
  3. Then `failWip()` fails any job still held, with the message `pg-boss shut down while active`, and aborts its signal (`manager.js:1128-1158`). A failed job follows B.1, so it is retried if attempts remain.
  4. The pool closes.
- With `graceful: false` stop skips step 2.
- `worker/index.ts:97-104` calls `boss.stop()` with defaults on `SIGTERM`/`SIGINT`, so in-flight handlers get up to 30 s.

## Implications for the design

- Abstract job settings have to cover what the four queues use today: attempts (`retryLimit + 1`), retry delay and backoff, a time limit per attempt (`expireInSeconds`), lost-worker detection (`heartbeatSeconds`), a per-key "one at a time" (group with `groupConcurrency: 1`) and a dedup window (singleton). `retryLimit` counts retries, so "attempts = N" maps to `retryLimit: N − 1`.
- Settings applied at send time take effect on every job without touching existing queues. Settings applied through `createQueue` take effect only for new queues (B.3). `groupConcurrency` and `localConcurrency` exist only on `work()`, so a definition's concurrency settings must reach the worker library, not just the send.
- `policy` is queue-only. Keeping one queue per job definition keeps that and the work options per definition. A shared queue needs a `data` discriminator (B.9).
- The send operation must keep two modes: in the caller's transaction with "must insert" (`db` plus `requireQueued`), and the deduplicated resend outside a transaction whose `null` result is expected (`resendExecutionJob`).
- Handlers need `job.id`, `job.retryCount` and `job.signal` passed through for `source-sync`. The others read only `data`. Batch size is 1 everywhere.
- Code outside handlers reads pg-boss state (`getJobById` in Sources' turn and recovery). The tests read the `job` table by SQL, fetch and settle jobs by hand, and cast fakes to `PgBoss`. After the change these either go through the queue library or keep importing pg-boss in tests. `tests/module-boundaries.test.ts:169-175` pins the contents of `lib/`.
- Any pg-boss `error` event exits the worker today, including a fetch from a queue that does not exist (B.8). A registry that starts `work()` for a definition whose queue was never created would crash the worker.

## What was not verified

- That two concurrent fetches can both claim jobs of one group under `groupConcurrency: 1` (B.6). This is inferred from the SQL and the project's own assumption, not reproduced.
- Whether a handler's rejection is ever emitted as an `error` event. `#processJobs` catches it and fails the job (`manager.js:733-736`), and no emitting path was found, but the telemetry wrapper was read only in part.
- The time from a lost heartbeat to a retry was derived from defaults and code, not measured. The sync test measures it only with 1-second intervals.
- pg-boss was read from the pnpm store of a worktree, not from the main checkout, which has no `node_modules`. The version there and in the lock file is 12.38.0.
