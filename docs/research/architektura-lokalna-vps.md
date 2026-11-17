# A simple local architecture with a path to a VPS

Verification date: 2026-10-30. Research for the decision "Feasibility of a simple local architecture with a path to a VPS" (`bd show oferty-pracy-v4t.3`).

## Working conclusion

Both variants below are feasible. The simplest reference point is a **Django monolith with HTML templates, SQLite and a separate Huey process**, supplemented by a persistent operation log and recovery of interrupted work. A separate SPA application, Redis or a database server is not needed at the start. **SvelteKit + PostgreSQL + pg-boss** is a sensible alternative, especially with greater familiarity with TypeScript and a wish to use queue mechanisms built on the same database.

This is a recommendation for further comparison, not a choice of architecture. The domain model, AI contracts, the exact resume policy and UI interaction needs remain open. The study is based on documentation; no components were installed and no prototype, performance tests or migrations were run.

## Product assumptions

In line with the [product decisions](../product/ustalenia.md): one owner, an application in the browser, first run on macOS, later the option to move the application and data to a VPS. Fetching and triage by default once a day and on request; research and interview preparation may take a long time. History, pending operations and the budget must survive a restart. Access is to be private, and backups automatic. The working 100 PLN a month applies to AI and research, separately from a possible VPS; it does not mean consent to a purchase.

## Two variants

The table below presents design proposals and their maintainability assessment, not measurement results.

| Area | A: Python / Django / SQLite / Huey | B: TypeScript / SvelteKit / PostgreSQL / pg-boss |
| --- | --- | --- |
| UI | Server templates and forms; a little JavaScript for operation status and more convenient filters | SvelteKit with server pages and interactive components |
| Data | SQLite on a local disk; a separate Huey queue file | PostgreSQL: application data and pg-boss tables |
| Processes during normal work | Web server and one Huey consumer with a scheduler | Node server, Node worker with a scheduler, and PostgreSQL |
| Retry and restart | Huey retry + a mandatory operation log and reconciliation after a failure | Retry, heartbeat and expiry of active work in pg-boss + persistent domain state |
| macOS installation | Python, a virtual environment, dependencies; no database server service | Node and dependencies plus a local PostgreSQL or a container environment |
| Moving to a VPS | The same application and consistent SQLite copies; still one host | The same build, PostgreSQL and restoring a dump; no change of database engine |
| Operating cost | Fewer services, but recovery of Huey work must be handled explicitly | More services, but more ready-made queue reliability mechanisms |
| When it has the edge | The priority is a small number of parts and a simple UI | TypeScript is more convenient for the maintainer, or UI interactions are substantially richer |

### A. Verified capabilities and limitations

Django includes an ORM, migrations, views, templates and an admin panel. This gives a basis for a single application without a separate backend and frontend API. The admin panel can help with handling data; the target views of offers, companies and recruitments still need to be designed. [Django documentation](https://docs.djangoproject.com/en/5.2/intro/overview/).

Huey provides `SqliteHuey`, periodic tasks and retry with a delay. The consumer executes tasks and checks the schedule. With many consumers, only one should enqueue periodic tasks. **A persistent queue does not guarantee recovery of a task that is already executing:** the documentation warns that abruptly killing the process or a power loss can lose such a task. A signal on controlled shutdown does not replace recovery after a host failure. [Huey: guide](https://huey.readthedocs.io/en/stable/guide.html), [consumer](https://huey.readthedocs.io/en/stable/consumer.html).

Recommendation: a single worker to begin with, persistent operations in the domain database, and Huey as the mechanism that starts them. If the operation record and the enqueueing are in different SQLite files, there is no single transaction covering both writes. First store the intent in the database, then send the identifier; a periodic sweep of unsent/interrupted operations closes the gap after a restart. Do not build a custom general queue framework.

The built-in Tasks in Django 6.0 do not solve this on their own: the framework defines a task contract but does not provide an executing worker; the built-in backends are for development and testing. They are not a replacement for persistent work infrastructure. [Django Tasks](https://docs.djangoproject.com/en/6.0/topics/tasks/).

### B. Verified capabilities and limitations

The official SvelteKit `adapter-node` generates a standalone Node server. It allows configuring the address and port, so the application can run locally and on its own VPS. This is a deployment target, not a service that manages the worker or the database. [SvelteKit: Node servers](https://svelte.dev/docs/kit/adapter-node).

pg-boss runs on Node and PostgreSQL, uses `SKIP LOCKED` so that many executors can fetch work, and supports retry and scheduling. The documentation allows creating a job in the same transaction as an application operation, which simplifies consistent dispatch of work. Redis is not needed. [pg-boss repository](https://github.com/timgit/pg-boss).

Job options include an attempt limit, delay and backoff, heartbeat and a time limit for an active attempt. A missing heartbeat can cause a retry. The default active limit is 15 minutes, and retention of pending jobs is limited, so the configuration must suit long operations and a possibly longer break in the computer's operation. [pg-boss: Jobs](https://pgboss.io/api/jobs).

Recommendation: the worker as a separate process of the same project; low concurrency and a shared transaction for writing the operation/request. This still does not mean exactly one paid AI call: a failure between receiving the provider's response and storing the result can lead to a retry.

## Database: concurrency, backup and moving

### Facts from the documentation

SQLite in WAL mode allows concurrent reads and a write, but has only one writer at a time. All processes using WAL must be on the same host; the active database must not be kept on a network file system. Long reads can hinder checkpoints and grow the WAL. The WAL file is part of the database state, so copying only the active `.db` is not a valid backup. Current documentation also describes a fix for the WAL-reset bug: use SQLite 3.51.3 or newer, or the indicated release with the backport; check the library actually used by the runtime, not only the system command. [SQLite WAL](https://www.sqlite.org/wal.html).

The SQLite Online Backup API creates a consistent copy of a running database; `VACUUM INTO` is an alternative. [SQLite Backup API](https://www.sqlite.org/backup.html). Django warns that increasing the lock timeout gives a longer wait but does not solve excessive write concurrency. [Django: database is locked](https://docs.djangoproject.com/en/5.2/ref/databases/#database-is-locked-errors).

PostgreSQL uses MVCC and row and table locks; concurrent reads and writes are part of its model, but write conflicts still require correct transaction design. [PostgreSQL: MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html). `pg_dump` creates a consistent export of a running database; it covers one database, and roles and other global objects need separate handling. The documentation notes that, beyond simple cases, a dump alone is not a suitable strategy for regular production backups. [PostgreSQL: pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html).

### Recommendations for this product

- SQLite is a realistic variant on a single VPS too. Moving from macOS to Linux by itself does not force PostgreSQL. Do not open the same database from the Mac and the VPS at the same time through a network share or a synced directory.
- Run network and AI operations outside a transaction; read/write state in short transactions. Limit concurrent writes and handle transient locks.
- Consider moving to PostgreSQL in the case of persistent write conflicts despite short transactions, a need for many workers/hosts, or choosing pg-boss. Do not make this depend only on the number of offers.
- Automatic backup: a consistent SQLite snapshot or — for this small installation — a PostgreSQL dump, with attachments, the schema version and restore instructions handled separately. A copy off the working disk, encryption and retention; the location remains to be decided. A restore test is required. A backup of two SQLite files is not a shared snapshot: the domain log must make it possible to rebuild the queue.
- Host migration: stop creating new requests, finish or mark active attempts, make a consistent copy and back up files, restore on the VPS, run the migrations for the application version, check the data and reconciliation. Start the scheduler only on the new host. Migrating SQLite → PostgreSQL would be a separate data migration and needs a test; changing the ORM configuration does not move records.

## Restart, scheduling and long AI work

The contract below is a recommendation common to both variants, to be clarified once the domain and AI integration are settled:

1. HTTP stores the operation and returns its identifier immediately. The UI reads the progress; closing the tab does not interrupt the work.
2. The log stores the state, stage, number of attempts, earliest resume time, error, attempt identifier and the claim/heartbeat expiry time. The worker does not hold a transaction while waiting for AI.
3. After a failure, a pending task remains a request, and an abandoned `running` one is recognised when its claim expires. An old attempt must not overwrite the result of a newer one. Each stage has a deduplication key and stored intermediate results.
4. Retry has a limit and backoff, and distinguishes transient errors, permanent errors and a pause due to the budget. Before a paid attempt, atomically reserve the budget; when the result of a call is unknown, do not release the reservation without checking. Use an idempotency key/the provider's request identifier if the service contract supports it. Do not promise recovery of the call stack or exactly-once charging.
5. On startup and periodically, check the last completed fetch. If the due time has passed, add one catch-up run instead of replaying every missed tick. A unique cycle key prevents duplicates between manual and automatic starts. Scheduler time zone: set explicitly, e.g. `Europe/Warsaw`; event times stored in UTC.

A library scheduler does not do work on a computer that is off or asleep. Huey checks periodic tasks through a running consumer. pg-boss also requires a running instance; its documentation describes a policy for missed due times (`skip` or `once`), which must be chosen explicitly and checked for the pinned version. [Huey consumer](https://huey.readthedocs.io/en/stable/consumer.html), [pg-boss Scheduling](https://pgboss.io/api/scheduling).

Operational recommendation: on macOS one way of starting the web server and the worker, then supervision through `launchd`; on a VPS `systemd` services with restart on failure, logs and start after a system reboot. Do not add a second independent scheduler for the same operation. Apple documents `launchd` for timed jobs, and systemd supports `Restart=` policies. [Apple: Scheduling Timed Jobs — archived documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html), [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). Configuration details for the current macOS need checking at deployment. The user should see the last successful fetch and the scheduler delay.

## Private access, secrets and environment

Minimum recommendation: locally, listen on `127.0.0.1`, one owner account, session and CSRF protection. On a VPS, also loopback, with access through an SSH tunnel; do not expose the application and database ports publicly. An example mechanism: `ssh -N -L 127.0.0.1:8000:127.0.0.1:8000 użytkownik@vps` (`użytkownik` = user), then a local browser. OpenSSH documents encrypted port forwarding and explicitly binding the local port to loopback. [OpenSSH ssh(1)](https://man.openbsd.org/ssh). The tunnel requires starting and SSH authorisation; easier access from many devices may justify a private VPN or HTTPS with authentication, which is a separate deployment decision.

Store AI keys and passwords only on the server side: a configuration file outside the repository with permissions for the process owner, or the system's secret store. The repo contains only an example without values. Do not include secrets in queue data, client code, logs or ordinary diagnostic copies. Treat data backups as private, because they contain the profile and recruitment contacts; describe how to recover secrets separately. Django recommends protecting `SECRET_KEY`, configuration through the environment/a file, disabling `DEBUG` and verifying deployment settings. [Django deployment checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/).

Both variants can run natively without Docker. Containers are an option for later packaging, not a condition for moving data. On macOS they require a suitable runtime, e.g. an installed and running Docker Desktop, with separate hardware/system requirements; do not assume compatibility and availability on the owner's computer without checking. [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/). Images and dependencies must support the architecture of the target VPS; persistent data must not live only in the container layer.

## What remains before the choice

The architecture decision should confirm the owner's familiarity with the language, UI interaction requirements, the model of AI operations and resumes, the maximum stage duration, the budget policy, the accepted delay after sleep, and the backup target and retention. Variant A remains the smallest justified starting point; variant B has the edge if the lower cost of implementing a reliable queue oneself and a preference for TypeScript outweigh running PostgreSQL. Neither variant currently requires a separate orchestration platform, multiple hosts or paid services just to run the application.
