# Module architecture — Solution design

Requirements: [requirements.md](requirements.md). General rules: [architecture and coding rules](../../architecture/moduly-i-zasady-kodu.md).

This document carries the requirements over into technical language. Its decisions and contracts are binding: a deviation requires changing the document before implementation. The implementer chooses the names of files, internal directories, types and functions in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md#module-directory) and section [T-01](#t-01). Descriptions of the current state refer to revision `d8e71ba` of 2026-11-15.

## Technical rules shared by the tasks

<a id="t-01"></a>

**T-01. Code location.**
- Files required by the framework and by startup stay where they are and delegate to the modules' public operations. They include:
  - the Nuxt server's API routes and its utilities,
  - views,
  - the worker's entry point,
  - the project's startup scripts,
  - migrations.
- The rest of a module's code goes into its directory in the module tree, with a public entry point, in line with the module directory from the architecture rules.
- Mechanisms without a domain owner, that is database access and the pg-boss client, stay in the shared infrastructure outside the modules.
- Tests dedicated to a module lie next to the module, and cross-cutting tests in the shared test directory.
- The first task that creates TypeScript code in the module tree extends the tools' type-checking configuration to that tree; today it covers only shared code, the worker and the scripts.
- We do not move views. We do not rebuild the framework's structure just to unify directories.
- Each task puts the code it creates and moves straight into its target place. Task 0mq.12 tidies up the rest.

<a id="t-02"></a>

**T-02. Database access in changed code.** After task 0mq.13, code created or moved in a task:
- uses the shared accessor and the shared transactional operation ([A13](#a13));
- does not take connections from the pool on its own and does not send `BEGIN` or `COMMIT` by hand;
- does not use PostgreSQL session locks (`pg_advisory_lock`, `pg_try_advisory_lock`, `pg_advisory_unlock`). Transaction locks (`pg_advisory_xact_lock`) are allowed.

<a id="t-03"></a>

**T-03. Database tests.** Integration tests run on an isolated PostgreSQL schema and an isolated pg-boss schema, like the existing integration tests. The shared database access mechanism is set to the isolated schema's pool before its first use. This is test setup, not a change to the test's assertions.

<a id="f2"></a>

## Source sync — implementing F2

Functional rules: [F2](requirements.md#f2).

**pg-boss queue.** Version 12.38.0, checked on 2026-11-15 in the installed package, provides:
- the queue policies `standard`, `short`, `singleton`, `stately`, `exclusive` and `key_strict_fifo`,
- a job's `singletonKey`,
- a job group with a global `groupConcurrency` limit in the queue handler,
- `heartbeatSeconds` (at least 10) with automatic refresh,
- an abort signal (`AbortSignal`) passed to the handler,
- `retryLimit`, `expireInSeconds`,
- sending a job in the caller's transaction (the `db` option).

The requirement "confirm the availability of the pg-boss options before implementation" from tasks 0mq.3 and 0mq.5 is therefore met.

**Split of mechanisms.**

| Rule | Mechanism | Task |
| --- | --- | --- |
| F2-06 | One sync queue; the job group equals the source name; `groupConcurrency` 1 in the queue handler (a global limit, in the database); jobs in a group are fetched in order of creation. | 0mq.16 |
| F2-07 | Partial unique indexes on runs and the acceptance from [0mq.3](#a3). | 0mq.3, 0mq.16 |
| F2-13 | `heartbeatSeconds` 30, `retryLimit` 2, `expireInSeconds` 3600; the handler's abort signal; the run's attempt number as a fencing token for writes. | 0mq.5 |
| F2-10 | Sending the job in the acceptance transaction (the `db` option); the CLI polls the run state. | 0mq.16 |

**Current state.** Each source has its own path for requesting, execution and recovery. They are:
- SOLID.Jobs with a queue and a schedule,
- JobSpy with a separate queue per portal,
- Polish portals with a separate queue per portal,
- Himalayas started synchronously from the CLI, without a queue.

The paths protect execution with session locks and requesting with a transaction lock. Saving batches is shared. Only the SOLID.Jobs path marks unseen ads, after a complete run and in one transaction with the complete status.

<a id="a13"></a>

## Task 0mq.13 — Shared database access and transactions

Requirements: [A13](requirements.md#a13).

### Decisions

1. **Pool.** Connections are managed by a `pg` pool, one per process. A query outside a transaction takes a connection for the duration of the query, a transaction for its own duration. Module code does not take connections on its own and does not hold them between operations. This replaces the earlier rule of one session per process.
2. **Accessor.** The shared infrastructure provides a query executor accessor. Inside a transaction it returns that transaction's connection, and outside it the pool. The transaction context passes through `AsyncLocalStorage`, so the signatures of domain operations contain no connection type, and the entry point prepares nothing.
3. **Transactional operation.** Outside a transaction it takes a connection, sends `BEGIN`, executes the function in the context of that connection and sends `COMMIT`. On error it sends `ROLLBACK` and raises the original error; an error of the `ROLLBACK` itself does not replace it. The connection always returns to the pool; a broken connection is released with an error so that the pool discards it. Inside a transaction in progress, the operation executes the function without `BEGIN` and `COMMIT`.
4. **An error rolls back everything.** Work does not continue after an SQL error in the same transaction. SAVEPOINT is not used.
5. **Repositories.** A module's data access is done by repositories in the module's persistence layer, using the accessor. A repository does not open connections or transactions and is not part of the module's public entry point. There is one per aggregate, with methods that follow from the use cases, without general CRUD operations for each table. List reads with filtering and pagination may have dedicated queries.
6. **No row locks for the caller.** Public read operations do not take row locks on behalf of the caller. Reading the profile and the ad with `FOR SHARE` when publishing a match assessment disappears in task 0mq.10, in line with the owner's decision in [A13](requirements.md#a13). Row locks on another module require a separate decision.
7. **Queue in a transaction.** The shared infrastructure provides a query executor adapter for the pg-boss `db` option. Each of its calls goes through the accessor, so a job sent in a transaction belongs to it.
8. **No session locks.** Session locks need a fixed connection, so code moved to the shared mechanism gives them up (T-02). Protection against the same work being picked up twice stays, as a conditional state change in the database.
9. **Library independence.** The implementation uses `pg`. A later migration to a typed query builder (recommendation: Kysely) does not change the signatures of operations or repositories.

### Shared infrastructure contract

The shared database access infrastructure, which stays outside the modules, provides:

- **The query executor accessor.** The object has a `query` method compatible with `pg`, which both the pool and a connection satisfy.
- **The transactional operation**, which takes an asynchronous function and returns its result, with the semantics from decision 3.
- **The adapter for the pg-boss `db` option**, from decision 7.
- **The process pool**, created lazily from the existing connection configuration and with the existing limit of 5 connections. The pool can be replaced before its first use, e.g. in a test with the isolated schema's pool. Replacing it during a transaction is a programmer error and throws an exception.

The server and the worker use the process pool. CLI scripts that today create their own pool also move to the process pool. The existing helper transactions of the modules and the existing queries stay unchanged (A13-R08); task 0mq.18 and the tasks that change that code remove them.

Decisions 1–9 go into the [architecture rules](../../architecture/moduly-i-zasady-kodu.md) as a section on database access. After deployment, this document is a historical record.

### Verification

Integration test of the shared infrastructure according to T-03:

| Criterion | Check |
| --- | --- |
| A13-AC01, AC02 | Two operations that write rows; the outer one raises an error after the inner one. |
| A13-AC03 | While the outer operation runs, a second connection outside the transaction does not see the inner operation's write. In addition, a tap on the transaction connection's queries: one `BEGIN` and one `COMMIT`. |
| A13-AC04 | Two operations in `Promise.all`, one with an error. |
| A13-AC05 | A job sent through the pg-boss adapter in a transaction with a rollback and with a commit; the job's presence checked by its identifier. |
| A13-AC06 | A test pool with a connection limit; more failed operations than the limit, then a successful operation. The pool's number of free connections returns to the initial state. |
| A13-AC07, AC08 | Review of the documentation and the diff. |

<a id="a1"></a>

## Task 0mq.1 — Connector contract

Requirements: [A1](requirements.md#a1).

### Connector contract

The contract lies in the adapter layer of the Sources module, outside the directories of the specific connectors. A connector has:

- **a fixed name**: the existing source identifier;
- **a declaration of inference from absence**: a boolean value used by task 0mq.7;
- **derivation of scope parameters from the request**: a source-specific input (e.g. a Polish portal query); the output is a JSON object of parameters;
- **a fetch**, which takes:
  - the scope parameters,
  - a function that accepts a batch of ads,
  - an abort signal.

  The fetch returns a result: *complete* or *incomplete with a reason* (text), both with optional diagnostics (a JSON object).

An ad in a batch contains:

- **the external identifier**: the existing offer key at the source;
- **the address**: a URL or nothing;
- **the expiry date**: a date or nothing, where nothing means unknown;
- **the content**: an object identical to the object that today goes into saving a batch, together with the offer key. The content hash is computed from it, so its form must not change (A1-R05).

Fetch semantics:

- The connector waits for the batch to be accepted before fetching the next one, so saving is incremental.
- An error raised by the batch-accepting function, that is a save error, is passed on by the connector without catching it.
- After the signal is aborted, the connector ends the fetch as fast as possible and raises an abort error. In this task, the existing paths pass a signal that is never aborted.
- Errors whose message is saved in the run today (adapter messages about the API and HTTP) are raised by the connector as a dedicated connector error with the same message. The message of such an error is safe to save: it contains no secrets and no raw responses. The caller replaces other errors with a general message, as today.

### Connectors

| Source | Batch | Result |
| --- | --- | --- |
| SOLID.Jobs | API page | Existing criteria:<br>- a valid page,<br>- a constant number of results and pages,<br>- the number of unique identifiers equals the number of results,<br>- a limit of 1000 pages.<br><br>A duplicate makes the result incomplete but does not stop the fetch of further pages. The connector counts unique identifiers itself. |
| Himalayas | API page | the existing criteria of the Himalayas path |
| JobSpy portals | like the existing call to save a batch | the existing criteria of the JobSpy path |
| Polish portals | like the existing call to save a batch | the existing criteria of the Polish portals path |

Connector structure:

- Each connector has its own directory in the module's adapter layer.
- JobSpy portals share one implementation parameterised by the JobSpy catalogue key; Polish portals likewise.
- The helper tools' Python scripts stay where they are as startup files (T-01), and calling them belongs to the connector.

Scope parameters:

- SOLID.Jobs and Himalayas return the existing fixed parameters.
- JobSpy returns the existing portal parameters.
- Polish portals return the existing parameters from the query after validation.

The scope fingerprint is computed by the existing hash function with canonical key order, moved to the Sources module. The connector sorts lists that have set meaning and removes repetitions from them; the current scopes have no such lists.

### Transport

A shared HTTP request helper serves the connectors that communicate with the source themselves (SOLID.Jobs, Himalayas):

- The timeout of a single request is 5 s, and there are at most two retries (at most three attempts). Both values are configurable by a parameter.
- Eligible for retry: a network error, a timeout, HTTP 429 and 5xx.
- Before a retry, the helper waits as long as `Retry-After` says, but not less than 1 s, and 1 s without that header. When `Retry-After` exceeds 60 s, it raises a connector error with a message about a deferred retry and the HTTP status.
- The helper returns any other status to the caller.
- The clock, the wait function and the `fetch` function can be injected for tests.
- The 1 s gap between SOLID.Jobs requests stays in the SOLID.Jobs connector.
- Himalayas keeps the limit of 120 s per run and does not start a page when less than 21 s remain to the limit. The connector passes the moment the limit ends to the helper, and the helper does not retry a request whose wait and attempt will not fit before it.

The JobSpy and Polish portal connectors start Python processes and keep the current limits (F2-05):
- the query time limit in JobSpy,
- the limits of the Polish portal readers,
- the process time limits.

### Changes in the existing paths

- The existing sync execution functions of the four sources fetch data only through connectors.
- The batch-accepting function calls the existing batch save with the ad contents. Task 0mq.4 replaces it with a new service.
- The run status follows from the connector's result: a complete result goes down the existing complete path, and an incomplete one down the existing error path, with the reason as the message.
- A Himalayas batch save error keeps the existing status, message and counters. The diagnostics of such a run contain only the query, the number of pages, the stop reason and market incompleteness, because the connector's counters do not come out together with the error.
- Requesting, locks and unavailability marking stay unchanged; tasks 0mq.3–0mq.5, 0mq.16 and 0mq.7 replace them.

### Verification

| Criterion | Check |
| --- | --- |
| A1-AC01 | Typecheck and code review. |
| A1-AC02 | Helper test with a fake clock: no response (5 s), three 503 responses (three attempts), 404 (one attempt), `Retry-After` 120 s (connector error). |
| A1-AC03, AC04 | Test of the SOLID.Jobs connector with a `fetch` stub: three pages give three batches; a duplicate within a page and between pages does not stop the fetch, and the result is incomplete. |
| A1-AC05, AC06 | Existing sync integration tests of all four paths, extended with assertions on the identifier, address, expiry date, hash and content of the saved ads where they are missing. |
| A1-AC07 | Unit test with the fingerprints of the default scopes computed before the change and stored in the test. |
| A1-AC08 | Unit test of the declarations of all connectors. |

<a id="a2"></a>

## Task 0mq.2 — Connector registry

Requirements: [A2](requirements.md#a2).

### Registry contract

- The registry is built from a list of connectors. A repeated name stops the build with a dedicated error carrying the name.
- The registry provides a lookup of a connector by name and the list of names in registration order.
- Looking up an unknown name raises a dedicated error with the name in a separate field. The message has the form `Unknown source: <name>`, with no other data.
- The application registry is the only place that imports specific connectors. It registers SOLID.Jobs, Himalayas, and one connector for each portal from the JobSpy catalogue and for each Polish portal.
- The registry does not filter out sources disabled in the configuration. Whether a source is enabled is checked, as before, by the requesting operations.
- The application registry is created when the module is imported, so a repeated-name error stops the server and the worker from starting.

### Changes in the existing paths

The existing sync functions get the connector from the registry by the source name. The entry points (worker, CLI scripts, source API routes) do not import connectors. Tests may inject a connector or a registry in place of the page-fetching functions they inject today.

### Verification

Unit test of the registry for A2-AC01–AC03. For A2-AC04, a search for imports of specific connectors outside the registry and the connectors themselves gives no results.

<a id="a3"></a>

## Task 0mq.3 — Run state

Requirements: [A3](requirements.md#a3).

### Decision: uniqueness of the pending run in the database

Rule F2-07 is enforced by two mechanisms:

- **The database.** Partial unique indexes allow at most one pending run and at most one run in progress per scope.
- **pg-boss.** The queue ensures one active run per source (job groups, task 0mq.16). We do not duplicate the uniqueness of the pending run in the queue.

Acceptance first inserts the run with `ON CONFLICT DO NOTHING`, and sends the job only after a successful insert, in the same transaction. Rationale:

- concurrent acceptances are resolved by the index, without locks and without SAVEPOINT;
- a queue job is never created without a run;
- the current schema already uses a unique index for this purpose, but forbids the state "in progress and pending", which F2-07 requires.

Rejected alternative: `singletonKey` with the `stately` policy, and looking up the existing run when pg-boss rejects a duplicate. This made the state of runs depend on the state of the queue, and the `stately` policy with a key per source and scope does not ensure one active run per source, so it would have needed job groups anyway.

### Migration

A new migration replaces the unique index of active runs (the pending and in-progress statuses together) with two partial unique indexes on the scope: one for the pending status and one for in progress. The status dictionary does not change; a pending run has the existing status `queued`.

### Operation contract

The operations are internal to the Sources module. A run as an object contains:
- the run and scope identifiers,
- the source and the scope parameters,
- the reason it was started (manual or schedule) and the schedule day,
- the status,
- the queue job identifier,
- counters of pages, unique ads and versions,
- the error and diagnostics,
- the creation, start and finish dates.

**Acceptance** takes the source, the normalised scope parameters, the reason, the schedule day, and a function that sends the job for a given run identifier. That function uses the pg-boss adapter from task 0mq.13 and returns the job identifier or raises an error. Acceptance returns the run identifier and information whether an existing run was pointed to. In one transaction, in order:

1. Upsert of the scope by the parameter fingerprint.
2. Insert of a pending run, skipping a conflict on the pending index.
3. Without an insert: read the identifier of the existing pending run, without sending a job.
4. After an insert: send the job and save its identifier. A send error rolls back everything. Acceptance without a job-sending function (only Himalayas until task 0mq.16, see [0mq.5](#a5)) skips this step.

The other operations:

- **Start** is a conditional status change from pending to in progress with the start date. When the condition is not met, the operation returns no run. When another run is in progress in the scope, the in-progress index raises a uniqueness error, and the run stays pending; the caller treats this as "not yet".
- **Finish** takes the status complete, partial or failed, the error and optional diagnostics. It changes the state only of a pending or in-progress run and returns whether the change happened. The caller chooses the status.
- **Read a run** by identifier, together with the scope parameters.
- **List of unfinished runs**, optionally for one source, oldest first.

### Scope of changes

The task delivers the migration, the operations and the tests, but does not switch the existing paths to them (A3-R06). After the migration, the existing paths still do not create two active runs in a scope, because they check for an active run under a transaction lock.

### Verification

| Criterion | Check |
| --- | --- |
| A3-AC01 | Test according to T-03: ten acceptances in `Promise.all`, each sends a job through the pg-boss adapter. Result: one pending run and one job in the queue. |
| A3-AC02–AC05 | Sequential scenarios according to T-03; AC05 also through the existing sync tests. |

<a id="a4"></a>

## Task 0mq.4 — Batch save

Requirements: [A4](requirements.md#a4).

### Operation contract

Saving a batch is an internal operation of the Sources module:

- It takes the run (run identifier, scope identifier, source) and a list of ads in the form from the connector contract.
- It returns a summary: the number of new observations, repeated observations and new versions.
- It works in the transactional operation from task 0mq.13: on its own as one transaction per batch, and called inside a transaction in progress as part of it.

For each ad, the operation does the same as today's batch save:

1. **Upsert of the ad** by the pair of source and external identifier. It sets:
   - the address,
   - the time of the last observation,
   - the scope of the last observation,
   - availability to available,
   - the expiry date from the ad.
2. **An observation** in the run, inserted while skipping a conflict. An insert means a new observation, and a conflict a repeated one.
3. **A new version, set as the current one**, when the content hash differs from the hash of the current version.

At the end of the batch, the operation increases the run counters: the number of pages by 1, the number of unique ads by the number of new observations, and the number of versions by the number of new versions. Any error in the batch rolls back the batch and is raised as a dedicated save error with the original error as its cause.

Other points:

- The expiry date is copied from the ad as today, so an observation without a date saves its absence. Changing this rule would require setting the precedence of signals, which is not part of the epic.
- Handling of an explicit closed status is not confirmed for all connectors. The task keeps the information passed on and the existing mappings. If the implementation would need a new mapping or a resolution of conflicting signals, the implementer ends the task as blocked with a question.
- The model in which an ad is available and expired at the same time (expiry computed from the expiry date at read time) stays unchanged.
- The operation does not change the availability of ads outside the batch.

### Changes in the existing paths

- The batch-accepting function in the existing paths (task 0mq.1) calls the new batch save, and the existing save is removed.
- The new save uses the shared database access, not the path's connection, so the integration tests of those paths set the pool according to T-03.
- Marking unseen ads in the SOLID.Jobs path (condition: the scope of the last observation equals the run's scope) stays unchanged until task 0mq.7.

### Verification

| Criterion | Check |
| --- | --- |
| A4-AC01–AC08 | Integration test of the operation according to T-03, on the data from the A/B example in the requirements. AC08 forces an error by violating a database constraint in the second ad of the batch. |
| A4-AC05 | In addition, the existing expiry test in the Offers module. |
| A4-AC09 | Existing integration tests of the SOLID.Jobs and Himalayas paths. |

<a id="a5"></a>

## Task 0mq.5 — Shared run executor

Requirements: [A5](requirements.md#a5).

### Execution flow

The executor is an operation of the Sources module called from the queue handler with the run identifier, the job's attempt number (pg-boss `retryCount`) and the job's abort signal. In order:

1. **Takeover with a token.** A conditional change of the run state in one query:
   - from pending to in progress, saving the attempt number;
   - or, when the run is already in progress, has the same queue job and a lower saved attempt number, to in progress with the new attempt number. This is a new attempt at the same run (F2-13).

   Otherwise, the executor ends its work without changes (repeated delivery, finished run).
2. **Connector.** The executor gets the connector from the registry by the run's source name. An unknown name or a failed validation of the settings by the connector ends the run as failed with the connector error message or a general message (A5-R04).
3. **Fetch** with the scope parameters saved at acceptance and with the job's signal. The batch-accepting function calls the batch save ([0mq.4](#a4)) in a transaction that first checks the token: the run's attempt number equals this attempt's number, and the run is in progress. A mismatch stops the save with a run-lost error, and the executor ends without further writes.
4. **Finish.** A complete result and no save errors lead to one transaction: checking the token, the availability assessment ([0mq.7](#a7); until then the existing SOLID.Jobs rule for connectors that declare inference from absence), and finishing with the complete status. Otherwise, finishing with the partial status when the run has at least one unique ad, or failed, with the result's reason, the connector error message or a general message. Finishing also checks the token.
5. **An abort error** (signal aborted) and a run-lost error end the handler without writes; pg-boss decides what happens to the job next.

### Queue and recovery

- Run jobs have `heartbeatSeconds` 30, `retryLimit` 2 and `expireInSeconds` 3600. The queue handler refreshes the heartbeat automatically. Losing the worker ends the heartbeat, and pg-boss retries the job (the new attempt takes over the run with a higher attempt number) or, once the attempts are used up, marks it as failed.
- Recovery (at worker start and in the schedule cycle every 60 s) reviews unfinished runs. A run whose queue job does not exist or is in a final state (`completed`, `failed`, `cancelled`) is ended as partial or failed (by the number of unique ads) with a message about the interruption. Recovery uses conditional state changes, without session locks, so it can run in several workers at once.
- The migration adds the attempt number to the run (an integer, empty by default).

### Changes in the existing paths

- The handlers of all existing source queues call the shared executor. The existing execution and recovery functions of the four paths and their session locks are removed.
- The existing requesting stays (task 0mq.16 will replace it), with the job options from the point "Queue and recovery" instead of the current ones (`retryLimit` 0). The queues are created with these options at initialisation. Until task 0mq.16, one active run per source is ensured by separate queues per source and the existing requesting rules with one worker in the deployment.
- Until task 0mq.16, the mapping of sources to their queues, the worker's handling of all sync queues and the lookup of a run's job for recovery stay in `lib/sources/sync-queues.ts`, outside the Sources module, because they name every existing source queue. This is a deviation from the placement rule of the architecture rules, accepted by the owner on 2026-11-17 (finding F4 of the 0mq.5 review). Task 0mq.16 replaces the per-source queues with one queue and ends it. <!-- altitude-ok: names the legacy file that holds the deviation -->
- The status of an incomplete run is set only by step 4 (A5-R03), without the existing source rules. An incomplete run without a unique ad ends as failed also in SOLID.Jobs (today partial after reading a page) and in JobSpy (today partial when the tool's status is other than failed). The integration tests that pinned the existing statuses of these cases now expect the failed status. The owner's decision of 2026-11-16 replaces, in this respect, the assumptions ASM-2 and ASM-4 from task 0mq.1.
- Himalayas: the CLI creates the run through the acceptance from [0mq.3](#a3) without a job-sending function, starts it at once and calls the shared executor in its own process, with a signal that is aborted when the process ends. Until task 0mq.16, the job-sending function is optional in acceptance; only execution in the CLI process omits it, and a run without it has no job in the queue (owner's decision of 2026-11-17, a deviation from A3-R02 limited to this path). Task 0mq.16 makes the function mandatory again.
  A run without a job in the queue has no signal that its process is alive. It is treated as left behind by a dead process when it has lasted at least 240 s, that is twice the Himalayas run limit (owner's decision of 2026-11-17). Such a run is ended with a message about the interrupted import both by recovery in the worker and by the CLI itself before it accepts a new run of this source, so it does not need a running worker. A shorter run left behind by a process that ended without handling the signal blocks new Himalayas runs until that time has passed.
- Run state changes in the new code go through the operations from [0mq.3](#a3), extended with the token.

### Accepted review findings

The owner accepted the following findings of the 0mq.5 review on 2026-11-17 as they were implemented. F2 and F4 are recorded in the points above.

| Finding | What stays | Until |
| --- | --- | --- |
| F3 | The pages count of a run counts saved batches, not source pages. For Polish portals and JobSpy it is usually 1; the number of source pages is in the run diagnostics. | Fixed outside this epic, task oferty-pracy-sz5. |
| F5 | The module's public operations include exports that no other module uses yet (among them the errors for a lost run and for an already active run). | No end date. |
| F6 | The saved error messages of runs are unified into the messages from step 4 and from recovery. The integration tests that checked rejecting a run executed through another source's queue were removed with the per-source execution paths. | No end date. |
| F7 | The Nuxt configuration points the directory of local Nuxt modules away from the directory of the application's modules, so Nuxt does not load the application's domain modules as Nuxt modules. | No end date. |

### Verification

| Criterion | Check |
| --- | --- |
| A5-AC01–AC05 | Integration test according to T-03 with simulated connectors registered in a test registry. |
| A5-AC06–AC09 | Test with a real queue: worker A takes over the run and is stopped without finishing the job (simulated loss); after the heartbeat expires, worker B retries; A's writes after the loss are rejected; the numbers of ads and runs match. Delivering a finished run again does not change the state. For AC09, a run in progress whose job is in a final state. The heartbeat value in the test may be the minimum (10 s). |
| A5-AC10, AC11 | Existing integration tests of the sync paths, extended with execution by the shared executor. |

<a id="a19"></a>

## Task 0mq.19 — Acceptance without retrying

Requirements: [A19](requirements.md#a19).

### Acceptance

The acceptance contract from [0mq.3](#a3) does not change: it returns the run identifier and information whether an existing run was pointed to. The indexes from 0mq.3 stay. Step 3 changes:

3. Without an insert: one attempt to read the scope's pending run and, when there is none, the scope's run in progress (it started after the conflict). The run found is returned as existing, without sending a job. When there is none, acceptance raises an error asking for a new request, and the transaction rolls back.

The loop of up to three attempts from 0mq.3 is removed together with its tests.

### Verification

| Criterion | Check |
| --- | --- |
| A19-AC01, AC02 | Integration tests according to T-03 with the existing way of forcing the race from the 0mq.3 tests: the pending run starts (AC01), or starts and finishes (AC02), between the insert and the read. |
| A19-AC03 | Code review. |
| A19-AC04 | Existing acceptance tests from 0mq.3. |

<a id="a16"></a>

## Task 0mq.16 — Shared requesting and queue

Requirements: [A16](requirements.md#a16).

### Queue

- One source sync queue with the `standard` policy, `heartbeatSeconds` 30, `retryLimit` 2 and `expireInSeconds` 3600, created at queue initialisation. The existing source queues are removed from initialisation and from the worker's handling.
- A run job has a group whose identifier equals the source name. The queue handler in the worker has `groupConcurrency` 1, so across the whole system one source executes one run at a time, and different sources run in parallel (`localConcurrency` equal to the number of registered sources).
- The worker's handling of the queue and the lookup of a run's job for recovery are operations of the Sources module. `lib/sources/sync-queues.ts` is removed, which ends the deviation recorded in [0mq.5](#a5) (finding F4). <!-- altitude-ok: names the legacy file that holds the deviation -->

### Request operation

A public operation of the Sources module takes the source name, the source-specific scope input and the reason for starting. In order:
1. the connector from the registry (unknown source: an error for the caller, no run);
2. a check whether the source is enabled (as before);
3. the scope parameters from the connector;
4. acceptance of the run ([0mq.3](#a3)) with the job sent to the queue in the same transaction.

It returns the run identifier and information whether an existing run was pointed to.

### Schedule

- A schedule occurrence is identified by the pair: the source with a schedule (today SOLID.Jobs) and the schedule day, computed as before from the configured schedule hour in the Europe/Warsaw time zone.
- Before requesting, the schedule checks whether there is a run with the schedule reason for this scope and day; if so, it does not request. Manual runs are not taken into account.
- The check and the request run in one transaction with a transaction lock on the occurrence, so parallel schedule cycles in several workers create one request.

### Entry points

- The sync CLI scripts of all sources, including Himalayas, request through the request operation. With the wait option, they poll the run state every 1 s with no time limit until a final state. Exit code: 0 for complete, 1 for partial and failed. Interrupting the script does not change the run.
- The API route for a Polish portal request uses the request operation, with the existing validation and response codes.
- Public read operations: the run state (by identifier, or the latest for a scope) with the latest complete run, and the state of the source catalogue (the existing data of the JobSpy and Polish portal catalogues). The status routes and scripts use them and keep the existing form of responses.

### Deployment

Recovery from [0mq.5](#a5) ends the runs whose jobs are in the existing queues, because the job does not exist in the new queue or its queue has no handler. The message about the interruption asks for a new request.

### Verification

| Criterion | Check |
| --- | --- |
| A16-AC01, AC02, AC06 | Integration test according to T-03: parallel requests through the request operation. |
| A16-AC03 | Test with two pg-boss instances handling the same queue and simulated connectors that record start and end times. |
| A16-AC04 | Schedule test with a fixed clock and two parallel cycles. |
| A16-AC05, AC07 | Test of the operation and a run of the CLI script on an isolated schema with a simulated connector. |
| A16-AC08 | Existing route tests. |
| A16-AC09 | Recovery test with a run whose job lies in the existing queue. |

<a id="a7"></a>

## Task 0mq.7 — Unavailability rule

Requirements: [A7](requirements.md#a7).

- An operation of the Sources module called by the executor ([0mq.5](#a5)) in the finishing transaction, with the context: source, scope, run and the connector's declaration of inference from absence. When the declaration does not allow inference, the operation does nothing.
- Candidates: ads of the source for which there is an observation in any earlier run of this scope and no observation in the current run. These ads become unavailable. The scope of the last observation is not used in the condition.
- The existing condition on the scope of the last observation in the executor is removed.
- If the query plan requires it, the migration adds an index on the observation relation by ad.

### Verification

Integration test according to T-03 for A7-AC01–AC05, with runs executed by the shared executor and a simulated connector with and without the inference declaration. AC03 forces an error in the finishing transaction.

<a id="a8"></a>

## Task 0mq.8 — Offers module

Requirements: [A8](requirements.md#a8).

- The list and details logic goes into the Offers module: filter parsing, filtering, sorting, pagination, salary matching, building the filter options, and the unit tests of this logic. The module's public entry point exports the list operation (with filters and page) and the details operation, and the response types.
- The offer API routes pass the query to the module's operation and return the result without their own logic. Composing the list response with the sync and matching state stays in the route until tasks 0mq.6, 0mq.16 and 0mq.18.
- Functions used by the views (e.g. building the form's filter query) stay available to the views through the module's public entry point.
- The ad content projection and the direct reads of Sources data move into the module unchanged; task 0mq.6 replaces them with the Sources contract.
- The module description is written at the end of the task, after the code is tidied up and the tests are checked.

### Verification

Existing offer tests (unit and integration) moved into the module or left as cross-cutting, without changing their assertions.

<a id="a6"></a>

## Task 0mq.6 — Ad read contract

Requirements: [A6](requirements.md#a6).

### Decision: translating content belongs to Sources

Ad content is saved in the form it has at the source, because the version hash is computed from it (A1-R05). Translating it into the unified form is therefore done by the Sources read, not by the save. The existing content projection from the Offers module moves to Sources as part of the read contract, together with the remote-work qualification assessment and the source name from the catalogues. Expiry (an expiry date before the moment of reading) is computed in the read as before.

### Read contract

Public operations of the Sources module:

- **Read current ads** by a list of identifiers, in one query; missing identifiers are skipped. The variant without a list returns the catalogue up to the existing limit of 10,000 ads and raises the same error when it is exceeded.
- **Read given versions** by a list of version identifiers.
- **List of an ad's versions**: identifier and date, newest first.
- **Current versions** by a list of ad identifiers: the identifier of the ad and of its current version (for assessment freshness and company links).

An ad in the response has its identifier, the identifier of its current version, the fields from A6-R02 in the existing types and meanings of the projection, and the dates of the first and last observation. The version read returns the same fields for the content of that version. The reads take no row locks.

### Consumers

- **Offers**: the list and details from the read of current ads and the list of versions.
- **Matching**:
  - the assessment input from the read of a given version. The assessment first gets the current version, then its content, and saves that version (A6-R04);
  - assessment freshness from the current versions;
  - the match list from the bulk read.

  SQL joins with Sources tables disappear.
- **Companies**:
  - the ads linked to a company through the bulk read,
  - the titles in the link history through the version read,
  - the company name from the ad through the read of the current ad,
  - the link from the current version without `FOR SHARE`.

  The transaction lock on the ad during linking stays (A6-R05).

  The read returns a fixed text for a missing title and for a missing company name. Companies treat these two texts as "missing": the link history shows its own label for an ad without a title, and the suggestion of company profiles is skipped for an ad without a company name (A6-R07). An ad whose source content is exactly one of the two texts is therefore treated as missing too; the owner accepted this on 2026-11-17. This is the target behaviour of the task, not interim code, and it carries no follow-up.

### Verification

| Criterion | Check |
| --- | --- |
| A6-AC01 | Integration test of the read operations according to T-03. |
| A6-AC02 | Existing offer, matching and company tests; comparison of the projection before and after on test data. |
| A6-AC03 | Integration test: the ad content changes between getting the current version and saving the assessment. |
| A6-AC04 | Search of the Offers, Matching and Companies code for Sources tables and imports of Sources internals. |
| A6-AC05 | Test with a pool query counter for the offer list with assessments. |

<a id="a10"></a>

## Task 0mq.10 — Public read of the Profile

Requirements: [A10](requirements.md#a10).

- Public Profile operations:
  - **Read the active version:** the version's identifier and data, or an explicit result "no active version".
  - **Read given versions** by a list of identifiers, in one query.
  - **Version metadata in bulk:** identifier, confirmation date and version number. The reads take no locks.
- Matching replaces SQL joins with Profile data by calls to these operations:
  - **Assessment freshness:** Matching gets the active version identifier once per operation and compares it in its own query with the version saved with the assessment.
  - **Group request:** the active version is read once per group and passed to all items.
- The read at assessment publication, with the join of profile and ad and `FOR SHARE`, is split:
  - the profile is read through the read of the active version, without a lock;
  - the ad is read without a lock on the profile row, and until task 0mq.6 through the existing Matching query.
- The assessment freshness rule stays in Matching.

### Verification

| Criterion | Check |
| --- | --- |
| A10-AC01 | Integration test of the operations according to T-03. |
| A10-AC02 | Existing matching tests. |
| A10-AC03, AC04 | Integration tests with a parallel profile confirmation, started through `Promise.all` during a group request and an assessment publication. |
| A10-AC05 | Search of the Matching code for Profile tables. |

<a id="a14"></a>

## Task 0mq.14 — AI module

Requirements: [A14](requirements.md#a14). F4 scope: [F4](requirements.md#f4). Stage 1: [requirements](../lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md), [SD](../lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md).

### Decisions

1. **Layers.** The AI module has three layers:
   - **The public entry point** with the general contract.
   - **Coordination:** the state of executions and attempts, the execution queue, the budget, settlement, the shared local slot, retries and recovery.
   - **Provider adapters.**

   The client depends only on the public entry point, and coordination only on the adapter contract.
2. **Execution request.** The request works in the client's transaction (the shared mechanism from 0mq.13) and takes:
   - the settings key: a name the client defines for itself (e.g. `profile`), under which AI keeps that client's execution settings (decision 10),
   - the identifier of the domain operation and an optional input version,
   - the execution mode: single, a batch item with a group identifier, or agent work,
   - the instruction, the response schema and the input.

   It fixes a snapshot of the configuration and price list, reserves the budget by the existing rules (or saves a wait for budget), and sends the job to the AI execution queue in the same transaction. It returns the execution identifier and the initial state. For a group, the reservation covers the whole group or nothing.
3. **One active execution per operation.** The AI module ensures that a given domain operation has at most one execution in progress. The rule is enforced by a partial index on the execution data. This replaces the existing rule of one attempt in progress per import in the Profile data; task 0mq.9 carries out the migration.
4. **Result receiver.** For a settings key, the client registers a result receiver: a contract defined by AI and implemented by the client's integrating layer. Registration happens where dependencies are composed (worker, server). The receiver is called in one of two cases:
   - **A result that matches the schema:** AI passes the operation identifier, the input version, the result and the cost information. The receiver returns the decision "accepted" or "rejected with a reason".
   - **A final state without a result:** AI passes the cause.

   AI calls the receiver in the transaction in which it saves the settlement. The client's publication and the settlement are therefore committed together. The cost is settled regardless of the receiver's decision; an unknown cost stays reserved.

   **Execution and delivery are separate (decision 11).** An exception thrown by the receiver is neither a decision nor an outcome of the execution.
5. **Adapter contract.** An adapter declares the execution modes it supports. A request in a mode that no adapter for the chosen provider supports is refused at request time with the cause `unsupported_mode`: no budget is reserved and no job is queued (decision 13).
   - **Single:** request, result and usage, with errors classified like the existing model errors.
   - **Batch:** creating a batch with item identifiers, polling the state, fetching results per item, and cleanup. It includes telling a missing result file apart from a correct result, and an uncertain state after sending.
   - **Agent:** starting work with allowed tools, the result, the materials and the usage of each step.

   Coordination computes the cost from the usage and the price list snapshot. The existing OpenAI (single call) and Ollama adapters go into the module as single-mode adapters. The OpenAI batch adapter and the research adapter are created from the Matching and Companies code in task 0mq.17.
6. **Configuration and budget.** The cost arithmetic and the monthly budget move into the module without changing behaviour (E01-AC02–AC04). Configuration changes as decision 10 describes, which replaces E01-AC01. Reservation and settlement work in the current transaction.
7. **Reads.** Public AI reads:
   - **Execution:** state, result, usage, cost (reserved, actual, unknown), cause, and the operation's attempt history.
   - **Budget:** the period limit, the reserved and settled amounts, the funds available.
8. **Transition.** Until tasks 0mq.9 and 0mq.17, the AI public entry point also exports what the Profile, Matching and Companies use today: configuration, budget and adapters. These exports are marked as transitional, and tasks 0mq.9 and 0mq.17 remove them.
9. **Simplifications** (F4) are described in the AI module description, in the section on the state of implementation, with a reference to the epic `oferty-pracy-sq2`.
10. **Execution settings belong to the client and are kept by AI.** The client owns the settings of its executions; AI stores them, validates them and uses them to build the provider request. The division:
    - **Settings under a key (the client decides):** the provider, the model and the reasoning effort. Nothing else.
    - **AI configuration (AI decides):** the price list per model, the token limits, the endpoints and credentials, the execution mode a provider supports, and provider runtime parameters such as the local context window. These may be fixed in the AI code for now.

    The key is an opaque string in the public contract (`string`, not a closed list of values). AI checks that settings exist for it and that they are complete and valid for the chosen provider and model (e.g. that the model accepts the reasoning effort); otherwise the request is refused with the cause `not_configured`. For now AI holds the settings as a fixed object in its code, one entry per key (`profile`, `matching`, `research`), with the values that today's environment and code produce, so provider requests do not change (E01-AC04). The object is data: no AI code branches on a key value, and the key literals appear in that one file only. A later task moves the settings to a database table changed through an AI operation; that change does not touch the rest of the AI code.

    The variables `AI_PROFILE_PRICING_JSON`, `AI_MATCHING_PRICING_JSON`, `AI_RESEARCH_PRICING_JSON` and `AI_*_EXECUTION_JSON` are removed. Changing a client's provider or model requires changing the code until the settings table exists; the owner accepted this. The rule that Matching on OpenAI must run as a batch is removed from AI; until task 0mq.17 Matching keeps its batch path in its own code. The transitional exports (decision 8) read prices and limits from the same fixed AI configuration.

    Options discarded: a closed list of job types in the public contract (AI would know its clients); an opaque key with settings in the client's own configuration (the owner wants AI to keep and validate the settings, like a bank keeping its clients' accounts); keeping the environment variables (none needed while the settings are fixed in code).

### Verification

| Criterion | Check |
| --- | --- |
| A14-AC01 | Review of the AI public entry point. |
| A14-AC02–AC04 | Integration test according to T-03 with a simulated adapter and a test receiver. AC04: the receiver rejects the result, and the cost is settled; the adapter returns no usage, and the cost stays reserved. |
| A14-AC05 | Tests from the stage 1 SD for E01-AC02–AC04 and existing budget tests. |
| A14-AC09 | Integration test according to T-03: the test receiver throws on the first delivery and accepts on the second. After the first delivery the execution is `delivering`, the result is saved, the cost is reserved and none of the receiver's writes remain; after the second it is `completed`, settled once, and the provider was called once. A receiver that always throws leaves the execution `delivering` after the retries, with the cost reserved. |
| A14-AC10 | Unit or integration test: a batch request and an agent request are refused with `unsupported_mode`, with no reservation and no queued job. |
| A14-AC11 | Review of the migration and the persistence code: new code writes and reads only `state` and `cause`; the transitional columns are listed in the AI module description. |
| A14-AC08 | Unit tests of the settings validation: a missing key, an unknown provider or model, a reasoning effort the model does not accept. A search of the AI module finds the key literals only in the settings file. |
| A14-AC06 | Review of the module description. |
| A14-AC07 | Review of the dependencies of the AI coordination, adapters and public entry point. |
| A14-AC12 | Review of the public entry point and the execution read: state and cause typed by the exported lists, no `runtimeState` or unconfirmed-cost flag; a search outside `modules/ai/infrastructure/adapters/` finds no translation of provider observations; unit tests of each adapter's translation, including `uncertain` for a lost local lease and for a paid request that failed after it was sent (an HTTP or network error, an unreadable response). |
| A14-AC13 | Review of the public type of the check and a search of the requesting modules for reads of its content. |

<a id="a9"></a>

## Task 0mq.9 — Profile through the AI contract

Requirements: [A9](requirements.md#a9). Stage 2: [requirements](../lokalne-ai/etapy/02-profil-adapter/requirements.md), [SD](../lokalne-ai/etapy/02-profil-adapter/solution-design.md).

- **The Profile's integrating layer** lies in the Profile module's adapters. It takes over the existing building of the proposal instruction and schema, and the parsing of the result. It requests an execution of the "profile" type through the AI contract and is the result receiver for this type.
- **Result receiver:**
  - For a result, it calls a Profile operation that checks the text revision and the quotes and saves the proposal in the import data.
  - It tolerates being called again with the same result after a failed delivery (decision 11 from 0mq.14). An exception it throws does not end the proposal preparation; the import stays in the AI-running state until a delivery succeeds.
  - For a final state without a result, it sets the import state with the existing messages, e.g. "przerwano przygotowanie propozycji; koszt pozostaje zarezerwowany" ("proposal preparation interrupted; the cost stays reserved").
- **Execution paths:**
  - The paid path uses the single-mode OpenAI adapter.
  - The local path uses the Ollama adapter, the shared local slot and the existing local execution mechanism; these move to the AI coordination.
  - The existing Profile AI job queue and its handling in the worker move to the AI module.
- **Migration of AI attempt data:**
  - It adds general fields: the operation identifier, the input version and the execution result.
  - It fills them from the existing import, text revision and proposal fields.
  - It replaces the index of one attempt in progress per import with an index of one execution in progress per operation (decision 3 from 0mq.14).
  - It fills `state` and `cause` for the existing rows from `result_status`, `error_code` and `disposition` (decision 12 from 0mq.14). After the migration no code writes or reads those columns; `runtime_state` stays as the observation of the local process.

  The existing Profile-specific fields become optional and are not used by the new code; removing them belongs to the epic `oferty-pracy-sq2`.
- **The import read** shows the state of proposal preparation from the AI execution read.
- **Messages by state and cause (A9-R07).** The Profile domain maps the public state and cause to the owner's message in one table, with no branch on the execution path. Each cause keeps its existing message where that message names no path. An uncertain end (state `uncertain`) shows the message of A9-R07 on both paths. The context the Profile passes today to choose a message (`localRuntime`, `runtimeUnknown`, `costUnknown`) is removed.
- **Public states and the opaque check.** The task carries out decisions 14–16 of 0mq.14: the adapters translate their observations into public states and causes, the execution read gives only public values, and the check before a request is an opaque value.
- **Transitional exports.** The Profile stops using the transitional AI exports from 0mq.14. Removing the exports that no other module uses any more belongs to this task.
- **The AI module description** gets a section on adding an execution path: a new adapter, or a new settings key with its settings and a result receiver. For a new adapter, it says how the adapter implements the shared adapter contract and maps what it observes to the public states and causes (decision 14 of 0mq.14), with the OpenAI and Ollama mappings as examples.
11. **Result delivery is retried, not failed.** When the provider returns a result that matches the schema, AI first saves the result and the usage with the execution, in its own transaction, and sets the state `delivering`. Then it delivers: in one transaction it calls the receiver and saves the settlement (decision 4), and sets the final state from the receiver's decision (`completed` or `rejected`).
    - If the receiver throws, the delivery transaction is rolled back in full: nothing of the client's writes or of the settlement remains, the execution stays `delivering` with the result saved, and the cost stays reserved. AI retries the delivery with the retry policy of the AI execution queue. The provider is not called again.
    - When the retries run out, the execution stays `delivering`. The execution read shows the state, the number of delivery attempts and the last error message. A person has to act; redelivering by hand belongs to the epic `oferty-pracy-sq2` and is listed among the simplifications (decision 9).
    - There is no cause `receiver_error` and no final state for a receiver exception. A receiver must tolerate being called again with the same result; it can, because a failed delivery leaves none of its writes.
    - `delivering` counts as in progress for the rule of one active execution per operation (decision 3).

    Options discarded: ending the execution as failed with the cause `receiver_error` (a paid, correct result would be lost on a transient error, and a bug in the client would look like a model failure); calling the receiver again with a final state without a result after the rollback (no longer needed, because the execution does not fail).
12. **One record of an execution's stage and cause.** The columns `state` and `cause` of the AI executions table are the only record of an execution's stage and of the cause of its end, for every execution requested through the public contract. States: `waiting_budget`, `queued`, `running`, `delivering`, `completed`, `rejected`, `failed`, `retried`.
    - The existing columns `result_status`, `error_code`, `disposition` and `publication_allowed` are transitional. Only the existing local Profile path writes and reads them, until task 0mq.9 moves that path to the AI coordination and migrates its rows to `state` and `cause`. New code does not write or read them. Removing them belongs to the epic `oferty-pracy-sq2`.
    - The column `runtime_state` is not a duplicate and stays: it records what is observed about the process on the local model (running, unknown after a lost lease), a fact separate from the execution's stage. An execution can be `running` while its process is `unknown`.
    - The justification required by the architecture rules (costs of design decisions, a second mechanism for the same thing): the existing columns do not express waiting for budget, the queue, delivery or rejection by the client, and their meaning is tied to the local Profile path. The second record is transitional, ends with task 0mq.9 and is listed among the simplifications (decision 9).

    Options discarded: extending the existing columns with the new values (the stage would be split over three columns with unclear meanings, and the general contract would inherit the local Profile path's model); migrating the local Profile path already in this task (pulls the work of task 0mq.9 into this task).
13. **Unsupported modes are refused at request time.** Today no adapter supports batch or agent work through the public contract, so such requests are refused with `unsupported_mode` before any reservation (decision 5). The refusal follows from the adapters' declared modes, not from a fixed rule in coordination; task 0mq.17 adds the batch and agent adapters, and those modes then start working without changing the request.

    Options discarded: accepting a batch request and ending it as failed in the queue (its reservations would make real requests wait for budget, and the same cause would mean two different things).
14. **Public states and causes, translated by the adapter (A14-R12).** The public entry point exports two closed lists as types: the execution states and the end causes. The public states are those of decision 12 plus `uncertain`: `waiting_budget`, `queued`, `running`, `delivering`, `uncertain`, `completed`, `rejected`, `failed`, `retried`. `uncertain` means that AI cannot tell how the work ended and keeps what it reserved for it (the budget or the shared local slot); a person checks the execution before trying again. The causes are the existing list of end causes.
    - **The adapter decides.** The adapter contract has a step in which the adapter turns what it observed into a public state and cause: a response, an error, the state of a local process. Examples: Ollama turns a lost lease of a running local process into `uncertain`; OpenAI turns an error after the request was sent (HTTP, network, an unreadable response) into `uncertain`. A result that matches the schema but comes without usage is not an end without a result: it is delivered, and its cost stays unknown and reserved (A14-AC04). Coordination saves what the adapter returned and does not branch on provider facts.
    - **The read shows only public values.** The public execution read gives `state` and `cause` typed by the exported lists, and the reserved and settled cost. It does not give `runtimeState` or a flag of an unconfirmed cost; those stay in the AI data as the adapter's and coordination's own records (`runtime_state` stays, decision 12).
    - **The client maps state and cause only.** A requesting module chooses its behaviour from the state and cause alone; a check that compares them with string literals outside the exported types is not allowed.

    Options discarded: exporting `runtimeState` as a typed list (the client would still learn the path and could tell local from paid work); letting coordination translate provider facts (coordination would know every provider's protocol, against A14-R03).
15. **The check before a request returns an opaque value (A14-R13).** `checkExecution` returns a value of an opaque public type. The client keeps it and passes it with the request; only AI reads it (e.g. the local model version an adapter fixes). The public contract shows no provider fields such as `modelDigest`.

    Options discarded: a public type with the provider's fields (the client would hold a provider detail, and later adapters would add theirs to the public contract).
16. **Public operations added for the Profile path in task 0mq.9.** Besides the request, the execution read and the budget read (decision 7), the public entry point has:
    - **Whether a settings key is configured:** for a client's overview of whether it can request work now.
    - **The check before a request:** decision 15.
    - **The execution read by operation:** the operation's latest execution, for a client that shows the state of its own operation.

### Verification

| Criterion | Check |
| --- | --- |
| A9-AC01–AC03 | Integration tests according to T-03 with simulated OpenAI and Ollama adapters, including the existing local profile test. |
| A9-AC04 | Existing profile and profile route tests. |
| A9-AC05 | Tests from the stage 2 SD. |
| A9-AC06 | Search of the Profile code for AI tables and imports of AI internals. |
| A9-AC07 | Review of the AI module description. |
| A9-AC08 | Unit test of the message table: for each public state and cause, the same message whatever the path; `uncertain` gives the message of A9-R07. Search of the Profile code for `runtimeState`, an unconfirmed-cost flag and string literals of states or causes. |

<a id="a11"></a>

## Task 0mq.11 — Profile routes

Requirements: [A11](requirements.md#a11).

- Public Profile operations for routes:
  - the list and details of imports, with the original file and the proposal state;
  - reading versions;
  - applying a proposal: the import identifier, the text revision, the selection of items and the expected draft revision. The result is a new draft or the existing conflict errors.
- Applying a proposal, in one transaction, in order:
  1. reads the proposal and checks the text revision,
  2. validates the result,
  3. saves the draft with a revision check.
- The budget summary in the profile response comes from the public AI budget read.
- The routes translate the request into a command, and the result and errors into the existing responses and codes.

### Verification

Existing profile route tests, including HTTP tests on the running application. Search of the profile routes for database queries.

<a id="a17"></a>

## Task 0mq.17 — Matching and Companies through the AI contract

Requirements: [A17](requirements.md#a17). Stages 3 and 4: [stage 3](../lokalne-ai/etapy/03-oceny-batch/solution-design.md), [stage 4](../lokalne-ai/etapy/04-research-wykonawca/solution-design.md).

Delivered as tasks 0mq.21 ([requirements](requirements.md#a17m)) and 0mq.22 ([requirements](requirements.md#a17c)); see the decisions and the migration below.

- **Single assessments:**
  - The Matching integrating layer builds the assessment instruction and schema as today and requests an execution of the "matching" type in single mode (decision 2).
  - The result receiver validates the assessment (criteria, evidence against the profile version and the ad version) and publishes or rejects it.
  - The existing assessment queue and its handling move to AI.
- **Assessment groups:**
  - A group request reserves the budget of the whole group or nothing, and creates batch items with identifiers equal to the existing `custom_id`.
  - The existing OpenAI Batch client moves to AI as a batch-mode adapter, together with the cycle of sending, polling, collecting and cleaning up batches. Declaring the batch mode in this adapter ends the refusal of batch requests from 0mq.14 (decision 13); the research adapter does the same for agent work.
  - Delivery of each item's result follows decision 11 from 0mq.14: a receiver exception is retried and does not end the item.
  - Results per item reach the receiver independently; a result out of order reaches the right item.
  - An uncertain state after a batch is sent blocks the automatic creation of the next paid batch.
  - The batch diagnostic archive is saved by the adapter. The existing archive table passes to AI ownership without a schema change, and the archive view reads it through a public AI read.
- **Company research:**
  - The existing research provider (web search and synthesis in OpenAI) moves to AI as an agent-mode adapter. It reports the usage and cost of each step separately, so a synthesis error does not reset the search cost to zero.
  - Companies prepare the research goal and are the result receiver: they validate the sources, quotes and coverage, and publish or reject the report. Reusing an existing report and an explicit refresh stay in Companies.
  - The existing research queue moves to AI.
- **Recovery:** a restart with an unknown outcome of paid work does not start a new search or batch; the execution goes into the uncertain state as today.
- **Data and exports:** Matching and Companies keep the link of their records to the execution by identifier (the foreign key is a schema dependency). The transitional AI exports from 0mq.14 are removed.

### Decisions (owner, 2026-11-18)

1. **Split by owning module.** Task 0mq.21 carries the assessments of Matching and the batch adapter; task 0mq.22 carries company research and the agent adapter, and removes the transitional AI exports. Task 0mq.22 depends on 0mq.21 for the adapter state below.

   Options discarded: splitting by time into new work first and removal of the old queues later (it only served work in progress, which decision 3 drops).
2. **Single assessments run in single mode at the single price.** A single or manual assessment is a single-mode execution, not a one-item batch. The owner accepts the higher price (the price list holds a lower output price for batch than for single).

   Options discarded: a one-item batch (keeps the batch price, but a single assessment waits for the batch cycle).
3. **Work in progress at deploy is not carried over.** The system does not yet run in production. The migration does not translate batches, assessments or research that are in progress; whatever is in progress at deploy is ended as interrupted, with its reservation released.

   Options discarded: converting submitted batches into running executions (only needed for paid work in production); waiting before deploy until no work is in progress (an operational step with nothing to protect).
4. **Adapter state lives in AI.** The AI executions table gets an adapter-state column (structured data, readable only by the adapter that wrote it). The batch adapter keeps there the provider batch, its files, the provider status and whether it was cleaned up; the research adapter keeps the step log. Coordination stores the column and does not read it. This follows the architecture rule that interchangeable executors keep their state in the AI module.

   Options discarded: keeping the batch state in Matching's tables written by the AI adapter (AI would write Matching's data, against A17-R03); reusing the attempt identifier columns for executions (changes the meaning of stored data and still loses the history).

<a id="a17-migration"></a>

### Migration of Matching and research data

Task 0mq.21 carries the steps for Matching and the adapter-state column; task 0mq.22 the steps for research. Each follows the pattern of the 0mq.9 migration.

- **Link to the execution.** Assessment requests and research records get an execution identifier referencing the AI executions table. Matching and Companies keep their records and link them by this identifier.
- **History back-fill.** For each existing Matching or research attempt without an execution, the migration creates an execution with the client operation, the result, the usage and the cost of the attempt, and sets `state` and `cause` mapped from the old record's state. The cost stays as settled or reserved on the attempt. After the migration the history views read state and cost through the public AI execution read.
- **Work in progress (decision 3).** Records waiting for budget, queued, being sent, submitted or running end as `retried` with the cause of an interrupted attempt, and their reservations are released. No adapter state is filled in for them.
- **Matching's own state.** The state column of assessment requests keeps only the Matching meaning that the execution state does not express (for example an excluded request); the stage of the AI work is read from the execution. The design of task 0mq.21 maps each existing value to one of the two.
- **Old tables.** Matching's batch and group tables, and the attempt identifier columns, stay as read-only history and are not used by new code. Removing them belongs to the epic `oferty-pracy-sq2`.

### Verification

| Criterion | Check |
| --- | --- |
| A17-AC01 | Existing matching, group, archive, company and research tests. |
| A17-AC02, AC03 | Tests from the SDs of stages 3 and 4. |
| A17-AC04 | Search of the Matching and Companies code for AI tables and imports of AI internals. |
| AM-AC01–AC04 | As A17-AC01, AC02 and AC04 for Matching, plus a migration test that seeds pre-migration assessments and batches and reads the history after the migration. |
| AC-AC01–AC04 | As A17-AC01, AC03 and AC04 for Companies, plus a migration test that seeds pre-migration research and reads the history after the migration. |

<a id="a18"></a>

## Task 0mq.18 — Neutral mechanisms

Requirements: [A18](requirements.md#a18).

- **Transactions.** The existing helper transactions (in Sources, the Profile, and the manual `BEGIN` in Companies) are replaced by the transactional operation from 0mq.13. The transaction boundaries stay the same, and the transaction locks remain.
- **Shared route code** moves to a neutral server utility; Matching, Companies and Sources routes use it instead of the Profile utilities. It covers:
  - UUID validation,
  - the request body limit and parsing,
  - mapping exceptions to response codes,
  - access to the pg-boss client.
- **Removing contact details** from text moves to the shared infrastructure as a pure function, used by the Profile and Matching.
- **Profile data in Matching and Companies.** Matching uses the profile data types exported through the Profile's public entry point and the read from 0mq.10. It does not use the Profile's internal validation schemas; any validation needed for the assessment input belongs to Matching.

### Verification

Search of the imports of the Matching, Companies and Sources modules and their routes for Profile internals and helper transactions. Existing tests from A18-AC03.

<a id="a12"></a>

## Task 0mq.12 — Target directories

Requirements: [A12](requirements.md#a12).

- The task moves into the modules the code left over from earlier tasks, adds the missing public entry points and descriptions, arranges the layers according to the module directory (operations, domain, persistence, adapters, handling of routes, queues and CLI) and adjusts the imports.
- Files that stay outside the modules (T-01) delegate to the public entry points.
- Views that today import module code (e.g. the Polish portal catalogue, the remote-work qualification labels) use the modules' public entry points.
- The task result contains the list of files outside the modules, with the reason.

### Verification

Review of the structure and the imports; full quality checks (W-AC01).
