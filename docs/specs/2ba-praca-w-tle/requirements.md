# Background work — Requirements

Basis: [PRD](PRD.md). Technical solution: [solution-design.md](solution-design.md). Concepts: [domain glossary](../../../GLOSSARY.md), section Technical terms.

Section `B<n>` describes the Beads task `oferty-pracy-2ba.<n>`. Requirement IDs (`B<n>-R..`) and criterion IDs (`B<n>-AC..`) are stable, and the Beads task cites criteria by ID. The *Check* column says how the implementer proves that a criterion is met.

The epic is released as a whole: the application must be consistent before and after the epic, not after each task. Between tasks, modules not yet moved keep using the existing way to the queue.

<a id="wymagania-wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| BW-AC01 | All of the project's automated quality checks pass: code rules and formatting, types, the application build, and automated tests including the tests on a real database. | Full run of the quality checks |
| BW-AC02 | Code created or moved in the task belongs to the module or shared library that owns its data and rules, and uses modules only through their public operations, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). | Code review |

<a id="b1"></a>

## B1. Queue and worker libraries (`oferty-pracy-2ba.1`)

Owner's decisions: the notes of `oferty-pracy-2ba.1`, points 1–35, the specification rounds of 2026-11-19 and the review of 2026-11-20 after the [investigation of other queue systems](../../research/architektura-kolejek-inspiracje-2ba.md).

### Scope

The task introduces the shared way to request background work and the worker that carries it out. It moves no module: synchronisation of ads, reading a CV's text and AI assignments keep the existing way until the tasks [B4](#b4), [B5](#b5) and [B6](#b6). The task removes the system check job.

Out of scope: waiting for a budget or a portal's turn; several workers with different lists of queues; a handler's result that fails a job at once without further attempts (collection task `oferty-pracy-sz5`, item 27); a stop for deployment that returns a job without using an attempt (item 28).

### Requirements

| ID | Requirement |
| --- | --- |
| B1-R01 | **Request in the operation.** A module requests a queue job as part of its operation. When the operation is rolled back, the job is not in the queue. |
| B1-R02 | **Queue configuration and job definitions.** Each job definition names its queue and its key mode: none, exclusivity or deduplication. The queue settings (attempts, retry delay, time limit, retention) are in one editable configuration that is part of the repository, per queue. A setting the configuration does not give takes the default of the queue mechanism. |
| B1-R03 | **Queues before start.** The queue of every job definition, with its failure queue, is created by a database migration written for it once, which names the queue and its key mode itself and does not depend on any module's code. The migration step then updates the changeable settings of the existing queues from the configuration. Both happen before the web application and the worker start. An entry of the configuration that names no existing queue stops the migration with an error that names the queue. (Owner, 2026-11-20, for queue creation; in general a good practice, see the architecture rules, costs.) |
| B1-R04 | **Invalid configuration.** A configuration that cannot be read, or has a value it does not allow, stops the migration, the worker and the web application at start with an error that names the queue and the field. |
| B1-R05 | **Refused request.** A request is refused with an error, and the requesting operation is rolled back, when its queue does not exist. |
| B1-R06 | **Exclusivity and deduplication.** In exclusivity mode, jobs with the same key value are never carried out at the same time, also with several workers. In deduplication mode, a second request with the same key value does not create a job while the first one waits or is carried out, and the requesting operation learns that the request was not created. |
| B1-R07 | **One worker, fixed pool.** The worker takes jobs from every queue that exists, failure queues included, except the queues of modules not yet moved (B1-R17), in turn, so that no queue starves the others. It carries out at most as many jobs at once as its pool size, which is set when the worker starts and is 2 when not set. |
| B1-R08 | **Handling.** The worker carries out each job in a separate process of its pool and passes the job handler only the data the module put into the job. A handler that ends normally completes the job. A handler that throws ends the attempt as failed, and the error's message is recorded with the job. |
| B1-R09 | **Ending a process.** The worker ends the process carrying out a job, and the attempt counts as failed with its reason recorded, when: the process has not reported for 15 s; the attempt's time limit has passed; the queue says the job no longer belongs to this attempt; or the queue has not confirmed the attempt for 25 s. |
| B1-R10 | **Lost worker.** When the worker dies while carrying out a job, the attempt counts as lost within about 30–90 s, for every queue; the job is retried when attempts remain, and otherwise fails finally (B1-R11). |
| B1-R11 | **Failure handler.** When a job fails finally, whatever recorded the failure of its last attempt (an error of the handler, the worker ending its process, or the queue's own supervision after the worker died), a copy of the job with its data enters the failure queue of its queue, and the worker carries it out by calling the failure handler the module registered for that job, with the job's data. When the module registered none, the copy is completed without effect. A failure handler that throws is retried like any job of its failure queue; after its last attempt the error stays in the log and with the copy. |
| B1-R12 | **Job without a handler.** A job for which no handler is registered is taken by the worker like any other job (B1-R07), cancelled at once without further attempts, and the worker writes the job's name to the log. The module is not told. Such a job does not wait unnoticed in its queue until it is deleted. |
| B1-R13 | **Stopping.** On a stop signal the worker takes no new jobs, waits up to 30 s for the jobs being carried out, then ends the remaining processes; their attempts count as failed and are retried when attempts remain. |
| B1-R14 | **Liveness and fatal errors.** While the worker takes jobs, it records that it is alive every 10 s, and the container treats it as unhealthy when the record is older than 30 s. The worker ends with a message when the queue reports an error, when the liveness record cannot be written, or when a process of its pool cannot start because a module's registration fails; the message names that module. |
| B1-R15 | **Registration.** Each module that handles queue jobs registers its job definitions with their job handlers and failure handlers in its own module plugin. The worker and each process of its pool run every module plugin once at start. The web application, the migration step and the command-line scripts do not run them. |
| B1-R16 | **No system check job.** The system check command, its queue and its stored confirmations no longer exist. The web application's readiness check passes when the database answers and the newest migration is applied. |
| B1-R17 | **Modules not yet moved.** The queues of ad synchronisation, CV text reading and AI assignments are still created at the migration step, and their jobs are still carried out by the existing worker path, together with its minute cycle, until the module's task moves them. The migration step names these queues and their settings itself instead of taking them from the modules' code. |
| B1-R18 | **Key mode agreement.** A job definition whose key mode differs from the key mode its queue was created with, or whose queue no migration creates, is found by an automated check before release, which names the queue. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| B1-AC01 | A job requested in an operation that is then rolled back is not in the queue; a job requested in a committed operation is. (B1-R01) | Automated test on a real database |
| B1-AC02 | A queue created by its migration without an entry in the configuration gets the queue mechanism's default attempts, time limit and retry delay, and the key mode its migration names; a queue with given values gets those; each queue has its failure queue. Changing a changeable setting and running the migration step changes the queue; an entry naming no existing queue stops the migration step with an error naming the queue; the migration step runs no module's code. (B1-R02, B1-R03) | Automated test on a real database and code review |
| B1-AC03 | A configuration with an unreadable file, an unknown field or a negative number of attempts stops the migration step, the worker and the web application with an error naming the queue and the field. (B1-R04) | Automated test |
| B1-AC04 | A request to a queue that does not exist is refused with an error, and the requesting operation's writes are rolled back. (B1-R05) | Automated test on a real database |
| B1-AC05 | With two workers taking jobs at the same time from a queue in exclusivity mode, two jobs with the same key value are never carried out at the same time, while jobs with different key values are. (B1-R06) | Automated test on a real database |
| B1-AC06 | In deduplication mode, a second request with the same key value while the first job waits, and while it is carried out, creates no job and tells the operation so; after the first job ends, a new request creates a job. (B1-R06) | Automated test on a real database |
| B1-AC07 | With jobs waiting in two queues, the worker takes from both in turn; with pool size 2 and five waiting jobs, at most two are carried out at once; without the pool size set, the worker uses 2. (B1-R07) | Automated test on a real database |
| B1-AC08 | A handler receives exactly the data the module requested; a job whose handler ends normally is completed; a job whose handler throws ends the attempt as failed with the error's message recorded with the job, and is retried when attempts remain. (B1-R08) | Automated test on a real database |
| B1-AC09 | The worker ends the process and the attempt counts as failed with its reason recorded, in each of four cases: the process stops reporting; the time limit passes; the job was given to another attempt; the queue does not confirm the attempt for 25 s. (B1-R09) | Automated test |
| B1-AC10 | After the worker is killed while a job runs, the job is retried by another worker within 90 s, for a queue whose time limit is longer; when that was the last attempt, the failure handler is called with the job's data. (B1-R10, B1-R11) | Automated test on a real database |
| B1-AC11 | The failure handler is called with the job's data after the last attempt fails, for a handler that throws, for an ended process and for a worker killed during the last attempt; it is not called after a failed attempt that is not the last; a failure handler that throws once is called again and its second call takes effect. (B1-R11) | Automated test on a real database |
| B1-AC12 | A job of a queue that exists but has no registered handler is taken by a worker started the way it runs in production, is cancelled, is not retried, and its name is in the worker's log. (B1-R07, B1-R12) | Automated test on a real database |
| B1-AC13 | On a stop signal, a job that ends within 30 s completes; a job still running after 30 s is ended and retried when attempts remain; no new job is taken after the signal. (B1-R13) | Automated test on a real database |
| B1-AC14 | The worker's liveness record is renewed every 10 s while it runs, and the container's health check fails when it is older than 30 s; the worker ends with a message when the queue reports an error and when a module's registration fails, naming the module. (B1-R14) | Automated test and inspection of the container configuration |
| B1-AC15 | Module plugins run in the worker and in each pool process and not in the web application, the migration step or the command-line scripts; the system check command, queue and stored confirmations are gone; the readiness check passes with the database answering and the newest migration applied, and fails without the database; the queues of ad synchronisation, CV text reading and AI assignments are still created and their jobs carried out with the minute cycle running. (B1-R15, B1-R16, B1-R17) | Automated tests on a real database and code review |
| B1-AC16 | The automated check fails and names the queue for a job definition whose key mode differs from the one its queue's migration names, and for a job definition whose queue no migration creates; it passes when every definition agrees with its queue. (B1-R18) | Automated test on a real database |

<a id="b4"></a>

## B4. Profile module on the libraries (`oferty-pracy-2ba.4`)

Owner's decisions: the notes of `oferty-pracy-2ba.1`, point 23, and the specification round of 2026-11-19. Depends on [B1](#b1).

### Scope

Reading the text of an uploaded CV moves to the queue and worker libraries. The module's periodic check of stalled CV imports is removed. Pasted CV text, the review of a CV and the AI proposal of a profile are not touched.

### Requirements

| ID | Requirement |
| --- | --- |
| B4-R01 | **Accepting a file.** The owner uploads a PDF or DOCX of at most 10 MB. The original is kept in the private document storage, and the CV is marked as queued together with the request to read it. When any of this fails, the CV is marked as failed with the message "Nie udało się przyjąć pliku. Sprawdź lokalny zapis dokumentów." and the owner gets an error. |
| B4-R02 | **Reading.** The text is read in a separate process limited to 30 s, 256 MB of memory and 1 MB of output. Read text is saved and the CV becomes ready for review. Empty text, text longer than 120 000 characters or any reading error gives the state "text needed" with the message "Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany." |
| B4-R03 | **Missing original.** When the stored original is missing or does not match its recorded fingerprint, reading gives the state "source file missing" with the message "Brak poprawnego pliku źródłowego". |
| B4-R04 | **One reading at a time; taking over.** At most one CV is read at a time in the whole system. A job for a CV that is queued or being read reads it, taking over a reading whose attempt was lost. A job for a CV in any other state changes nothing. |
| B4-R05 | **Attempts and failure.** Reading a CV has 2 attempts with a time limit of 2 minutes each. After the last attempt fails, also when the worker died in it, the CV gets the state "text needed" with the message of B4-R02, when it is queued or being read; a CV in any other state is not changed. |
| B4-R06 | **No periodic check.** Nothing checks stalled CV imports any more. A CV left as being received, because its upload stopped before the request to read it was saved, stays so, and the owner uploads it again (accepted; collection task `oferty-pracy-sz5`, item 20). |
| B4-R07 | **On the libraries.** The Profile module requests and handles reading through the queue and worker libraries of [B1](#b1) and no longer through the existing way. The queue of the existing way is removed with its waiting jobs after B4-R08. |
| B4-R08 | **Deployment.** Every CV that is queued or being read when the task is deployed gets one job in the new way and is read. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| B4-AC01 | Uploading a valid PDF stores the original and leaves the CV queued with a job in the queue; a failure to store it or to request the job marks the CV failed with the message of B4-R01 and returns an error. (B4-R01) | Automated test on a real database |
| B4-AC02 | The worker reads a valid PDF and DOCX and the CV becomes ready with its text; a file without text, a text over 120 000 characters and a reading over 30 s give "text needed" with the message of B4-R02. (B4-R02) | Automated test on a real database |
| B4-AC03 | A CV whose stored original was removed or changed gets "source file missing" with the message of B4-R03. (B4-R03) | Automated test on a real database |
| B4-AC04 | Two CVs requested at once are read one after the other; a job for a CV left as being read by a lost attempt reads it to ready; a job for a ready CV changes nothing. (B4-R04) | Automated test on a real database |
| B4-AC05 | When both attempts fail, and when the worker is killed during the last attempt, the CV gets "text needed" with the message of B4-R02; a CV that became ready in between is not changed. (B4-R05) | Automated test on a real database |
| B4-AC06 | No periodic operation of the Profile module checks stalled imports, at worker start or later. (B4-R06) | Code review |
| B4-AC07 | The Profile module has no dependency on the queue implementation; its jobs are carried out by the worker library through its module plugin; the queue of the existing way no longer exists after the migration step. (B4-R07) |
| B4-AC08 | After the migration step, a CV that was queued and one that was being read before it are read to ready, and CVs in other states are unchanged. (B4-R08) | Code review and automated test on a real database |

<a id="b5"></a>

## B5. Sources module on the libraries (`oferty-pracy-2ba.5`)

Owner's decisions: the notes of `oferty-pracy-2ba.1`, points 6, 20, 28 and 33, the specification round of 2026-11-20, in which the owner narrowed the epic to the basic work of each module, and the review of the same day, which brought back attempts with taking over, daily syncs and the carry-over at deployment once the failure queue (B1-R11) made them cheap. Depends on [B4](#b4).

### Scope

Requesting and carrying out an ad sync move to the queue and worker libraries. The task changes these rules of the [module architecture epic](../0mq-architektura-modulow/requirements.md#f2):

- B5-R02 replaces F2-06, F2-07 and A16-R02;
- B5-R06 replaces A5-R06;
- B5-R08 replaces A16-R07.

Connectors, saving batches, the run status, ad availability, taking over an interrupted sync (F2-13, A5-R05) and the daily schedule (F2-09, F2-10, A16-R03) keep their rules.

Out of scope: several syncs of one source (collection task `oferty-pracy-sz5`, item 19).

### Requirements

| ID | Requirement |
| --- | --- |
| B5-R01 | **Ways of requesting.** The application and the command-line scripts request a sync through the same operation of the Sources module. The application gets the sync's identifier without waiting. A command-line script asked to wait does so without a time limit, for the sync the request returned, also when that is an existing sync. It ends with an error code when the sync is not complete. Stopping the wait does not cancel the sync. An unknown source, a disabled source or invalid sync settings refuse the request with an error and create nothing. |
| B5-R02 | **One unfinished sync per source.** When the source has a sync that waits or runs, whatever its scope, a request creates nothing and returns that sync's identifier, also when it asked for another scope. Requests for one source made at the same moment create at most one sync. Syncs of different sources may run at the same time, up to the worker's pool size ([B1-R07](#b1)). |
| B5-R03 | **Carrying out.** A sync fetches and saves its ads as today: batches are saved as they arrive (F2-02), the finishing status follows A5-R03, connector errors end the sync with a saved message without secrets (A5-R04), and a complete sync starts the availability assessment (A5-R07, F2-12). Saving stops when the sync is no longer running. |
| B5-R04 | **Attempts and taking over.** Carrying out a sync has 3 attempts with a time limit of 1 hour each. An attempt that finds its sync running, because the previous attempt was ended or lost, takes it over and fetches further, keeping the ads saved before (F2-13, A5-R05). A job for a finished sync changes nothing. |
| B5-R05 | **Failure.** When the last attempt fails, whatever ended it, also when the worker died in it, a sync that waits or runs ends as partial when it saved at least one ad and as failed otherwise, with the message "Worker interrupted; request a new import". A finished sync is not changed. The owner requests the sync again. |
| B5-R06 | **No periodic check.** Nothing checks unfinished syncs any more; a sync whose last attempt was lost with the worker ends through B5-R05. |
| B5-R07 | **Daily syncs.** Every enabled source marked for the schedule is requested once per schedule occurrence, as today (F2-09, F2-10, A16-R03), through the request of B5-R01 and B5-R02, so a source with an unfinished sync gets no second one. Until [B6](#b6) the worker's minute cycle makes the daily request; from B6 the periodic process does (B6-R09). |
| B5-R08 | **Deployment.** Every sync that waits or runs when the task is deployed gets one job in the new way: a waiting one is carried out, a running one is taken over (B5-R04). |
| B5-R09 | **On the libraries.** The Sources module requests and handles syncs through the queue and worker libraries of [B1](#b1), not through the existing way; the module, the web application and the command-line scripts no longer connect to the queue for syncs. The queue of the existing way is removed with its waiting jobs after B5-R08. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| B5-AC01 | A request from the application returns the identifier of a waiting sync with a job in the queue; a command-line script asked to wait prints the result and ends with an error code for a sync that is not complete; an unknown source, a disabled source and invalid settings return an error and leave no sync and no job. (B5-R01) | Automated test on a real database |
| B5-AC02 | For a source with a waiting sync and for one with a running sync, a request for the same and for another scope returns that sync's identifier and creates no sync or job; ten requests for one source at once create one sync; requests for two sources create two syncs carried out at the same time with pool size 2. (B5-R02) | Automated test on a real database |
| B5-AC03 | The worker carries out a requested sync with a test connector: its batches are saved, a complete sync ends complete and starts the availability assessment, a connector error ends it partial or failed with the saved message, and a sync ended in between saves no further batch. (B5-R03) | Automated test on a real database |
| B5-AC04 | A sync whose attempt failed is continued by the next attempt as the same sync; an attempt that finds the sync running takes it over and keeps the ads saved before; a job for a finished sync changes nothing. (B5-R04) | Automated test on a real database |
| B5-AC05 | After the last attempt throws, after it is ended for exceeding the time limit, and after the worker is killed during it, a sync with saved ads ends partial and one without ends failed, both with the message of B5-R05; a sync finished in between is not changed. (B5-R05) | Automated test on a real database |
| B5-AC06 | No operation of the Sources module checks unfinished syncs. The daily request requests one sync per schedule occurrence for every enabled scheduled source, none for a source with an unfinished sync, and none when the same occurrence is checked again. (B5-R06, B5-R07) | Code review and automated test on a real database |
| B5-AC07 | After the migration step, a sync that waited before it is carried out, one that ran is taken over keeping its saved ads, and finished syncs are unchanged. (B5-R08) | Automated test on a real database |
| B5-AC08 | The Sources module, the web application and the command-line scripts have no dependency on the queue implementation for syncs; sync jobs are carried out by the worker library through the module's plugin; the queue of the existing way no longer exists after the migration step. (B5-R09) | Code review and automated test on a real database |

<a id="b6"></a>

## B6. AI module on the libraries, old path removed (`oferty-pracy-2ba.6`)

Owner's decisions: the notes of `oferty-pracy-2ba.1`, points 14, 21, 22 and 26, and the specification round of 2026-11-20, in which the owner narrowed the epic to the basic work of each module, aimed at a first usable version, and replaced the scheduler task `oferty-pracy-2ba.2` with a simple periodic process; and the review of the same day, which kept the archive of a late process's response once the failure queue (B1-R11) closed the gaps of a lost worker. Depends on [B5](#b5).

### Scope

Requesting and carrying out AI assignments move to the queue and worker libraries; the existing way to the queue is removed from the worker, the web application and the command-line scripts. Periodic work moves out of the worker into its own process. The task changes these rules of the [module architecture epic](../0mq-architektura-modulow/requirements.md):

- B6-R05, B6-R06 and B6-R07 replace A15-R01 to A15-R09; B6-R06 keeps the rule of A15-R05;
- B6-R02 and B6-R05 replace the sharing of the local model kept by [F4](../0mq-architektura-modulow/requirements.md#f4): the local model's own waiting line, its lease and holding it while its process is in an unknown state.

Providers, prices, the budget, settlement, the response schema and the delivery contract to the requesting modules are not touched.

Out of scope: a scheduler library with periodic operations registered by modules (collection task `oferty-pracy-sz5`, item 26).

### Requirements

| ID | Requirement |
| --- | --- |
| B6-R01 | **Requesting.** An AI assignment, its budget reservation and its request for work are saved in the operation that requests it; rolling back that operation rolls back all of them (A13-R04, A14-AC03). An assignment without budget waits for budget, and a group is funded as a whole or not at all. |
| B6-R02 | **One at a time.** In the whole system at most one paid assignment and at most one assignment on the local model are carried out at a time; the two kinds may run at the same time. Assignments on the local model start in the order they were requested. |
| B6-R03 | **Carrying out.** An assignment is carried out as today: a transient provider error is retried once as a new attempt of the same operation, after the wait the provider asks for; a result the requesting module fails to take over is delivered again up to 3 more times, at intervals growing from 30 seconds, without calling the provider again, and then stays waiting for delivery with its cost reserved (A14-R09); a provider batch already sent is checked further until it ends. |
| B6-R04 | **Time limit.** One attempt of an AI job has a time limit of 60 minutes; an AI job has 4 attempts. |
| B6-R05 | **Interrupted work.** An attempt that finds its assignment running, because the previous attempt was ended or lost, ends it as uncertain with the cause unknown and calls no provider; the requesting module receives that end. A paid assignment keeps its reservation; company research keeps its whole reservation, also when it was interrupted between steps. The same holds for a provider batch interrupted while it was being sent; a batch already sent is checked further (B6-R03). |
| B6-R06 | **Late process.** A process that returns after its paid assignment ended publishes no result and does not change the assignment. The raw responses it received from the provider are kept in the assignment's archive, whether or not the requesting module asked for an archive (A15-R05). |
| B6-R07 | **Failure.** When an AI job fails finally, also when the worker died in its last attempt, an assignment that waits for work or runs ends as uncertain with the cause unknown, keeping its reservation, and the requesting module receives that end; an assignment waiting for delivery stays so. |
| B6-R08 | **No resending.** Nothing sends the job of an assignment again. |
| B6-R09 | **Periodic work.** A periodic process, separate from the worker and started next to it, repeats a pass 60 seconds after the previous pass ended. A pass funds assignments waiting for budget, checks sent provider batches, retries removing the files of an ended batch at the provider, resumes the preparation of profile proposals and makes the daily request of ad syncs (B5-R07). An error in one of these steps is logged and the other steps still run. The worker does no periodic work. |
| B6-R10 | **Deployment.** Every assignment that waits for work, runs or waits for delivery when the task is deployed gets one job in the new way: a waiting one is carried out, a running one ends as in B6-R05, one waiting for delivery is delivered. Assignments waiting for budget are not touched. |
| B6-R11 | **On the libraries.** The AI module requests and handles its jobs through the queue and worker libraries of [B1](#b1). The AI module, the worker, the web application and the command-line scripts no longer use the existing way to the queue, and its queue is removed with its waiting jobs after B6-R10. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| B6-AC01 | An assessment, a Profile proposal and company research requested with a simulated provider end with their result delivered to the requesting module; rolling back the requesting operation leaves no assignment, reservation or job; an assignment without budget waits and is funded by a pass of the periodic process, a group as a whole. (B6-R01, B6-R09) | Automated test on a real database |
| B6-AC02 | Two paid assignments requested together are carried out one after the other; two on the local model start in request order one after the other; a paid one and a local one run at the same time with pool size 2. (B6-R02) | Automated test on a real database |
| B6-AC03 | A transient error gives one new attempt after the provider's wait; a receiver that fails once and then accepts ends the assignment completed with the provider called once; a receiver that keeps failing leaves it waiting for delivery with its cost reserved; a sent batch is completed by later passes. (B6-R03) | Automated test on a real database |
| B6-AC04 | The configuration of both AI queues sets 4 attempts and a time limit of 60 minutes. (B6-R04) | Code review |
| B6-AC05 | An attempt that finds a single paid assignment, company research between steps, a batch being sent or a local assignment running ends it as uncertain with the cause unknown, the requesting module receives that end, the reservation stays, and the provider is called no more times than before; a sent batch is not ended. (B6-R05) | Automated test on a real database |
| B6-AC06 | A save of a result made after the paid assignment ended changes nothing and publishes nothing, and the raw response is in the assignment's archive, also for a requesting module that asked for no archive. (B6-R06) | Automated test on a real database |
| B6-AC07 | After the last attempt fails, and after the worker is killed during it, a waiting and a running assignment end as uncertain with the cause unknown with their reservation kept and delivered to the requesting module, and one waiting for delivery is unchanged. (B6-R07) | Automated test on a real database |
| B6-AC08 | Nothing in the AI module sends an assignment's job again; the worker runs no periodic work; the periodic process logs an error of one step and runs the others. (B6-R08, B6-R09) | Code review and automated test |
| B6-AC09 | After the deployment step, an assignment that waited for work is carried out, one that ran ends as uncertain with the cause unknown, one that waited for delivery is delivered, and one waiting for budget is unchanged. (B6-R10) | Automated test on a real database |
| B6-AC10 | No code of the AI module, the worker, the web application or the command-line scripts uses the existing way to the queue; the queue of the existing way no longer exists after the deployment step. (B6-R11) | Code review and automated test on a real database |
