# Queues: how the system uses pg-boss, how Laravel shapes the same layer, and the alternatives

Sources as of: **2026-11-19**. This investigation answers one question for the owner and for agents preparing work on background processing: should the system replace pg-boss, and what would make the queue layer easier to understand? It reads the code on `main` at commit `2946116` and the public documentation of Laravel and of several Node.js libraries. The main finding: the disorder lies in the code written around pg-boss, so replacing the library with a similar one would not remove it. Laravel's layout of this layer is the more useful model, and a check of two libraries that already offer that layout (pg-boss-registry and Graphile Worker) favours a thin layer of the project's own over pg-boss. Findings describe the state at that date; this document is material for decisions and changes nothing by itself.

The terms **queue**, **queue job** and **worker** are used as the glossary defines them. "Work" means the thing the owner sees: a sync run, a match assessment, an employer research, a CV import, an AI execution.

## How the system uses queues today

Every piece of background work has two records, created in one transaction:

- **The work record** in an application table, with its own status. It is the truth about the work and what the owner sees.
- **The queue job** in pg-boss, which stores its queues in the same PostgreSQL database. It carries only the id of the work.

The worker takes a queue job, reads the work record, changes its status from waiting to running only if it is still waiting, does the work and saves the result. One worker process serves all seven queues ([worker/index.ts](../../worker/index.ts)). Every minute the same process runs recovery for each area and requests scheduled syncs.

| Queue | Work | Who decides about a retry |
| --- | --- | --- |
| `source-sync` | ad sync, one queue for every portal | pg-boss: up to 2 retries of the same run |
| `profile-parse` | text extraction from a CV | recovery, after 3 minutes without movement |
| `offer-matching`, `offer-matching-group` | match assessment, single and group | recovery: a new queue job every minute |
| `company-research` | employer research | recovery |
| `ai-execution` | work handed to the AI module | the AI module: a retry is a new execution |
| `system-smoke` | check that the queue works | none |

### What makes it hard to follow

1. **Queue settings are set in three places.** The time limit and retry count are given when the queue is created ([scripts/init-queue.ts](../../scripts/init-queue.ts)) and again at every send; the number of jobs at once is given where the worker registers. The Sources and AI modules keep their values in one constant of their own. The older code under `lib/` repeats literal values in two files.
2. **Six versions of recovery.** Each area wrote its own answer to "what if the queue job or the worker is lost". The older code sets `retryLimit: 0` and rebuilds retries by sending a job every minute. The reason retries were switched off was not investigated; avoiding a second paid AI call is a plausible one.
3. **Three ways of waiting for a resource.** One sync per portal at a time uses pg-boss groups plus a database lock ([start-in-source-turn.ts](../../modules/sources/start-in-source-turn.ts)). The single place on the local model uses its own queue in application tables ([local-slot.ts](../../modules/ai/infrastructure/persistence/local-slot.ts)). Work waiting for budget has no queue job at all until recovery finds the money.
4. **The word `queued` means three things:** a status of the work in five tables, a state of a pg-boss job, and a state of a row in the local model's own queue.
5. **The worker file knows every area by name.** Adding background work means changing three places in it and the queue creation script. It holds no rules of any work; the disorder is in how the parts are wired.
6. **Sync recovery reads the queue to decide about the work.** It asks pg-boss for the job's state and finishes the run on that basis ([recover-sync-runs.ts](../../modules/sources/recover-sync-runs.ts)).

### Change on the same day

While this investigation was under way, 33 commits of task `oferty-pracy-0mq.12` and its neighbours reached `main` (head `478aa4a`). The description above is true for commit `2946116` only. At `478aa4a`:

- there are four queues: `source-sync`, `profile-parse`, `ai-execution` and `system-smoke`. Match assessments and employer research no longer have queues of their own; they are handed to the AI module and travel through `ai-execution`;
- the code under `lib/matching`, `lib/companies`, `lib/profile` and `lib/sources` moved into modules, and Profile has its own queue file like Sources and AI;
- the minute cycle makes five calls instead of eight: sync recovery, scheduled syncs, CV import recovery, resuming proposal preparations and AI recovery;
- points 1, 3, 4, 5 and 6 above still hold. Point 2 now counts three versions of recovery, and the AI one also polls provider batches.

## What pg-boss already provides

Read from the project's page for version 12 (the project pins 12.38.0):

- polling workers through `work()`, which the system uses;
- automatic retries with exponential backoff;
- dead letter queues with redrive, i.e. one place for failed jobs from which they can be sent again;
- cron scheduling and deferred jobs;
- queue policies for concurrency;
- a command-line tool for database migrations;
- a separate dashboard package, `@pg-boss/dashboard`, for jobs, queues and schedules.

pg-boss has no ready-made worker process that discovers handlers; every project writes the file that calls `work()`. The system does not use the dead letter queue, the cron scheduling or the dashboard.

## How Laravel shapes the same layer

In Laravel each piece of background work is one class, and that class holds what the system spreads over several files.

| Laravel | What it gives | The system's counterpart today |
| --- | --- | --- |
| Job class with a `handle` method | the code that does the work, in one place | a module function plus a loop in the worker file |
| `Tries`, `Timeout`, `RetryFor` on the class | settings belong to the work | queue creation script, each send, worker registration |
| `ShouldBeUnique` | the same work is not queued twice | an index: one waiting run per scope |
| `WithoutOverlapping` middleware | one job at a time per key | portal turn and local model slot, each written separately |
| `RateLimited` middleware | a limit of jobs over time | none; executor capacity is planned |
| `afterCommit` | the job is sent after the transaction commits | the job is sent inside the transaction, a stronger guarantee |
| `Bus::chain`, `Bus::batch` | jobs in sequence, or a group with a shared end | the matching group, written by hand |
| `queue:work` | one generic worker that knows no job by name | `worker/index.ts`, which knows them all |
| `failed_jobs` table, `queue:retry` | one place for failed work and its retry | six versions of recovery |
| Horizon | a dashboard of queues and workers (Redis only) | none |

The difference in approach matters more than any single feature: in Laravel settings belong to the work, and a queue is only a named line the work is routed to. In the system settings are attached to the queue, which is why "who owns them" has no clear answer.

Laravel does not solve work that waits hours for an external result (an OpenAI batch), waiting for budget, or an outcome that cannot be established. Those belong to the next group of tools.

## Alternatives for Node.js and PostgreSQL

### Plain queues, the same level as pg-boss

| Tool | What it is | Relevant to the system |
| --- | --- | --- |
| Graphile Worker | A PostgreSQL queue with a standalone and an embedded worker mode, crontab-like schedules, a `job_key` against duplicates and retries with backoff (25 attempts over about three days by default). Jobs in the same named queue run in series. | Closer to Laravel in having a ready worker process. No dashboard was found in its introduction. |
| Sidequest.js | Job classes, a built-in dashboard, storage in the existing database (PostgreSQL, MySQL, SQLite, MongoDB). | Closest to Laravel's style. Needs Node.js 22.6 or later, LGPL-3.0 licence, a young project from 2025. |
| BullMQ | The most widely used Node.js queue. | Needs Redis: a new piece of infrastructure, and the queue job can no longer be sent in the transaction that saves the work record. |

### Durable workflows, one level up

These tools let work be written as a sequence of steps. The tool records which step succeeded and resumes from the next one after a failure. That is what recovery and the matching state machine do by hand today.

| Tool | What it is | Relevant to the system |
| --- | --- | --- |
| DBOS Transact | A library that runs inside the application process and needs only PostgreSQL. Workflows made of steps, resumed from the last completed step after a crash; queues; `DBOS.sleep`. | Fits the infrastructure. Its console needs an account with the vendor's service and an enterprise package. |
| Trigger.dev, Hatchet | A separate service next to the application, with a dashboard. | More to run and maintain. |
| Temporal | The most mature option; a separate cluster. | Too heavy for a private system with one worker. |

## The layout the owner described, and two libraries checked against it

After the comparison above the owner described the layout he wants. It is recorded here because the two checks below use it as their criteria; it is a direction from a conversation, not yet a requirement or an architecture rule.

1. **A queue library** (`lib/queues`) is the only code that talks to pg-boss. It defines the contract a job definition must meet and offers the one operation that sends a queue job.
2. **A worker library** (`lib/workers`) holds the handler registry, a dictionary from a job definition's name to its handler, and the execution loop. It uses the queue library.
3. **A module** defines its jobs, exposes a function that registers their handlers, and sends jobs through the queue library. It knows neither pg-boss nor the worker.
4. **The job contract** fixes the shape of the data and lists the promises a definition may change, such as the highest number of attempts. A promise says what will hold, never who keeps it or how.
5. **The worker process** runs the loop for its queues. It knows no queue settings and no module.
6. **Application assembly**, separate from the worker and from the queue, calls every module's registration function explicitly when a process starts.

### pg-boss-registry

A wrapper over pg-boss that provides a typed registry of queues, typed sending and worker registration.

| Aspect | Finding |
| --- | --- |
| Shape | `definePgBossQueues` declares queues with their payload type and options; `queues.worker(name, { handler })` binds a handler; `setupPgBoss` creates the queues, then the schedules, then the workers. |
| Fit to the layout | Close to points 1, 2 and 6. Against point 4: options are pg-boss's own (`Omit<Queue, 'name'>`), so a module would state implementation details. The registry key is the queue name, so a queue and a kind of work are the same thing. |
| Compatibility | Peer dependency `pg-boss ^12.15.0`, Node.js 22.12 or later; fits the project's 12.38.0. |
| Maturity | Version 0.3.0, first published 2 May 2026, last published 4 May 2026, one maintainer, 9 downloads in the week of 11–17 November 2026, no stars. |
| Sending in a transaction | Not documented. It keeps the plain pg-boss client reachable, so the `db` option probably still works; not verified. |

Verdict: not a dependency to take on. Its README is a useful reference for the shape of the project's own layer.

### Graphile Worker

A separate PostgreSQL queue library, mature and widely used (first published 2019, version 0.18.0 from September 2026, about 1.25 million downloads a week; pg-boss has about 5.2 million).

| Aspect | Finding |
| --- | --- |
| Shape | `run()` takes `taskList`, an object from task name to handler, or `taskDirectory`. It also ships a standalone worker process. This is point 2 and point 5 ready-made. |
| Settings | Given per job when it is added: `maxAttempts` (default 25), `queueName`, `runAt`, `jobKey`, `priority`, `flags`. They belong to the send, not to a definition. |
| One at a time per portal | Jobs with the same `queueName` run in series. This matches the portal turn directly. |
| Duplicates | `jobKey` with modes `replace`, `preserve_run_at` and `unsafe_dedupe`. |
| Lost worker | Jobs of a worker that crashed or was killed stay locked for at least 4 hours; workers sweep for such locks every 8–10 minutes. Earlier release means clearing the lock columns by hand. Detection by heartbeat is offered in Worker Pro, a paid plugin for sponsors. The maintainer does not recommend jobs longer than about an hour. |
| Time limit of a job | None found in the job options. |
| Sending in a transaction | `add_job` is an SQL function, so calling it in the module's transaction should commit and roll back with it. The documentation read does not state this; it is an inference. |
| Runtime | Node.js 22.18 or later. |

Verdict: it has the registry and the worker the owner described, but it loses two things the system relies on today. With pg-boss a lost worker is noticed through the job's heartbeat within about half a minute and a job has a time limit; with Graphile Worker an interrupted sync run would stay held for hours unless the system wrote its own unlocking, which is one more hand-written recovery.

## Assessment

These are the investigator's recommendations, not decisions.

1. **Keep pg-boss.** Graphile Worker and Sidequest have the layout built in, but Graphile Worker is weaker exactly where the system is fragile, in noticing a lost worker, and Sidequest is young. pg-boss is actively maintained (12.38.2 published 10 November 2026). A library of the same level also leaves the six versions of recovery where they are.
2. **Write the project's own thin layer over pg-boss, in the layout above.** It is small: a contract, a registry and a loop over `work()`. No existing wrapper is mature enough to depend on, and the one that fits passes pg-boss options through, which the layout rules out. Laravel's shape remains the model: one definition per work, a generic worker, one dead letter queue in place of six versions of recovery.
3. **Treat DBOS as a separate question** for multi-step work with long waits: assessments through OpenAI batches and the AI assignments of epic `oferty-pracy-sq2`. That epic is designed from the start, and task `oferty-pracy-0mq.15` specifies an execution lease of the system's own. Before that is built, check how much of it the heartbeat of a pg-boss job already covers; the sync queue uses it.
4. **Use the transaction as the filter.** Sending the queue job in the transaction that saves the work record is something the system has and Laravel's default does not. Any alternative outside PostgreSQL gives it up.

## What was not confirmed

- The Laravel documentation page was read up to its error handling section. Batches, the `failed_jobs` table, `queue:retry` and `queue:work` are described from the investigator's knowledge of Laravel, not from the page.
- The Sidequest overview page returned an error; its description rests on search results quoting its documentation.
- The DBOS page that was read does not describe concurrency limits, rate limits or scheduled workflows.
- pg-boss was read from its project page. The library is not installed outside the containers, so its typed interface for version 12.38.0 was not read; heartbeat and group concurrency, which the code uses, were not named on that page.
- Comparisons of durable workflow tools come mainly from vendors' blogs.
- pg-boss-registry was read from its README and the npm registry; its code was not read and it was not run. Other wrappers found by search (`pg-bossman`, tied to pg-boss 10 and 11 in its listing, and `pg-bosser`) were not examined.
- For Graphile Worker, the 4-hour lock is stated in its error handling page. The paid heartbeat plugin and the maintainer's advice on long jobs come from search results pointing to its documentation and to issue 222 of its repository, not from pages read in full. What happens to a job after its last attempt was not found.
- Neither library was tried against the project's code.

## Sources

- [Laravel: Queues](https://laravel.com/docs/queues)
- [pg-boss](https://github.com/timgit/pg-boss)
- [Graphile Worker: introduction](https://worker.graphile.org/docs), [`run()`](https://worker.graphile.org/docs/library/run), [`addJob()`](https://worker.graphile.org/docs/library/add-job), [adding jobs through SQL](https://worker.graphile.org/docs/sql-add-job), [error handling](https://worker.graphile.org/docs/error-handling), [issue 222: crashed worker recovery](https://github.com/graphile/worker/issues/222)
- [pg-boss-registry](https://github.com/inyourtime/pg-boss-registry)
- npm registry metadata and weekly downloads for `pg-boss`, `pg-boss-registry` and `graphile-worker`, read on 2026-11-19
- [Sidequest.js: FAQ](https://docs.sidequestjs.com/resources/faq) and [migrating from BullMQ](https://docs.sidequestjs.com/getting-started/migrating-from-bullmq)
- [DBOS: TypeScript programming guide](https://docs.dbos.dev/typescript/programming-guide)
- [DBOS: Benchmarking External and Embedded Durable Workflows](https://www.dbos.dev/blog/durable-execution-coding-comparison) (vendor)
- [Encore: BullMQ alternatives](https://encore.dev/articles/bullmq-alternatives)
- [Automation Atlas: Trigger.dev vs Inngest 2026](https://automationatlas.io/guides/trigger-dev-vs-inngest-2026-comparison/)
- [Upstash: Durable Workflow Engines in 2026](https://upstash.com/blog/durable-workflow-engines-compared-every-major-option-in-2026) (vendor)

## Conclusion

The queue library is not what makes this part of the system hard to understand. pg-boss already offers retries, a dead letter queue, scheduling and a dashboard that the system rebuilds by hand or goes without. Ready-made libraries with the layout the owner described exist, but the wrapper over pg-boss is too young to depend on and Graphile Worker notices a lost worker only after hours. Two decisions follow for the owner: whether to build the project's own thin layer over pg-boss around one definition per work, as Laravel does, and whether long multi-step work should move to a durable workflow library before epic `oferty-pracy-sq2` builds its own mechanism.
