# Module architecture — Requirements

Basis: [PRD](PRD.md). Technical solution: [solution-design.md](solution-design.md). Concepts: [domain glossary](../../../GLOSSARY.md), [Offer sources](../../../modules/sources/README.md), [module map](../../architecture/moduly.md).

Section `A<n>` describes the Beads task `oferty-pracy-0mq.<n>`. Requirement IDs (`A<n>-R..`) and criterion IDs (`A<n>-AC..`) are stable, and the Beads task cites criteria by ID. The *Check* column says how the implementer proves that a criterion is met.

<a id="wymagania-wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| W-AC01 | All of the project's automated quality checks pass: code rules and formatting, types, the application build, and automated tests including the tests on a real database. | Full run of the quality checks |
| W-AC02 | Removed on 2026-11-17: it referred to behaviour without naming it, so no task could tell what it protects. The ID is not reused. | — |
| W-AC03 | Code created or moved in the task belongs to the module that owns its data and rules, and uses other modules only through their public operations, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). | Code review |

<a id="f2"></a>

## Source sync rules (F2)

The owner's decisions for the sync process. Tasks 0mq.1–0mq.5, 0mq.16 and 0mq.7 implement parts of them; each task names its rules.

| Rule | Content |
| --- | --- |
| F2-01 | **Connector.** Each source is handled by a connector with a shared contract. The connector is responsible for communication with the source, for splitting results into batches and for judging whether it checked the whole scope. The shared sync process does not depend on the details of any source. |
| F2-02 | **Batches.** Results are saved as they arrive. A batch contains actual ads, and its size is not fixed: three batches of 100 ads and one batch of 300 are equivalent. Saved batches stay after a later error. |
| F2-03 | **Duplicates.** A repeated ad, within a batch or between batches, does not stop the fetch or the save. We do not decide which content of a duplicate gets saved. The source may still treat such a run as incomplete. |
| F2-04 | **Result.** The source decides whether the whole scope was checked, using its existing criteria. Unifying those criteria is not part of the epic. A sync is not complete if saving the results failed. |
| F2-05 | **Timeout.** A single connector request to the source waits at most 5 s for a response. A request that fails for a transient reason is retried at most twice. A request retry is not a run retry. Sources fetched through external helper tools (JobSpy, Polish portals) keep their current time limits (owner's decision of 2026-11-15); any exceptions will be assessed separately. |
| F2-06 | **One active run per source.** One source executes at most one run at a time, whatever the scope. The others wait in the order they were requested. Different sources work in parallel. A new request does not interrupt a run in progress. |
| F2-07 | **One pending run per source and scope.** If the same source and scope have a pending run, a further request does not create a new one and gets the pending run's identifier. If a run is in progress and there is no pending one, the request creates one pending run. The rule applies to active runs; the history of finished runs is unlimited. Example: for source S and scope PHP, run A is in progress. The first request creates pending run B, and further requests point to B. Scope Java gets its own pending run, but it will not execute in parallel with A. After B starts, another PHP run can be requested. |
| F2-08 | **Scope.** A scope is a source and the parameters that define the set of ads fetched. The order of equivalent filters and the way the run is started do not create a different scope. The run's settings are fixed at the moment of the request, and changing them later does not affect an accepted run. Changing the result limit keeps its current meaning: it means a different scope. |
| F2-09 | **No time limits.** Fetching again on the same day is allowed, and a pending run does not expire because of its time in the queue. One schedule occurrence creates one request; additional requests are subject to F2-07. |
| F2-10 | **Ways of starting.** The CLI, the application and the schedule request a sync through the same operation and use the same execution. The application and the schedule get the run identifier without waiting for the result. The CLI waits for the result of its run without a separate time limit; when the request pointed to an existing pending run, it waits for that run. Stopping the wait does not cancel the run. |
| F2-11 | **Configuration errors.** An unknown source or invalid run settings end the run with a saved error. Two sources with the same name are a configuration error that prevents the application from starting. |
| F2-12 | **Observations and availability.** The system remembers in which runs each ad was seen, and through them in which scopes. Availability rules ([F1](../../../modules/sources/README.md#how-availability-is-established)): an observation restores availability at once; the source's information about a specific ad is kept; a missing ad means unavailability only after a complete run of a source that allows it, and only in the same scope. |
| F2-13 | **Interrupted work.** If the process executing a run stops working, the run is resumed or explicitly ended, without duplicating ads. A process that has lost a run stops saving its results. A new attempt continues the same run instead of creating a new one. |
| F2-14 | **Out of scope:** merging identical content under different identifiers, special handling of content changes A → B → A, choosing the right content of a duplicate, rebuilding versioning, the effect of versions on match freshness, and unifying the sources' criteria for completeness and data quality. |

<a id="f4"></a>

## Scope of AI job handling (F4)

Applies to tasks 0mq.14, 0mq.9, 0mq.11 and 0mq.17.

- The tasks move the existing AI job handling and keep its current behaviour. This covers:
  - attempt history, retries and recovery of an interrupted attempt,
  - sharing the local model,
  - reserves for an unknown cost, the budget and cost settlement,
  - joint settlement and publication of the result,
  - settlement when the content is rejected,
  - reserving a group of requests as a whole,
  - handling of batch processing results and of research after an error.

  Working safeguards are not removed.
- The tasks do not add new guarantees of handling, recovery or settlement. Simpler coordination is acceptable if it does not make the current behaviour worse. Improvements belong to the epic `oferty-pracy-sq2`.
- A missing guarantee found during the work that is not a regression is reported by the implementer as follow-up work and not fixed. This also applies to criteria taken over from stages 1–4 of the epic `oferty-pracy-334`.
- Until the task `oferty-pracy-0mq.15`, background jobs other than source sync do not detect interrupted work. This is a knowingly accepted change, not a regression.

<a id="a13"></a>

## Task 0mq.13 — Operations of several modules are saved together

A shared data access mechanism lets a use-case operation cover the writes of all modules it calls. The task introduces the mechanism and the rules. Existing code is migrated by the tasks that change it.

| Requirement | Content |
| --- | --- |
| A13-R01 | A use-case operation is saved in full or not at all. An error in any step rolls back the writes of all modules made during it, including steps that finished successfully. |
| A13-R02 | A module operation called on its own commits its own changes. Called during another operation, it becomes part of that operation and does not commit changes before that operation ends. |
| A13-R03 | Parallel operations are independent of each other: an error in one does not roll back the changes of the other. |
| A13-R04 | A request for background work is part of the operation that makes it: rolling back the operation rolls back the request. |
| A13-R05 | Operation errors do not exhaust database resources: after any number of failed operations, the system handles further ones. |
| A13-R06 | Modules do not manage database connections. A module's code does not depend on whether it runs as part of a larger operation. |
| A13-R07 | The rules for data access and operation boundaries are described in the architecture documentation as binding on all code. |
| A13-R08 | The task does not rewrite existing operations. The tasks that change that code do so. |

Owner's decisions:

- Reading another module's data does not block changes to it. When a match assessment is published, we accept that the profile or the ad may change between checking the assessment's freshness and saving it. The window is very short, and the owner can request the assessment again.
- We give up the mechanism that detected interrupted work of a background process. Source sync regains this protection in tasks 0mq.5 and 0mq.16, the other background jobs in task `0mq.15`. Protection against the same work being picked up twice stays.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A13-AC01 | Operation A calls operation B and raises an error after B finishes: B's write is rolled back. | Automated test on a real database |
| A13-AC02 | Operation B called on its own commits its write. | Same as above |
| A13-AC03 | The changes of an operation called during another one are invisible to other database users until the outer operation ends. | Same as above |
| A13-AC04 | Of two parallel operations, one ends with an error: the changes of the other are committed. | Same as above |
| A13-AC05 | Background work requested in a rolled-back operation does not reach the queue; requested in a committed one, it does. | Same as above, with a real queue |
| A13-AC06 | After more failed operations than the allowed number of concurrent connections, the next operation executes correctly. | Same as above |
| A13-AC07 | The architecture documentation describes the rules for data access, operation boundaries and the decisions from this section. | Documentation review |
| A13-AC08 | The task changes only the shared mechanism, how it is started in the application, the worker and the scripts, and the documentation; existing module operations stay unchanged. | Change review |

<a id="a1"></a>

## Task 0mq.1 — Sources fetched through a shared connector contract

Each offer source is handled by a connector with a shared contract, whether the source offers an API, HTML pages, or needs a helper tool. Rules: F2-01–F2-05, F2-08.

| Requirement | Content |
| --- | --- |
| A1-R01 | Each supported source (SOLID.Jobs, Himalayas, JobSpy portals, Polish portals) has a connector. The connector accepts a scope, passes on the ads it finds in batches, and reports whether it checked the whole scope and, if not, why. |
| A1-R02 | Each source keeps its existing completeness criteria, except for A1-R04. |
| A1-R03 | The connector applies the time and retry limits from F2-05. |
| A1-R04 | A repeated ad does not stop the fetch of further batches. SOLID.Jobs still treats a run with a duplicate as incomplete, as it does today. |
| A1-R05 | Saved data does not change: ads have the same identifiers, addresses, expiry dates and content. Existing ads do not get new versions because of the refactor. |
| A1-R06 | The connector derives the scope from the request according to F2-08. Existing scopes keep their identity, so the history of their runs and observations stays attached to them. |
| A1-R07 | The connector declares whether a missing ad after a complete run allows unavailability to be inferred. The declaration matches the current behaviour: only SOLID.Jobs allows it. |
| A1-R08 | The existing way of starting a sync fetches data through the connectors. It keeps incremental saving, partial results, run counters, error messages and availability rules. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A1-AC01 | Each source from the SOLID.Jobs, Himalayas, JobSpy and Polish portal directories has a connector with the shared contract. | Code review |
| A1-AC02 | A request to the source with no response ends after 5 s. A request that fails for a transient reason has at most three attempts, and one that fails for another reason has one. Retries do not create runs. | Automated test with a simulated source and time |
| A1-AC03 | The connector passes on results in many batches: three pages of SOLID.Jobs results give three batches of ads. | Automated test with a simulated source |
| A1-AC04 | A duplicate within a batch and between batches does not stop the fetch: all pages are fetched, and the SOLID.Jobs result is incomplete. | Same as above |
| A1-AC05 | For each source, input data that gave a complete, partial or failed run gives the same status as before the change, except for the case in A1-AC04. The criterion binds the change from this task; from task 0mq.5 on, the status is set by A5-R03. | Existing sync tests on a real database |
| A1-AC06 | For the same input data, the saved ads and their versions have the same identifiers, addresses, expiry dates, hashes and content as before the change. | Sync tests on a real database |
| A1-AC07 | The default scopes of all sources have the same fingerprints as before the change. Two Polish portal requests that differ only in the order of parameters give the same scope. | Automated test with fingerprints computed before the change |
| A1-AC08 | Inference from absence is allowed for SOLID.Jobs and disabled for the other sources. | Automated test |

<a id="a2"></a>

## Task 0mq.2 — Source selected by a fixed name

The system finds a source's connector by a fixed name in one registry. Rules: F2-11.

| Requirement | Content |
| --- | --- |
| A2-R01 | Each connector has a fixed, unique name, equal to the existing source identifier saved in the data. |
| A2-R02 | The registry lets you find a connector by name and gives the list of all names. |
| A2-R03 | Two connectors with the same name are a configuration error that prevents the application and the worker from starting. The registry picks neither of them. |
| A2-R04 | An unknown name gives an unambiguous error that names it and that can be saved as a run error. Saving it belongs to task 0mq.5. |
| A2-R05 | Adding a source means adding a connector and entering it in the registry. The rest of the system does not know the specific connectors. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A2-AC01 | The list of names in the registry is exactly: SOLID.Jobs, Himalayas, all JobSpy sources and all Polish portals, under their existing identifiers. A connector found by name has that name. | Automated test |
| A2-AC02 | A registry with two connectors of the same name is not created; the error names the name. | Same as above |
| A2-AC03 | Looking up an unknown name gives an error with that name and no other data. | Same as above |
| A2-AC04 | The specific connectors are known only in the registry. | Code review |

<a id="a3"></a>

## Task 0mq.3 — Offer sync state in one place

The Sources module keeps the state of runs in one place: acceptance, start, finish, and reading the state needed for recovery. The run is controlled by the code that manages it; tasks 0mq.5 and 0mq.16 connect execution and requesting to it. Rules: F2-07, F2-08.

| Requirement | Content |
| --- | --- |
| A3-R01 | A run stores the source, the scope with its settings, the reason it was started, dates, the link to the request in the queue, the status, counters, the error and diagnostics. |
| A3-R02 | Accepting a run and its request in the queue are created together or not at all. Acceptance applies F2-07 also for concurrent requests. |
| A3-R03 | A run starts only from waiting. Delivering the same work again does not start it a second time, and a finished run does not start again. |
| A3-R04 | A run's settings are fixed at acceptance and do not change later (F2-08). |
| A3-R05 | Finishing saves the status complete, partial or failed, plus the error and diagnostics. The history of finished runs is unlimited. |
| A3-R06 | In this task, the existing requesting and execution keep the current rules. The new acceptance rules take effect in task 0mq.16. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A3-AC01 | Ten concurrent acceptances of the same source and scope give exactly one pending run and one request in the queue; all acceptances return its identifier. There are no runs without requests and no requests without runs. | Automated test on a real database and queue |
| A3-AC02 | With a run in progress, acceptance creates one pending run, and further acceptances return its identifier. Finished runs of the scope do not affect acceptance. | Same as above |
| A3-AC03 | A second start of the same run and a start of a finished run do not change its state. | Same as above |
| A3-AC04 | Acceptance with different settings creates a separate scope and does not change the settings of a previously accepted run. | Same as above |
| A3-AC05 | One scope may have one run in progress and one pending run at the same time, but never two pending or two in progress. The existing way of starting a sync works unchanged. | Same as above, plus existing sync tests |

<a id="a4"></a>

## Task 0mq.4 — Saving fetch results

The Sources module saves a run's batch of ads: the ads, observations and content versions. It also returns a summary of the batch. Rules: F2-02, F2-03, F2-12.

Availability has three separate grounds ([F1](../../../modules/sources/README.md#how-availability-is-established)):

1. **An observation of the ad** in the results of active offers restores its availability already when the batch is saved, also in a run that will end as partial.
2. **Information from the source about a specific ad**, that is the closed status and the expiry date, does not depend on fetching the other results. Missing information stays an unknown.
3. **A missing ad in the results** is not by itself proof of unavailability. Inference from absence belongs to task 0mq.7, not to saving the batch.

Example: A was unavailable, B available. The first batch contains A as active, then the fetch stops. A regains availability, B keeps its state. If A has a past expiry date, the information about expiry is kept.

| Requirement | Content |
| --- | --- |
| A4-R01 | Batches are saved incrementally, each in full or not at all. An error in a later fetch does not remove previously saved ads, observations and versions. |
| A4-R02 | The source and the ad's identifier at the source point to one ad, also when it is fetched in a different scope. Identical content does not create a new version, and changed content creates a version without removing history. |
| A4-R03 | Saving restores the availability of an observed ad and keeps the source's information about its validity and status. It does not fill in a closed status or a deadline the source did not give. |
| A4-R04 | Saving a batch does not change the availability of ads absent from the batch. The existing marking of unseen ads after a full SOLID.Jobs run works unchanged until task 0mq.7. |
| A4-R05 | Observations, recognising repeated observations, and run counters keep their meaning. The batch summary gives the number of new observations, repeated observations and new versions. |
| A4-R06 | A repeated ad within a batch and between batches does not stop the save (F2-03). |
| A4-R07 | An error in saving a batch is reported to the sync process, which may then end the run with an error. |
| A4-R08 | The task does not combine availability with expiry, does not change how states are presented, and does not add rules for resolving conflicting information from the source. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A4-AC01 | After two batches are saved and the third fails, the ads, observations and versions from the first two are kept. | Automated test on a real database |
| A4-AC02 | The same ad saved in two runs with different scopes is one ad with observations in both runs. Identical content does not create a version, changed content does, and the previous versions stay. | Same as above |
| A4-AC03 | An ad that was unavailable before, observed in the first batch of a run that is later interrupted, is available after the interruption. | Same as above |
| A4-AC04 | An available ad absent from a partial or failed run stays available. | Same as above |
| A4-AC05 | An ad observed again with a past expiry date is still presented as expired. An ad without an expiry date has no deadline. | Same as above |
| A4-AC06 | A repeated observation of an ad in the same run does not increase the run's number of unique ads; the summary counts it as repeated. Run counters grow as before. | Same as above |
| A4-AC07 | An ad repeated within a batch and between batches does not stop the save, and the next batch is saved. | Same as above |
| A4-AC08 | A save error during a batch rolls back the whole batch and is reported as a save error. | Same as above, with a forced error |
| A4-AC09 | A full SOLID.Jobs run still marks unseen ads of the scope as unavailable, and a full Himalayas run does not change the availability of unseen ads. | Existing sync tests |

<a id="a5"></a>

## Task 0mq.5 — Shared execution of an offer sync

Every run, whatever the source, is executed by one shared process. It reads the run's saved settings, starts the source's connector, saves the batches and finishes the run. Rules: F2-01–F2-04, F2-11–F2-13.

| Requirement | Content |
| --- | --- |
| A5-R01 | The shared process executes the runs of all sources and contains no conditions that depend on a specific source, nor any interpretation of its pages, messages and diagnostics. |
| A5-R02 | The process uses the settings saved when the run was accepted, not the source's current settings. |
| A5-R03 | Status of a finishing run: complete when the source checked the whole scope and all batches were saved; partial when the run is not complete but saved at least one ad; failed in all other cases. A save error never gives the complete status. The rule applies to every source. An incomplete run with no saved ad is failed also where today it ends as partial: in SOLID.Jobs after reading at least one page, in JobSpy when the tool's status is other than failed. The change is intended (owner's decision of 2026-11-16). |
| A5-R04 | An unknown source and invalid run settings end the run as failed with a saved error. The saved message contains no secrets and no raw source responses. |
| A5-R05 | Interrupted work of the process is handled according to F2-13: the run is resumed or explicitly ended, the process that lost it stops saving, and a new attempt continues the same run without duplicating ads. |
| A5-R06 | A run left without an executor is recognised when the worker starts and periodically, and then resumed or explicitly ended. Recovery does not need exclusive access by a single worker. |
| A5-R07 | After a complete run, the process starts the availability assessment with the context of the source, scope and result, in one operation with saving the finish. Until task 0mq.7, the assessment works by the existing rule. |
| A5-R08 | The existing requesting of runs (CLI, application, schedule) works unchanged and uses the new execution. Himalayas, which today is started without a queue, uses the shared execution in the CLI process until task 0mq.16. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A5-AC01 | A run with a simulated source saves one and many batches, and the status follows from the source's result according to A5-R03. | Automated test on a real database and queue |
| A5-AC02 | The process does not distinguish sources: the same test passes for two simulated sources with different names. | Automated test and code review |
| A5-AC03 | Changing a source's settings after a run is accepted does not change the settings the run executes with. | Automated test |
| A5-AC04 | A fetch error after a saved batch gives a partial run with the earlier data and observations. A save error with a complete result gives a partial or failed run, never a complete one. | Same as above |
| A5-AC05 | An unknown source and invalid settings give a failed run with a saved error without secrets. | Same as above |
| A5-AC06 | Losing the process during a run leads to its resumption or explicit end; ads are not duplicated, and the number of runs does not change. | Automated test with a real queue and a simulated process loss |
| A5-AC07 | A process that has lost a run does not save further batches or the finish. | Same as above |
| A5-AC08 | Delivering the work of a finished run again does not change its state. | Same as above |
| A5-AC09 | A run in progress without active work in the queue is recognised and ended with a message about the interruption. | Same as above |
| A5-AC10 | A full SOLID.Jobs run marks unseen ads of the scope as unavailable in one operation with finishing the run; a full Himalayas run does not. | Existing sync tests |
| A5-AC11 | All existing ways of requesting (CLI for each source, a Polish portal request from the application, the SOLID.Jobs schedule) end with a run executed by the shared process. | Existing and extended sync tests |
| A5-AC12 | The task result distinguishes executed tests from skipped ones. | Review of the task result |

<a id="a19"></a>

## Task 0mq.19 — Acceptance without retrying

When a request meets an existing pending run of the same source and scope, acceptance returns that run with the information that a sync is already requested, and retries nothing. Today the acceptance from task 0mq.3 retries the insert up to three times when the pending run starts before it is read. Owner's decision of 2026-11-16: retrying is unnecessary. Rule F2-07 does not change. Rules: F2-07.

| Requirement | Content |
| --- | --- |
| A19-R01 | An acceptance that did not insert a run because of a pending run of this scope does not retry the insert. It returns that run's identifier and the information that an existing run was pointed to, also when the run has started in the meantime. |
| A19-R02 | When the run that blocked the insert is no longer among the active runs, acceptance ends with an error and no changes, and the caller can request again. |
| A19-R03 | The rest of the acceptance behaviour from task 0mq.3 and rule F2-07 do not change. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A19-AC01 | When the pending run starts between the failed insert and the read, acceptance returns that run's identifier with the information that an existing run was pointed to, and creates no run and no request in the queue. | Automated test on a real database and queue |
| A19-AC02 | When the run that blocked the insert finishes before the read, acceptance ends with an error and leaves no run, scope or request. | Same as above |
| A19-AC03 | Acceptance makes at most one insert attempt. | Code review and the test from A19-AC01 |
| A19-AC04 | Criteria A3-AC01–AC05 are still met. | Existing acceptance tests |

<a id="a16"></a>

## Task 0mq.16 — Shared sync requesting

All ways of starting request a sync through one operation and are subject to the same queue rules. Rules: F2-06–F2-10.

| Requirement | Content |
| --- | --- |
| A16-R01 | The CLI for each source, the application and the schedule request a sync through the same operation of the Sources module. |
| A16-R02 | The queue applies F2-06 and F2-07 to all sources, also with many workers. |
| A16-R03 | The schedule creates one request per occurrence (the schedule's day and hour). Checking the same occurrence again does not create a request. A manual request earlier that day does not hold back the request from the schedule. There is no block on fetching again on the same day and no expiry of pending runs. |
| A16-R04 | The application and the schedule get the run identifier without waiting. The CLI waits for the result of its run without a time limit, also when the request pointed to an existing pending run, and ends with an error code when the run is not complete. Stopping the wait does not cancel the run. |
| A16-R05 | Himalayas is requested and executed like the other sources. |
| A16-R06 | The run state and the state of the source catalogue are read through one module operation for all sources. The application's responses and the CLI messages keep their existing content. |
| A16-R07 | Runs waiting in the existing queues at the moment of deployment are ended by recovery with a message about the interruption; the owner requests them again. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A16-AC01 | Concurrent requests for the same source and scope create at most one pending run and return its identifier; no orphaned runs or requests are created. | Automated test on a real database and queue |
| A16-AC02 | With a run in progress, one pending run is created, and further requests point to it. Nothing interrupts the run in progress. | Same as above |
| A16-AC03 | Two workers do not execute runs of one source in parallel, also in different scopes; runs of different sources execute in parallel; runs of one source execute in the order they were requested. | Automated test with two workers on a real queue |
| A16-AC04 | Checking the same schedule occurrence many times creates one request. A manual request on the same day does not hold back the schedule, and a second manual request that day is accepted according to F2-07. | Automated test |
| A16-AC05 | The application and the schedule return after the request with the run identifier. The CLI waits for its run to finish longer than the existing 120 s and returns a code that depends on the status. | Automated test and a CLI run with a simulated source |
| A16-AC06 | Changing the settings after the request does not change the run's settings; requests from the CLI and from the application with equivalent parameters go to the same scope. | Automated test |
| A16-AC07 | Himalayas is requested by the CLI to the queue and executed by the worker. | Automated test |
| A16-AC08 | The application's responses about the state of sources and runs keep their existing form. | Existing application route tests |
| A16-AC09 | A run pending in the existing queue is ended after deployment with a message about the interruption. | Automated recovery test |

<a id="a7"></a>

## Task 0mq.7 — Ad unavailability after a full run

A shared rule of the Sources module determines which ads have become unavailable, based on the observation history in the scope. It replaces the rule built into the SOLID.Jobs sync today. Rules: F2-12.

| Requirement | Content |
| --- | --- |
| A7-R01 | After a complete run of a source that allows inference from absence, the ads of that source seen earlier in the same scope and absent from the current run become unavailable. |
| A7-R02 | Whether an ad belonged to the scope is decided by the observation history in the scope's runs, not by the last scope in which the ad was seen. |
| A7-R03 | Partial and failed runs do not change the availability of unseen ads. Neither does a complete run of a source that does not allow inference from absence (e.g. Himalayas). |
| A7-R04 | Marking unavailability and saving the run's finish as complete happen together or not at all. |
| A7-R05 | The rule does not depend on the source name; permission to infer comes from the connector's declaration. It does not check whether the disappearance results from a content change that makes the ad fail the filters. |
| A7-R06 | A later observation in any scope restores availability; an ad that disappears temporarily and appears again is accepted. Expiry information from the source stays separate. |

Example: ad X was seen in a run of scope PHP, and later in a run of scope Java. The next full PHP run without X marks X as unavailable, even though X's last scope is Java. The next Java run that finds X restores its availability.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A7-AC01 | After a full SOLID.Jobs run, ads seen earlier in the scope and absent from the run are unavailable. | Automated test on a real database |
| A7-AC02 | A partial and a failed run do not change the availability of unseen ads; neither does a full Himalayas run. | Same as above |
| A7-AC03 | An error during marking rolls back the marking, and the run is not complete. | Same as above, with a forced error |
| A7-AC04 | Example X: marking after the full PHP run and restoring after the Java run. | Same as above |
| A7-AC05 | An ad never seen in scope A does not change availability after a full run of A. | Same as above |
| A7-AC06 | The rule contains no conditions that depend on the source name. | Code review |

<a id="a8"></a>

## Task 0mq.8 — Offers module

The offer browsing code forms the Offers module with public operations. The views stay where they are and use the API.

| Requirement | Content |
| --- | --- |
| A8-R01 | The logic of the offer list and offer details, filtering, sorting, pagination and salary presentation belongs to the Offers module, together with its dedicated tests. |
| A8-R02 | The offer API routes pass requests to the module's public operations. |
| A8-R03 | The list and details work as before: the same filters, sorting, pagination, salary presentation and data in responses. |
| A8-R04 | Until tasks 0mq.6 and 0mq.18, the Offers module uses the existing reads of Sources and Matching data; the move does not change them. |
| A8-R05 | The module description assigns it responsibility for grouping ads of the same recruitment into a job offer and separates that from the state of implementation: grouping is not implemented and is not part of the epic. The description also gives the module's public operations, structure and dependencies. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A8-AC01 | The code of the offer list and details and its dedicated tests belong to the Offers module; outside the module only the routes that delegate to it and the views remain. | Code review |
| A8-AC02 | The list and details return the same data for the same filters, sorting and page as before the change. | Existing offer tests |
| A8-AC03 | The module description meets A8-R05. | Documentation review |

<a id="a6"></a>

## Task 0mq.6 — Reading ads through the Sources contract

Sources provide a public read of source ads and their versions. Offers, Matching and Companies stop reading Sources data directly and interpreting ad content.

| Requirement | Content |
| --- | --- |
| A6-R01 | Sources provide a read of the current ad with the identifier of its current version, a read of many ads at once, a read of a given version and the list of an ad's versions. |
| A6-R02 | The read returns the ad in a unified form: title, company, address, description, skills, salaries with the origin of the amount, locations, level, working time, work mode, dates, availability, expiry, source and remote-work qualification. Sources define the meaning of the fields; translating content from the source belongs to them. |
| A6-R03 | Offers build the list and details from the Sources read. Matching gets the ad for assessment, the current versions for determining assessment freshness, and the ads for the list through the Sources read. Companies get the ads linked to a company, the version titles in the link history, the company name from the ad and the current version at linking through the Sources read. |
| A6-R04 | The match assessment uses the content and the identifier of the same ad version. |
| A6-R05 | The read does not block changes to the ad. Linking a company to an ad saves the version read at the moment of linking; if the ad changes in the meantime, the link points to the previous version. The change is accepted on the same terms as for the match assessment. |
| A6-R06 | The list and details views, assessments and companies show the same data as before the change, except as A6-R07 states. Reads for lists fetch data in bulk, without a separate read for each item. |
| A6-R07 | Company views take the title and the company name of an ad in the unified form of the Sources read. A title or company name that is empty, consists only of spaces, is not text, or reads exactly "Stanowisko bez nazwy" or "Firma niepodana" counts as missing. An ad with a missing title appears in the company link history as "Oferta". An ad with a missing company name suggests no company profile. Spaces at the ends of a title or company name are ignored, so a company name that differs from a profile name only by them suggests that profile. The owner accepted these differences from the earlier behaviour on 2026-11-17. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A6-AC01 | Reading the current ad, many ads, a given version and the list of versions returns the data from A6-R01 and A6-R02. | Automated test on a real database |
| A6-AC02 | For the same data, the offer list and details, the match assessment input and the company views contain the same values as before the change, except for the cases in A6-R07, which the company views show as A6-R07 states. | Existing offer, matching and company tests; automated test of the A6-R07 cases |
| A6-AC03 | An assessment saved for an ad points to the version whose content was assessed, also when the ad changes during the assessment. | Automated test |
| A6-AC04 | Offers, Matching and Companies do not read Sources data other than through its public read and do not interpret ad content on their own. | Code review |
| A6-AC05 | The offer list with assessments makes a constant number of reads, whatever the number of offers. | Automated query counter test or code review |

<a id="a10"></a>

## Task 0mq.10 — Public read of the Profile

Matching uses confirmed profile versions through the Profile's public read ([Profile contract](../../../modules/profile/README.md#public-operations)). The Profile hides how versions are stored, and Matching stays responsible for the assessment freshness rule.

| Requirement | Content |
| --- | --- |
| A10-R01 | The Profile provides the active confirmed version with its identifier, or explicit information that there is no active version, and a read of given versions. |
| A10-R02 | Matching uses this read when requesting single and group assessments, in manual assessment, when reading history, when checking profile readiness and when determining assessment freshness. It does not read Profile data in any other way. |
| A10-R03 | New assessments in one group use the same profile version. Requests save the version identifier and the prepared input as before. A missing confirmed profile gives the existing message. |
| A10-R04 | Reading the profile does not block confirming a new version (decision in [0mq.13](#a13)). |
| A10-R05 | The assessment list and history views fetch version data in bulk. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A10-AC01 | The read returns the active version with its identifier, information that there is no active version, and the given versions. | Automated test on a real database |
| A10-AC02 | Assessment requests, manual assessment, history, profile readiness and assessment freshness work as before; a missing profile gives the existing message. | Existing matching tests |
| A10-AC03 | A group of assessments requested while a new version is being confirmed uses one version throughout. | Automated test |
| A10-AC04 | Confirming a new version does not wait for an assessment publication in progress. | Automated test with parallel operations |
| A10-AC05 | Matching does not read Profile data other than through its public read, and the assessment list and history make a constant number of profile reads. | Code review |

<a id="a14"></a>

## Task 0mq.14 — AI contract, execution coordination and provider adapters

The AI module provides general capabilities for working with a model, independent of business cases: single execution, batch processing and agent work ([AI module description](../../../modules/ai/README.md)). The task sets the boundaries and the direction of dependencies; lifecycle handling and settlement may be simplified in line with [F4](#f4). It takes over stage 1 of the epic `oferty-pracy-334` (shared configuration and budget, criteria E01-AC01–04 in the [stage documents](../lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md)).

| Requirement | Content |
| --- | --- |
| A14-R01 | The public AI operations express general execution capabilities and do not know the client's business case: requesting an execution with an instruction, a response schema and input; reading the state, result, usage and cost; reading the budget. |
| A14-R02 | The shared flow for handling an execution and its settlement belongs to the AI module: choosing the provider and model from configuration, fixing the settings at request time, the queue, budget reservation, retries, recovery, sharing the local model and settlement. |
| A14-R03 | Provider details (protocol, job state at the provider, further integration steps, usage data) belong to its adapter. The adapter carries out settlement in the flow set by the AI module and does not set its own module policy. |
| A14-R04 | The requesting module prepares the request, interprets the result and decides how to apply it. AI does not save the client's business data. |
| A14-R05 | The execution result reaches the requesting module through a contract defined by AI, and settlement may happen in the same operation as the client's publication of the result. |
| A14-R06 | Prices and cost arithmetic have one owner in the AI module and work as before (E01-AC02). The pricing environment variables named in E01-AC01 are replaced by configuration in the AI module (A14-R08); E01-AC01 no longer applies. Checking the budget, saving the attempt and requesting the work stay in one operation (E01-AC03). |
| A14-R07 | Simplifications are explicitly described in the AI module description and kept separate from the requirements of the epic `oferty-pracy-sq2`. |
| A14-R09 | An error in the requesting module while it takes over a result does not lose the result or end the execution: the result stays with the execution and its delivery is tried again. Only the requesting module's decision (accepted or rejected) or a failure on the AI side ends an execution. |
| A14-R10 | Work in a mode that no provider handles yet (batch, agent) is refused when requested, without reserving the budget. |
| A14-R11 | An execution's stage and the cause of its end are recorded once. A second record for the existing local Profile path is allowed until task 0mq.9 and is listed among the simplifications. |
| A14-R12 | The public execution read gives every requesting module one closed list of states and one closed list of end causes, the same for every provider, exported as types of the AI contract. A requesting module interprets each state and cause the same way whatever the provider, and gets no information on how the execution reached it (the local process, an unconfirmed cost, the provider's protocol). Each provider adapter implements one shared adapter contract and decides inside its own code which public state and cause what it observed means. Carried out in task 0mq.9. |
| A14-R13 | What AI fixes for an execution before the request (e.g. the version of a local model) reaches the requesting module only as an opaque value it keeps and passes back; its content is not part of the public contract. Carried out in task 0mq.9. |
| A14-R08 | The requesting module owns the settings of its executions and names them with a key it defines. The settings are the provider, the model and the reasoning effort; everything else (prices, limits, endpoints) is AI configuration. AI keeps the settings, refuses a request whose settings are missing or invalid, and does not know which modules use it. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A14-AC01 | The public AI operations contain no Profile, Matching or Companies concepts. | Code review |
| A14-AC02 | An execution request with a simulated provider goes through the queue and ends with a state, result, usage and cost available through a read; the result reaches the client's registered receiver. | Automated test on a real database and queue |
| A14-AC03 | Rolling back the client's operation rolls back the execution request and the budget reservation. | Same as above |
| A14-AC04 | When the client rejects the result, the cost incurred is still settled; an unknown cost stays reserved. | Same as above |
| A14-AC05 | Criteria E01-AC02–04 are met. | Tests named in the stage 1 SD and existing budget tests |
| A14-AC06 | The AI module description lists the simplifications and refers improvements to `oferty-pracy-sq2`. | Documentation review |
| A14-AC09 | When the receiver fails on the first delivery and accepts on the second, the execution ends completed, the cost is settled once and the provider is called once. A receiver that keeps failing leaves the execution waiting for delivery with the cost reserved. | Automated test on a real database and queue |
| A14-AC10 | A batch or agent request is refused with no budget reserved and no job queued. | Automated test |
| A14-AC11 | New code records the stage and cause only in the new fields; the AI module description lists the transitional fields of the local Profile path. | Code and documentation review |
| A14-AC08 | A request with a missing settings key, or with settings whose provider, model or reasoning effort AI does not accept, is refused with the cause `not_configured`. Settings with today's values give the same provider requests as before. No AI code depends on a particular key value. | Unit tests and code review |
| A14-AC07 | Provider protocols and states appear only in the adapters; the AI coordination and the requesting modules do not know them, and AI does not save the clients' business data. | Code review |
| A14-AC12 | The public execution read exposes the state and the cause only as values of the exported lists and no provider facts; outside the adapters no code translates provider observations into a public state or cause, and the requesting modules choose their behaviour from the state and cause alone. | Code review |
| A14-AC13 | The result of the check before a request is an opaque type in the public contract; no requesting module reads its content. | Code review |

<a id="a9"></a>

## Task 0mq.9 — Profile proposal through the AI module

The Profile requests preparing a proposal from a CV through the AI contract and does not handle providers. It takes over stage 2 of the epic `oferty-pracy-334` (criteria E02-AC01–04 in the [stage documents](../lokalne-ai/etapy/02-profil-adapter/requirements.md)).

| Requirement | Content |
| --- | --- |
| A9-R01 | The Profile requests preparing a proposal from the cleaned CV text and gets an execution identifier. Through the same contract, it reads the unified state and result: only the public states and causes of A14-R12, never the provider or path an execution took. Changing the provider or model does not require changing the Profile. |
| A9-R02 | Choosing the provider, the queue, the shared local execution, retries, recovery, the budget and settlement are on the AI side and work as before, including the attempt history and the handling of uncertain execution and cost ([F4](#f4)). |
| A9-R03 | The integrating layer translates the proposal request into an instruction and a response schema and passes the result to the Profile in a fixed format. |
| A9-R04 | The Profile ties the result to the text revision, checks the quotes and saves the proposal in its own data. A result for an older revision does not replace a newer proposal. The owner still chooses the changes for the draft and confirms the version separately. |
| A9-R05 | The Profile does not read or write AI module data other than through its contract. At most one proposal preparation per import is in progress, as before. |
| A9-R06 | The AI module description explains how to add a new execution path (e.g. a local model for another job) through the AI contract, for the needs of task `oferty-pracy-334.6`, including how a new adapter maps what it observes to the public states and causes (A14-R12). |
| A9-R07 | The message the owner sees when proposal preparation ends without a proposal depends only on the public state and cause, so the same state and cause give the same message on the paid and the local path. An uncertain end (state `uncertain`) shows one message: "Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem." It replaces today's separate local and paid messages for an uncertain end. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A9-AC01 | Preparing a proposal works through the paid path and the local path with simulated providers: a correct result gives a proposal for the right revision. | Automated test on a real database |
| A9-AC02 | A result with an unconfirmed quote is rejected, and a result for an older revision does not replace a newer proposal. | Same as above |
| A9-AC03 | An interrupted attempt is recovered to the extent this works today. | Same as above |
| A9-AC04 | Import, applying a proposal and reading saved proposals work as before. | Existing profile tests |
| A9-AC05 | Criteria E02-AC01–04 are met. | Tests named in the stage 2 SD |
| A9-AC06 | The Profile does not use the AI module's data and internals outside its contract. | Code review |
| A9-AC07 | The AI module description meets A9-R06. | Documentation review |
| A9-AC08 | The message for each public state and cause is the same on the paid and the local path, and an uncertain end shows the message of A9-R07; the Profile code reads no `runtimeState`, unconfirmed-cost flag or path of the execution. | Automated test and code review |

<a id="a11"></a>

## Task 0mq.11 — Profile operations for application routes

Profile routes pass requests to the Profile's public operations and do not combine the data of several modules.

| Requirement | Content |
| --- | --- |
| A11-R01 | The list and details of imports and the read of profile versions come from Profile operations. |
| A11-R02 | Applying a proposal is run entirely by the Profile: reading the proposal, checking the revision, validating the result and saving the draft, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md#a-module-operation-carries-the-whole-use-case). |
| A11-R03 | The AI budget summary in the profile response comes from an AI module operation. |
| A11-R04 | Route responses and the handling of revision conflicts stay unchanged. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A11-AC01 | Profile routes return the same responses as before the change, also on a conflict of draft and text revisions. | Existing profile route tests |
| A11-AC02 | Profile routes do not read Profile or AI data other than through the operations of those modules and contain no logic for applying a proposal. | Code review |

<a id="a17"></a>

## Task 0mq.17 — AI attempts and settlement for Matching and Companies

Matching and Companies request AI work and settle it through the AI contract. It takes over stages 3 and 4 of the epic `oferty-pracy-334` (criteria E03-AC01–05 and E04-AC01–04 in the documents of [stage 3](../lokalne-ai/etapy/03-oceny-batch/requirements.md) and [stage 4](../lokalne-ai/etapy/04-research-wykonawca/requirements.md)).

| Requirement | Content |
| --- | --- |
| A17-R01 | Single and group assessments use the AI contract; batch processing at the provider belongs to AI. Matching prepares the request and interprets the result. |
| A17-R02 | Company research uses the AI contract in agent work mode; search and synthesis at the provider belong to AI. Companies prepare the request and validate the report. |
| A17-R03 | Matching and Companies do not read or write AI module data other than through its contract. |
| A17-R04 | The following are kept to their current extent: joint settlement and publication, settlement when the content is rejected, uncertain cost, reserving a group as a whole, and the handling of batch results and of research after an error ([F4](#f4)). |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A17-AC01 | Single, group and manual assessments and research work as before with simulated providers. | Existing matching and company tests |
| A17-AC02 | Criteria E03-AC01–05 are met. | Tests named in the stage 3 SD |
| A17-AC03 | Criteria E04-AC01–04 are met. | Tests named in the stage 4 SD |
| A17-AC04 | Matching and Companies do not use the AI module's data and internals outside its contract. | Code review |

**Split (owner's decision, 2026-11-18).** Task 0mq.17 is delivered as two tasks, by the module that owns the data. Each task meets A17-R01–R04 for its own module. Existing history is migrated to AI executions. Work in progress at deploy is not carried over, because the system does not yet run in production.

<a id="a17m"></a>

### Task 0mq.21 — Assessments of Matching

Covers A17-R01, and A17-R03 and A17-R04 for Matching.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| AM-AC01 | A single assessment, an assessment group and a manual assessment with a simulated provider end with the assessment published or rejected and its cost settled. | Matching, group and archive tests |
| AM-AC02 | Criteria E03-AC01–05 are met. | Tests named in the stage 3 SD |
| AM-AC03 | After the migration, the assessment history shows each assessment made before the migration with its state and cost read from AI executions. | Migration test on a database with pre-migration data |
| AM-AC04 | Matching code reads no AI tables and imports no AI internals; the old assessment queues and Matching's batch tables are not used. | Code search |

<a id="a17c"></a>

### Task 0mq.22 — Company research

Covers A17-R02, and A17-R03 and A17-R04 for Companies. Depends on task 0mq.21, which adds the adapter state of executions.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| AC-AC01 | Company research with a simulated provider ends with the report published or rejected and the cost of each step settled; reusing a report and an explicit refresh work. | Company and research tests |
| AC-AC02 | Criteria E04-AC01–04 are met. | Tests named in the stage 4 SD |
| AC-AC03 | After the migration, the research history shows each research made before the migration with its state and cost read from AI executions. | Migration test on a database with pre-migration data |
| AC-AC04 | Companies code reads no AI tables and imports no AI internals; the old research queue is gone and the AI public entry point has no transitional exports. | Code search |

<a id="a18"></a>

## Task 0mq.18 — Neutral owners of shared mechanisms

Mechanisms used by many modules have neutral owners, and modules do not depend on the internals of the Profile.

| Requirement | Content |
| --- | --- |
| A18-R01 | The existing helper transaction mechanisms of the modules are replaced by the shared mechanism from task 0mq.13, keeping the transaction boundaries. |
| A18-R02 | Identifier validation, shared HTTP request handling and queue access in routes have a neutral owner; Matching, Companies and Sources routes do not use them through the Profile. |
| A18-R03 | Removing contact details from text is a shared mechanism independent of CV import. |
| A18-R04 | Matching and Companies get the confirmed profile data through its contract and do not use the Profile's internal schemas. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A18-AC01 | There are no helper transaction mechanisms other than the shared one; operations are saved with the same boundaries as before the change. | Code review and existing tests |
| A18-AC02 | Matching, Companies, Sources and their routes do not use the internals of the Profile. | Code review |
| A18-AC03 | CV import, applying a proposal, assessment requests, manual assessment, the assessment list and history, company-to-ad links and AI settlement work as before. | Existing tests |

<a id="a12"></a>

## Task 0mq.12 — Target module directories

Code left over from earlier tasks goes into the Sources, Offers, Profile, Matching, Companies and AI modules. The task does not move again code arranged by earlier tasks.

| Requirement | Content |
| --- | --- |
| A12-R01 | Each module's code lies in its directory, with a public entry point and a module description. |
| A12-R02 | Operations, rules, data access, integrations and the handling of routes, queues and CLI commands are laid out according to the [module directory](../../architecture/moduly-i-zasady-kodu.md#module-directory). |
| A12-R03 | Files required by the framework and by startup stay where they are and delegate to the modules. Views stay where they are and use the modules' public entry points. |
| A12-R04 | The task result lists the files left outside the modules, with the reason. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| A12-AC01 | Each of the six modules has a directory with a public entry point and a description, and code outside the module imports it only through the public entry point. | Code review |
| A12-AC02 | Outside the modules only the files required by the framework and by startup and the shared infrastructure remain; the task result lists them with the reason. | Review of the task result |
| A12-AC03 | The application works as before. | Criterion W-AC01 |
