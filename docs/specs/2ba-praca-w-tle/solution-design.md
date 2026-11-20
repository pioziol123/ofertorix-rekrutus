# Background work — Solution design

Basis: [PRD](PRD.md), [requirements](requirements.md). Investigation of the current code and of pg-boss 12.38.0: [queue behaviour and pg-boss semantics](../../research/kolejki-zachowania-2ba1.md). Binding rules: [architecture rules](../../architecture/moduly-i-zasady-kodu.md).

Section `B<n>` belongs to the Beads task `oferty-pracy-2ba.<n>`. Decision IDs (`B<n>-D..`) are stable. Sections marked *Contract* are agreed constraints; everything else names the mechanism and leaves names, files and paths to the implementer.

<a id="b1"></a>

## B1. Queue and worker libraries (`oferty-pracy-2ba.1`)

Requirements: [B1](requirements.md#b1). Code observed at commit `350bb51`.

### Approach and boundaries

| Part | Owns |
| --- | --- |
| Queue library (shared, in the shared library directory) | The only code that imports pg-boss. Reads and validates the queue configuration; gives the queue migrations the way to create a queue with its failure queue; updates the settings of the existing queues; sends a job in the caller's transaction; hands the worker the next job of any queue the worker takes from (B1-D16); heartbeats, completes, fails and cancels a job attempt. |
| Worker library (shared) | The handler registry (job definition, job handler and failure handler per job definition name), the process pool, the channel to pool processes, the rules for ending a process, the worker's liveness record and stopping. A job of a failure queue is carried out like any job, by the failure handler. |
| Queue configuration | One JSON file in the repository: the operational queue settings per queue name. It does not own the list of queues. |
| Job definition (in a module) | The queue name, the shape of the job's data and the key: none, or a key mode (exclusivity or deduplication) with the rule that gives its value from the data (a field of the data, or a constant). Its key mode must equal the one its queue's migration names (B1-D15). |
| Queue migration | A database migration written once per queue: it creates the queue and its failure queue with the queue name and key mode written in it, and imports no module. The queue migrations own the list of queues (B1-D05). |
| Module plugin (in the plugins directory at the repository root) | Registers the module's job definitions with their job handlers and failure handlers. A plugins index runs every module plugin; only the worker and the pool processes run it. |
| Worker entry | Starts the worker library with the plugins index and the pool size. It knows no module. |
| Pool process entry | Runs the plugins index once, then carries out the jobs the worker passes to it. |
| Web application | A Nitro plugin starts the queue library's connection at server start. It does not run the plugins index. |

In this task no module has a job definition on the libraries. The existing path keeps working (B1-R17): the existing queue creation of the three module queues, the existing pg-boss client of the web server and the existing `work()` registrations and minute cycle in the worker entry. The new worker loop runs in the same worker process beside them and takes every queue in the database except these three (B1-D16).

### Decisions

**B1-D01. Operational queue settings live in an editable JSON file in the repository; the key mode lives in the job definition.**
Reason for the file: the settings are to be changed without changing code. Reason for the key mode (review of 2026-11-20): a module's correctness rests on it (one sync per source), pg-boss cannot change it on an existing queue, so it cannot be changed by editing a file anyway; the investigated queue systems keep uniqueness in the job's code and operational limits in configuration.
Discarded: every setting in the job definition (the owner's first decision, withdrawn because settings are to change without code); the key mode in the file next to the key rule in the definition (the decision before the review): a fixed list with two owners, which needed a check at every send (B1-D04).

**B1-D02. A setting the file does not give takes pg-boss's default.**
Reason: pg-boss has its own defaults.
Discarded: the project's own defaults (60 s time limit, 1 attempt, 0 s delay): withdrawn for the reason above.
Consequence: a queue added with its name only retries a failed job twice (3 attempts) with a 15-minute time limit; work that must not run twice sets 1 attempt.

**B1-D03. One key per job with three modes: none, exclusivity, deduplication.**
Exclusivity maps to the pg-boss queue policy `singleton` (a unique index on active jobs per key), deduplication to the policy `exclusive` (a unique index on waiting or active jobs per key, which also gives exclusivity), none to `standard`. The key value is the job's `singletonKey`.
Reason: modules need two different guarantees, exclusivity and deduplication; pg-boss enforces both with a unique index, so they hold with several workers; the mode cannot change on an existing queue ([ADR 0001](../../adr/0001-klucz-zadania-kolejki-trzy-tryby.md)).
Discarded: a group with a group concurrency of 1: not strict when two workers fetch at the same moment (verified in the fetch SQL; the project's assumption `0mq.16/ASM-3`). Exclusivity kept by the worker: a worker sees only its own jobs.

**B1-D04. Withdrawn by B1-D01 (2026-11-20).**
It compared the definition with the file's key mode at every send. With the key mode in the definition there is nothing to compare.

**B1-D05. Queues are created by queue migrations written once, with the queue name and key mode in the migration; the migration step then applies the file.**
A queue migration, written once when a job definition is added, creates the failure queue, then the queue with that failure queue as its dead letter queue, both with a 30 s heartbeat, with the queue name and key mode written in the migration; it imports no module. After the migrations, the migration step reads the file and updates the settings pg-boss can update (attempts, retry delay and backoff, time limit, retention) of the existing queues; it stops with an error naming the queue when a file entry names no existing queue. The step does not run the plugins index. The three queues of the existing path (B1-R17) are created with their names and settings written in the migration step, not imported from the modules.
Reason: a send is part of the module's transaction and must find its queue; the migration step surely runs before the web application and the worker, and stops the deployment on a configuration error ([ADR 0002](../../adr/0002-kolejki-zakladane-przy-migracji.md)). A queue migration does not depend on domain code, so a later change of a module cannot change or break it (owner, 2026-11-20; a good practice for migrations in general, not a rule: [architecture rules](../../architecture/moduly-i-zasady-kodu.md#costs-of-design-decisions), cost 7). Carrying unfinished work over at deployment in B4–B6 still calls module operations from the migration step, because it needs the modules' rules.
Discarded: creating a queue at its first send: a schema change while a request is handled, a race of two first sends, and a configuration error found only in the running application. Also discarded: the migration step runs the plugins index to collect the job definitions and stops on a key mode change (the design before 2026-11-20, taken by the first attempt as assumption `oferty-pracy-2ba.1/ASM-1`): the migration depended on the modules' code.
Consequence: the key mode is written twice, in the queue migration and in the job definition, which is a second owner of the same fact (architecture rules, costs); B1-D15 keeps the two equal.

**B1-D06. One worker takes from every queue of the job definitions, in turn.**
Reason: one installation with one user; the pool size sets the load, and a list of queues per worker at start can be added later.
Discarded: a worker per module: more services to run with no gain at this scale.

**B1-D07. A fixed pool, its size set at start, default 2, no limit per queue.**
Reason: no pool computed from other settings; "do not complicate".
Discarded: pool size as the sum of per-queue limits (the owner wants no computed pool); per-queue limits of jobs at once ("do not complicate").
Consequence: one kind of job can fill the pool, e.g. syncs delaying a CV reading. "One at a time in the whole system" is expressed by exclusivity with a constant key.

**B1-D08. Liveness numbers: the process reports every 5 s and is ended after 15 s of silence; the job heartbeat goes to the queue every 10 s; the process is ended after 25 s without a confirmed heartbeat; every queue has a 30 s job heartbeat.**
Reason for every queue: the worker relies on the heartbeat to end the process.
Discarded: a heartbeat only for the sync queue, as today.
Consequence: a lost CV reading or AI assignment attempt is retried after about 30–90 s instead of after its time limit.

**B1-D09. The job handler gets only the job's data; the worker ends the process without a stop signal.**
Reason: the worker is simply to end the process; the job carries only the module's data.
Discarded: a stop signal to the handler; the job id and attempt number passed to the handler.

**B1-D10. Every queue has a failure queue (pg-boss dead letter queue); its jobs call the module's failure handler from the worker's registry.**
pg-boss inserts a copy of the job with its data into the queue's dead letter queue whenever the job fails finally, on every path: a failure the worker records, a timeout and a lost heartbeat found by the supervisor (verified in pg-boss 12.38 code, `failJobsBody` shared by the three paths). The failure queue is named after its queue with a fixed suffix, has key mode none, pg-boss's defaults for attempts and time limit, and is set at the queue's creation, because pg-boss cannot add it later.
Reason (review of 2026-11-20): it covers the worker that died in the last attempt, so no module's work stays in progress, with no periodic check; a failing failure handler is retried.
Discarded: the worker calls the failure handler after a failure it recorded itself (the decision before the review): work stayed in progress when the worker died in the last attempt (collection task `oferty-pracy-sz5` item 20). Also discarded: the failure handler in the job definition (senders would load handling code); a periodic scan of failed jobs (a second mechanism).

**B1-D11. A job without a registered handler is taken, cancelled and logged.**
Reason: the worker learns which jobs it handles only from the registry; handling jobs is not the queue's responsibility. Because the worker takes every queue in the database (B1-D16), such a job is taken and reaches the log instead of waiting unnoticed until pg-boss deletes it (owner's points 8 and 11).
Discarded: a check of handlers at worker start; validation of job data by the queue library.

**B1-D12. Module plugins in a plugins directory at the repository root, run by the worker and the pool processes.**
Reason: the web application is not to load handling code.
Discarded: one assembly that also runs in the web application (the owner: it is not to load it); Nitro's server plugins directory: Nitro loads each file there by itself, so plugins would run twice (verified).

**B1-D13. The worker's liveness record is written by the worker library's loop.**
Reason: a hung loop then stops writing it and the container restarts the worker.
Discarded: writing it in the worker entry (it only shows that the process exists); removing it (a hung worker would go unnoticed).

**B1-D14. Two ways to the queue coexist until the AI module is moved.**
Reason: the epic is released as a whole.
Consequence: a second mechanism for the same thing (architecture rules, costs), accepted as transitional; task `oferty-pracy-2ba.6` removes the old one.

**B1-D15. An automated test keeps each job definition's key mode equal to its queue's.**
The test applies the migrations to a database, runs the plugins index and, for every registered job definition, compares its key mode with the policy of its queue; it fails naming the queue on a difference and when the queue does not exist (B1-R18).
Reason: the migration step no longer sees the definitions (B1-D05), and the worker checks nothing at start (owner's point 7); a test finds the difference before release.
Discarded: a check at worker start (against point 7); a check in the migration step (it would need the modules' code).

**B1-D16. The worker takes from every queue in the database except the queues of the existing path.**
At start the worker reads the list of queues in the pg-boss schema, failure queues included, and leaves out the three queues of the existing path (a fixed list in the worker library, transitional per B1-D14; each module task removes its queue from it). A queue added later is taken after the worker's next start, which every deployment does. Reading the list checks nothing (owner's point 7).
Reason: a job without a handler must be taken to be cancelled and logged (B1-D11).
Discarded: taking only the queues of registered job definitions (assumption `oferty-pracy-2ba.1/ASM-2` of the first attempt): a job without a handler was never taken and pg-boss deleted it silently after the waiting retention.

### Confirmed assumptions

Owner's decision of 2026-11-20 on the assumptions of the first attempt:

- `oferty-pracy-2ba.1/ASM-1` (the migration step runs the module plugins): reversed by B1-D05.
- `oferty-pracy-2ba.1/ASM-2` (the worker takes only the queues of registered job definitions): reversed by B1-D16.
- `oferty-pracy-2ba.1/ASM-3` confirmed: when a newer attempt has taken a job over, the old attempt's failure reason goes only to the worker's log, not onto the job, so the newer attempt's state is not overwritten.
- `oferty-pracy-2ba.1/ASM-4` confirmed: a pool process that exits by itself fails its attempt with the reason `exited` and is replaced, like any failed attempt.

### Contract: queue configuration

A JSON object with one entry per queue, keyed by the queue name. Every field except the name is optional.

| Field | Meaning | Allowed | Absent |
| --- | --- | --- | --- |
| attempts | Highest number of attempts, the first one included | integer ≥ 1 | pg-boss default (3) |
| retryDelaySeconds | Delay before a retry | integer ≥ 0 | pg-boss default (0) |
| retryBackoff | The delay grows with each retry | boolean | false |
| timeLimitSeconds | Time limit of one attempt | integer 1–86400 | pg-boss default (900) |
| waitingRetentionSeconds | How long a job may wait to be taken before it is deleted | integer ≥ 1 | pg-boss default (14 days) |
| finishedRetentionSeconds | How long a finished job is kept | integer ≥ 0 | pg-boss default (7 days) |

`attempts` maps to `retryLimit = attempts − 1`. Unknown fields are an error, and so is an entry whose name is not an existing queue. The file has no entries for failure queues. The file is read and validated once per process start (B1-R04).

### Contract: job definition and send

- A definition carries the queue name, the data's shape (a type) and the key: none, or a key mode (`exclusivity` or `deduplication`) with its rule, a named field of the data or a constant string.
- Send takes a definition and data, runs inside the caller's transaction through the shared `db` adapter of the queue (as today) and returns `created` or, only in deduplication mode, `duplicate` when pg-boss inserted nothing. Any other case throws, which rolls back the caller's transaction: a missing queue, or no row inserted outside deduplication mode.
- The queue library never validates the data's content (B1-D11).

### Contract: worker, registry and pool processes

- The registry maps a job definition name to the definition, a job handler and an optional failure handler. A second registration of the same name throws at plugin run.
- The worker loop: while a pool process is free and the worker is not stopping, ask the queue library for the next job, starting each time at the next queue of the list read at start (B1-D16); pass the job to a free process.
- Messages between the worker and a pool process: run (definition name, data), alive (every 5 s while a job runs), done, failed (error message). The process runs one job at a time and is reused. A process that exits or is ended is replaced by a new one.
- While a job runs, the worker sends a heartbeat for the attempt every 10 s, fenced to the attempt (pg-boss `touch` with the job id and retry count); a fenced heartbeat that touches no row means the job no longer belongs to the attempt.
- The worker ends the process (B1-R09) and fails the attempt with a reason: `silent`, `time-limit`, `taken-over` or `unconfirmed`. A handler's error fails it with the error's message. pg-boss's own expiry and heartbeat supervision stay on as a safety net.
- A job of a failure queue runs in a pool process like any job: the worker calls the failure handler registered for the source definition with the copy's data, and completes the copy without effect when there is none (B1-R11). A failure handler's error fails the copy's attempt like a job handler's error.
- A job whose definition name has no handler is cancelled through pg-boss `cancel` and logged (B1-R12).
- Liveness: the worker loop upserts its row in the existing service heartbeat table every 10 s; the existing container health check (record newer than 30 s) stays.
- Fatal: a pg-boss `error` event, a failed liveness write and a pool process that fails while running the plugins index end the worker with exit code 1 and a message naming the module whose plugin failed.
- Stop: on SIGTERM or SIGINT stop fetching, wait up to 30 s, end the remaining processes and fail their attempts with reason `shutdown`, stop pg-boss, close the database pool.
- Pool size: an environment variable read at worker start; absent means 2; set in the container configuration of the worker.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Send | Same key at once: pg-boss's unique index lets one in (B1-R06) | Database unavailable: throws, caller rolls back | Mode none: a new job; deduplication: `duplicate`; exclusivity: a new job that waits | Missing queue or key mismatch: throws (B1-R05); data not validated (B1-D11) |
| Migration step | pg-boss serialises queue creation with its own lock | Database unavailable: the step fails | A queue migration runs once; applying the file again updates settings | Invalid file: stops (B1-R04); entry naming no existing queue: stops (B1-D05); key mode difference: found by the test (B1-D15) |
| Take and run a job | Two workers: pg-boss claims a job once; exclusivity per B1-D03 | Pool full: no fetch; time limit: process ended (B1-R09) | A retried attempt runs the handler again; handlers must tolerate it | No handler: cancelled (B1-R12); data shape is the handler's concern |
| Failure handler | One copy per final failure, carried out like any job | Its error fails the copy's attempt and is retried (B1-R11) | A retried copy calls it again; failure handlers must tolerate it | — |

### Change and release

- Remove the system check job: its command, queue creation, worker handler, its test, the setup test's use of it and its README lines; a database migration drops the confirmation table; the migration step deletes the `system-smoke` queue; the readiness check queries the database and checks that the newest migration is recorded as applied (B1-R16). Update the sentence about the existing system check in the solution design of the first version's fetching feature.
- The test that pins the contents of the shared library directory is updated for the new libraries.
- Jobs waiting in queues at deployment are not migrated (owner's decision); this task changes no module queue.

### Verification

Integration tests on an isolated pg-boss schema with a test configuration file and test plugins cover B1-AC01–AC13, B1-AC15 and B1-AC16. B1-AC12 uses a queue created in the database with no registered handler and a worker that reads its list of queues as in production, not a job source given extra queues. Ending a process (B1-AC09) uses test handlers that block reporting, that outlast a short time limit, whose job is given to another attempt by failing it in the database, and a queue stub that never confirms. The lost worker (B1-AC10) kills a worker process during a job and observes the retry, and during a last attempt and observes the failure handler. B1-AC14 is checked by a test of the liveness record and of the fatal paths, and by inspection of the container health check.

<a id="b4"></a>

## B4. Profile module on the libraries (`oferty-pracy-2ba.4`)

Requirements: [B4](requirements.md#b4). Builds on [B1](#b1). Code observed at commit `350bb51`.

### Approach

- The Profile module defines one job definition for reading a CV's text: a new queue name, data `{ importId }`, key rule: a constant. Its module plugin registers the reading handler and the failure handler.
- The job definition has key mode exclusivity. The queue configuration gives the new queue `attempts` 2 and `timeLimitSeconds` 120; the rest takes pg-boss's defaults.
- Accepting a file sends the job through the queue library inside the same transaction that marks the import queued (B4-R01). The operation no longer takes a pg-boss client, and the web route no longer passes one.
- The worker entry stops registering the existing reading queue and stops calling the stalled-import recovery at start and in the minute cycle; the recovery operation and its stalled-import queries are removed (B4-R06).
- **Deployment (B4-R08).** While the existing queue `profile-parse` still exists, the migration step calls a Profile operation that sends one job in the new way for every import that is queued or extracting; it then deletes that queue with its jobs. The existing queue creation no longer creates it.

### Decisions

**B4-D01. Two attempts, then the failure handler asks for pasted text.**
Reason: a process lost while reading is usually a worker that died, not a bad file; one retry reads the CV without asking the owner for pasted text, and reading is short and costs nothing.
Discarded: one attempt, with the failure handler asking for pasted text right after a lost process: the owner would be asked to paste text for a CV that could have been read.

**B4-D02. A new queue under a new name; the existing queue is deleted at the migration step with its waiting jobs.**
Reason: the key mode changes to exclusivity.
Discarded: changing the existing queue: pg-boss cannot change a queue's policy after creation (verified).
Consequence: unfinished imports are carried over to the new queue at the migration step (B4-R08).

### Contract: reading handler and failure handler

- **Reading handler.** Moves the import from queued or extracting to extracting in one conditional write; when no row matches, it returns without effect (B4-R04). It then checks the original against its stored hash: missing or mismatched gives `source_missing` with the message of B4-R03. Otherwise it runs the existing extraction child process (30 s, 256 MB, 1 MB output) and saves the text as `ready`, or `needs_text` with the message of B4-R02, each only while the import is still extracting.
- **Failure handler.** Called through the failure queue after every final failure, also when the worker died in the last attempt (B1-D10). Sets `needs_text` with the message of B4-R02 only when the import is queued or extracting; it is a conditional write, so a repeat has no further effect.
- Exclusivity with a constant key guarantees that a handler finding the import extracting runs after the previous attempt ended (B1-D03), so taking it over cannot overlap another reading.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Accept a file | Each upload is its own import | Storage or queue failure: import failed (B4-R01) | A second upload is a new import | Not PDF/DOCX or over 10 MB: refused by the route as today |
| Read | Excluded by exclusivity | 30 s, 256 MB, 1 MB: `needs_text` (B4-R02); attempt time limit 2 min: failed attempt | Takes over `extracting`; other states: no effect (B4-R04) | Unknown import id: no row, no effect |
| Failure handler | Conditional write | — | No further effect | Import in another state: no change |

### Verification

Integration tests on a real database, with the worker library from B1 and the module plugin, cover B4-AC01–AC05, B4-AC07 and B4-AC08: valid files, files without text, an over-long text, a reading that outlasts its limit, a removed and a changed original, two imports requested at once, an import left extracting, both attempts failing, a worker killed in the last attempt, and the carry-over on imports in every state. The existing profile tests that pass a pg-boss client to the import and recovery operations are adapted. B4-AC06 is a review of the worker entry and the module.

<a id="b5"></a>

## B5. Sources module on the libraries (`oferty-pracy-2ba.5`)

Requirements: [B5](requirements.md#b5). Builds on [B1](#b1). Code observed at commit `350bb51`.

### Approach

- The Sources module defines one job definition for carrying out a sync: a new queue name, data `{ runId, source }`, key mode exclusivity with the field `source`. Its module plugin registers the sync handler and the failure handler.
- The queue configuration gives the new queue `attempts` 3 and `timeLimitSeconds` 3600; the rest takes pg-boss's defaults.
- **Request (B5-R01, B5-R02).** One transaction does all of this:
  1. It takes the existing transaction-scoped advisory lock of the source, the one the current start uses for the source's turn.
  2. It looks for a waiting or running sync of any scope of the source. When it finds one, it returns its identifier as existing.
  3. Otherwise it upserts the scope, inserts a waiting sync and sends the job through the queue library.

  The existing per-scope partial unique indexes stay; under the lock they never conflict. The error for a blocking sync that finished during the request goes away.
- **Sync handler (B5-R03, B5-R04).** It moves the sync from waiting or running to running in one conditional write; when no row matches, it returns without effect. A sync found running is taken over: exclusivity by source guarantees the previous attempt has ended (B1-D03). It then runs the existing execution, which keeps the ads saved before. Each batch save and the finish are conditional on the sync still running, which replaces the attempt-number fencing. The execution gets no abort signal; the worker ends the process instead (B1-R09).
- **Failure handler (B5-R05).** Called through the failure queue after every final failure, also when the worker died in the last attempt (B1-D10). It finishes a waiting or running sync, as partial when its count of unique saved ads is above zero and as failed otherwise, with the message of B5-R05. It is a conditional write.
- **Removed:**
  - the start that waits for the source's turn by asking the queue about other syncs' jobs;
  - the recovery of unfinished syncs and the job lookup it uses;
  - the module's own pg-boss client and its connect operation, called by the web application and the command-line scripts;
  - the worker entry's registration of the existing sync queue.
- **Daily request (B5-R07).** The existing scheduled request operation, with its occurrence lock and query, stays and requests each sync through the request above; the worker's minute cycle keeps calling it until B6 moves it to the periodic process. The recovery call before it in the cycle goes away.
- **Fields kept.** A sync still records its trigger and schedule day.

### Decisions

**B5-D01. Three attempts; an attempt that finds the sync running takes it over.**
Reason (review of 2026-11-20): with exclusivity by source the take-over is one condition in the handler, and the failure queue (B1-D10) ends a sync whose last attempt was lost; a deployment or a lost worker no longer ends a sync.
Discarded: one attempt, with a failed or lost attempt ending the sync (the decision of the earlier round, made to narrow the scope). Consequence kept from it: `oferty-pracy-2ba.3` (the Sources' own guard against a stale attempt) is not needed, because exclusivity replaces it.

**B5-D02. The sync queue uses exclusivity keyed by source, not deduplication.**
Reason: the module already allows one unfinished sync per source. Between the moment a sync finishes and the moment the worker completes its job, a new request creates a sync whose job deduplication would reject. With exclusivity, that job waits until the old one is completed.
Discarded: deduplication keyed by source (point 6 in the notes of `oferty-pracy-2ba.1`): it would reject the job in that window.

**B5-D03. A new queue under a new name; the existing sync queue is deleted at the migration step with its waiting jobs.**
Reason: the key mode changes.
Discarded: changing the existing queue: pg-boss cannot change a queue's policy after creation (verified for B4-D02).

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Request | Serialised by the source's lock; one sync per source (B5-R02) | Database unavailable: throws, nothing created | Returns the existing sync | Unknown or disabled source, invalid settings: error, nothing created (B5-R01) |
| Carry out | Excluded per source by exclusivity | Pool full: the job waits; time limit 1 h: process ended, next attempt takes over | A running sync is taken over; a finished one: no effect | Unknown sync id: no row, no effect |
| Failure handler | Conditional write | — | No further effect | Finished sync: no change |
| Carry-over | Runs in the migration step with the old worker stopped | — | Runs only while the old queue exists | — |
| Daily request | Occurrence lock as today | — | One request per occurrence | — |

### Change and release

- A database migration drops the queue job and attempt columns of syncs.
- **Deployment (B5-R08).** While the existing queue `source-sync` still exists, the migration step calls a Sources operation that sends one job in the new way for every waiting or running sync; it then deletes that queue with its jobs. The existing queue creation no longer creates it.
- The module's README is updated: queue operations and recovery are gone, and the daily request is called by the worker's cycle and later by the periodic process. So are the module map's lines about them.
- The command-line scripts of each source no longer create a pg-boss client.

### Verification

Integration tests on a real database, using the worker library from B1, the module plugin and a test connector, cover B5-AC01–AC07. They exercise:

- requests to a source with a waiting sync and with a running sync, for the same and for another scope;
- concurrent requests;
- two sources at once;
- a complete sync and a connector error;
- a sync ended during carrying out;
- a sync taken over by a later attempt;
- a last attempt that throws, one that outlasts a short time limit, and a worker killed during it;
- the daily request for scheduled sources, a source with an unfinished sync and a repeated occurrence;
- the carry-over on syncs in every state.

The existing tests of the turn wait, recovery and attempt fencing are removed or rewritten for the rules above; the tests of scheduled requests are adapted to the new request. B5-AC06 is also a review of the module, and B5-AC08 a review of the module, the worker entry, the web application and the scripts.

<a id="b6"></a>

## B6. AI module on the libraries, old path removed (`oferty-pracy-2ba.6`)

Requirements: [B6](requirements.md#b6). Builds on [B1](#b1) and [B5](#b5). Code observed at commit `350bb51`.

### Approach

- **Job definitions and queues (B6-R02, B6-R04).** The AI module defines two job definitions with the same data `{ executionId }` and the same handler and failure handler, registered by its module plugin: one for paid work and one for the local model. Each has key mode exclusivity with a constant key. The queue configuration gives both new queues `attempts` 4, `retryDelaySeconds` 30, `retryBackoff` true and `timeLimitSeconds` 3600. When it sends a job, the module picks the definition by the adapter's shared-slot flag. Every send runs in the caller's transaction (B1).
- **Claim (B6-R02).** The handler moves a queued execution to running in one conditional write, for paid and local work alike. Paid work takes no lease; local work takes no slot and joins no local waiting line. Exclusivity in the queue replaces both.
- **Found running (B6-R05).** When the handler finds its execution already running (single or agent mode), it saves the end `uncertain` with the cause `unknown` and the settlement of a lost run (reservation kept, nothing charged beyond what was saved), then sends the delivery job; it calls no provider. For a batch group, a handler run that claims no item and finds the group running with an adapter state that is still sending ends every running item the same way; a group already sent is left to the periodic process.
- **Saves (B6-R06).** Saving an outcome, an adapter state or a retry is a conditional write on the execution still running, which replaces the lease-holder guard. A paid run keeps the raw responses it received in memory as today; when its save matches nothing, it writes them to the execution's archive and ends without effect.
- **Carrying out (B6-R03).** The provider call, the one retry of a transient error after the provider's wait (inside the handler), the delivery to the receiver and its rollback on a receiver error are kept. A delivery error throws, so the queue retries the job up to its 4 attempts; the execution then stays delivering.
- **Failure handler (B6-R07).** Called through the failure queue after every final failure, also when the worker died in the last attempt (B1-D10). It ends a queued or running execution as `uncertain` with the cause `unknown`, keeping the reservation, and sends the delivery job; a delivering execution is left as it is. It is a conditional write.
- **Local model archive.** The raw response of the local model is always kept in the execution's archive, now through the general archive write instead of the slot's request record.
- **Periodic process (B6-R09).** A separate entry point started as its own container service. It loads the queue library, then repeats a pass: each step runs in its own try/catch that logs the error, and the next pass is scheduled with `setTimeout` 60 s after the pass ends. The steps call public operations by name:
  1. AI: fund executions waiting for budget, a group as a whole, sending their jobs;
  2. AI: advance every sent batch group (poll, collect, save outcomes and send their delivery jobs), skipping groups still being sent;
  3. AI: clean up ended batch groups that still need it at the provider;
  4. Profile: resume the preparation of profile proposals;
  5. Sources: the daily request of syncs (B5-R07).

  The process has no health check; the container restarts it when it exits. The worker keeps no timer apart from its liveness record (B1).
- **Removed (B6-R08, B6-R11):**
  - the AI module's own pg-boss client, its connect operation and its resend with a 60-second singleton;
  - the recovery of the AI module: the lapsed local lease observation, the end of interrupted paid work, the resending of queued jobs and of batch polling jobs;
  - the local slot: its waiting line, claim, lease renewal, request authorisation and wake-up of waiting executions;
  - the paid execution lease and its renewal;
  - the shared pg-boss client file, the existing queue creation script, the web application's lazy queue client and the worker entry's old queue registrations and minute cycle.

### Decisions

**B6-D01. Two AI queues with exclusivity on a constant key.**
Reason: one paid job and one local job at a time in the whole system come from the queue (points 18 and 22 in the notes of `oferty-pracy-2ba.1`).
Discarded: one AI queue with the module's own local slot and lease (today). The owner removed them in point 22 and accepted that a killed local run may still be computing when the next one starts.

**B6-D02. An interrupted or failed execution ends as `uncertain` with the cause `unknown`.**
Reason: the delivery contract gives the requesting module a cause from the closed list, and today's delivery already turns an empty cause into `unknown`; the AI module does not deduce that the process was interrupted (point 14). The cause `interrupted` stays in the list for executions in history.
Discarded: an empty cause saved with the execution. The delivery would still report `unknown`, so the saved state and the delivered end would differ.

**B6-D03. The periodic process advances sent batches itself; no job is sent per batch.**
Reason: with one paid job at a time, a polling job sent every minute would pile up behind a long company research.
Discarded: a polling job per sent batch every pass (today's resend). The reason is the same.

**B6-D04. Unfinished executions are carried over by the migration step while the old AI queue still exists; the step then deletes it.**
Reason: the requesting modules learn of an end only through delivery, so ending executions in the database would leave assessments, profile proposals and company research in progress; tying the carry-over to the old queue's existence runs it once without a marker.
Discarded: ending the executions in a database migration, as for syncs (B5-R08). The reason is the same.

### Contract: periodic process

- One process, one pass at a time; a pass runs the steps in the order above.
- A step's error is logged with the step's name and does not stop the pass or the process.
- An error starting the process (database or queue library unavailable) ends it with exit code 1.
- Stop: on SIGTERM or SIGINT, no new pass is scheduled; the process waits for the running pass, then closes the queue library and the database pool.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Request | Each execution sends its own job in the caller's transaction | Database unavailable: throws, nothing saved | A new execution per request, as today | Missing or invalid settings: refused as today (A14-AC08) |
| Carry out | One job per queue at a time (exclusivity) | Time limit 60 min: process ended, next attempt finds it running (B6-R05) | A job for an execution no longer queued or running: delivery if delivering, otherwise no effect | Unknown execution: no row, no effect |
| Failure handler | Conditional write | — | No further effect | Ended execution: no change |
| Periodic pass | Passes never overlap; a sent batch is advanced only here | A slow step delays the next pass | Funding and cleanup are conditional writes | A step error is logged |
| Carry-over | Runs in the migration step with the old worker stopped | — | Runs only while the old queue exists | — |

### Change and release

- A database migration drops the local slot, the local waiting line and the runtime request tables, and the lease and runtime state columns of executions, after the carry-over has no use for them.
- The migration step creates the two new AI queues, carries over unfinished executions (B6-R10), and deletes the queue `ai-execution` with its jobs.
- The container configuration gets the periodic process service; the worker's container no longer runs periodic work.
- The AI module's README drops the queue, recovery, local slot and lease sections and lists the simplifications; the module map and the architecture overview name the periodic process. The glossary's assembly entry no longer mentions periodic operations registered by modules.
- Tests that create their own pg-boss client move to the queue library's test helpers.

### Verification

Integration tests on a real database, using the worker library from B1, the AI module plugin and simulated providers (single, agent, batch and local), cover B6-AC01–AC03, B6-AC05–AC07 and B6-AC09. They exercise:

- assessments, profile proposals and company research through to delivery, and rollback of the requesting operation;
- two paid and two local executions, and a paid with a local one, at pool size 2;
- a transient error, a receiver failing once and always;
- a handler that finds its execution running, per mode, including a batch being sent and one already sent;
- a save after the execution ended, with its raw response archived;
- the failure handler on every in-progress state, and a worker killed during the last attempt;
- a pass of the periodic process with a failing step;
- the carry-over on executions in every state.

The existing tests of leases, the local slot, recovery and resending are removed or rewritten for the rules above. B6-AC04, B6-AC08 and B6-AC10 are a review of the queue configuration, the AI module, the worker entry, the periodic process, the web application and the scripts.
