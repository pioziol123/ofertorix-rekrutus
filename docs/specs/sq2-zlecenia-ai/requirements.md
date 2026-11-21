# AI assignments — Requirements

Basis: [PRD](PRD.md). Technical solution: [solution-design.md](solution-design.md). Concepts: [domain glossary](../../../GLOSSARY.md#ai-module).

Section `T<n>` describes stage n of the PRD and the Beads task `oferty-pracy-sq2.<n+1>`. Requirement IDs (`T<n>-R..`) and criterion IDs (`T<n>-AC..`) are stable, and the Beads task of a stage cites criteria by ID. The *Check* column says how the implementer proves that a criterion is met. No criterion needs the owner: a check "requested from the running application" is made by the implementer against the application started in its sandbox, by requesting the page or the route and reading the response.

**Sources.** `(Q..)` cites the owner's interview of 18 November 2026, recorded group by group in the comments of `oferty-pracy-sq2`. `(owner, 2026-11-20)` cites the reconciliation with the [background work epic](../2ba-praca-w-tle/requirements.md) recorded in the comments of that day. [Decisions of 20 November 2026](#open) lists what the owner settled when these requirements were written. Everything else restates the PRD.

**Words.** *Operation* always means an operation of an assignment (glossary); what a requesting module does in one database transaction is called its *save*. *Attempt* means an attempt of background work in the queue, never a retry of AI work, which is a new operation. The records the old way keeps of AI work and its cost are called *earlier records*. A failed assignment's reason has one wording here (ZA-R05); the solution design gives its stored value.

**Old and new.** Until [T10](#t10) every rule here speaks of assignments, the new way. A requesting module's views keep showing its matters of the old way with today's code and texts until T10; a text that T7, T8 or T9 calls "gone" is not shown for a matter with an assignment from that task on, and is removed from the application in T10. The old way keeps its own rules and code untouched until T10, also where a rule here says that something "is gone" or "replaced": for the old way, T10 makes it so.

**Release.** The epic is released as a whole. Between its tasks the application passes all its checks, with the old way of requesting AI work still serving the modules not yet moved; [T10](#t10) removes it. Until then the new way has its own queues and counts only its own operations against the month's limit: the two ways together may spend more than the limit and may call a provider at the same time. The owner accepted this on 2026-11-21, because the system does not run in production; a released application never has both.

**Depends on** `oferty-pracy-2ba.6`: the periodic process exists, and the old way of requesting AI work already uses the shared queues and worker, so nothing but [T10](#t10) has to touch it.

<a id="wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| ZA-AC01 | All of the project's automated quality checks pass: code rules and formatting, types, the application build, and automated tests including the tests on a real database. | Full run of the quality checks |
| ZA-AC02 | Code created or moved in the task belongs to the module that owns its data and rules, and uses modules only through their public operations, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). | Code review |

<a id="model"></a>

## Shared rules

Cited by ID from the tasks.

| ID | Rule |
| --- | --- |
| ZA-R01 | **Assignment status.** An assignment is in progress, needs attention, succeeded or failed. Succeeded and failed are final. (Q10; partially succeeded is put off with the batch type, owner 2026-11-20) |
| ZA-R02 | **Operation state.** An operation is pending, running, succeeded, failed or uncertain. A pending operation waits either for the budget or for its executor. A failed operation carries a cause and whether it may be retried. (Q18) |
| ZA-R03 | **One winner.** Every change of an assignment's status, by the owner or by the AI module itself, checks the current status in the same save. The first change wins; a later one that no longer fits changes nothing. (Q94) |
| ZA-R04 | **Cost of an operation.** An operation has one potential cost and one actual cost. An actual cost that cannot be established is unknown, never zero. The budget charge of an operation is its actual cost when known and its potential cost otherwise, counted from the moment the operation starts. An operation that never started charges nothing. (Q8, Q36, Q37) |
| ZA-R05 | **Why an assignment failed.** A failed assignment records one reason for the owner: rejected by the owner, time limit exceeded, or result not taken by the requesting module. The requesting module never receives the reason. (Q6, Q77) |

<a id="t1"></a>

## T1. A requesting module places an assignment and reads its status (`oferty-pracy-sq2.2`)

Source: group A of the interview, Q102.

### Scope

The new public contract of the AI module for requesting modules: placing an assignment and reading its status. The task adds the assignment and its first operation; nothing carries the operation out yet ([T3](#t3)). The task also writes down what each of the two executors declares, as far as placing needs it (T2-R01): its assignment types, parameters, price list and whether it is configured; [T2](#t2) adds the maximum run times and the carrying out. The existing contract stays in use until [T10](#t10).

Out of scope: the check before a request, which today may call the provider and fixes the version of a local model for the work. No requesting module uses a local model today; an assignment is placed without it, and the local executor fixes what it needs when an operation starts. It returns with the design of local executors in `oferty-pracy-334` (owner, 2026-11-21).

### Requirements

| ID | Requirement |
| --- | --- |
| T1-R01 | **Placed in the requesting operation.** A requesting module places an assignment as part of its own save. When that save is rolled back, the assignment does not exist. |
| T1-R02 | **What an assignment carries.** The requesting module gives: the name of its settings (which the AI module uses to find the executor, its parameters and, later, the result receiver), the assignment type (single answer or agent session), a label for the owner, the instruction, the input and, optionally, a response format the executor is to follow. An agent assignment also gives the allowed tools and the instruction for writing the result. The AI module does not interpret the label. (Q2, Q15, Q34, Q84) |
| T1-R03 | **Frozen.** Everything of T1-R02, the executor and its parameters are fixed when the assignment is placed and never change; every operation of the assignment uses them. Different input or settings need a new assignment. (Q4, Q73) |
| T1-R04 | **Refusals.** Placing is refused with a defined error, and nothing is created, when: the settings name is unknown or incomplete; the executor does not offer the assignment type; a parameter is outside the executor's catalogue; the executor lacks its configuration (secret, address); an agent tool is unknown; the label, instruction or input is empty; or, when the requesting module asked for this check, the request is larger than the executor's price list covers. (Q65; the last one keeps today's refusal of an oversized assessment) |
| T1-R05 | **Start.** A placed assignment is in progress and has one pending operation. It records the moment it was placed and its time limit ([T6-R06](#t6)). (Q18a) |
| T1-R06 | **No knowledge of the requesting module's matters.** The AI module stores no identifier of the requesting module's own matter and does not limit how many assignments a module places for one matter. The requesting module keeps the assignment's identifier. (Q3, Q34) |
| T1-R07 | **Status read.** A requesting module reads the status (ZA-R01) of one or many assignments by their identifiers. The read gives no operations, costs, causes or reasons. An unknown identifier is reported as not found. (Q102) |
| T1-R08 | **Can assignments be placed.** A requesting module can ask, without any provider being called, whether assignments of a given type can be placed under its settings name now. |
| T1-R09 | **Agent session's shared rules.** The AI module's contract keeps the list of tools an agent assignment may ask for, the rule for a safe source address and the shape of the materials an agent gathers, as they are today; a requesting module that validates sources reads the same rule. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T1-AC01 | An assignment placed in a committed save exists, in progress, with one pending operation; one placed in a save that is rolled back does not. (T1-R01, T1-R05) | Automated test on a real database |
| T1-AC02 | A single and an agent assignment keep every value of T1-R02 with the executor and parameters found for the settings name; changing the settings afterwards does not change the stored assignment. (T1-R02, T1-R03) | Automated test on a real database |
| T1-AC03 | Each case of T1-R04 returns its error and leaves no assignment and no operation. (T1-R04) | Automated test on a real database |
| T1-AC04 | Two assignments placed with the same input under the same settings name both exist. (T1-R06) | Automated test on a real database |
| T1-AC05 | The status read returns the status of each known identifier of a list and reports an unknown one as not found; its result holds nothing beyond identifier and status. (T1-R07) | Automated test and code review |
| T1-AC06 | The question of T1-R08, asked for the single and for the agent type, answers yes for complete settings and no for each configuration gap of T1-R04, with no provider called. (T1-R08) | Automated test |
| T1-AC07 | The contract of assignments exposes the tool list, the source address rule and the shape of materials with today's content; placing refuses a tool outside the list. (T1-R09) | Automated test and code review |

<a id="t2"></a>

## T2. Executors behind a shared interface (`oferty-pracy-sq2.3`)

Source: the executor notes of the interview (Q55′–Q65), Q103, Q104. Depends on [T1](#t1).

### Scope

The paid executor and the local executor carry out operations through one interface. The inner design of executors belongs to `oferty-pracy-334`. In the first version an executor exists in code only: it cannot be switched off and has no stored settings (owner, 2026-11-20; collection task `oferty-pracy-sz5`, item 30).

### Requirements

| ID | Requirement |
| --- | --- |
| T2-R01 | **What an executor declares.** Its services by assignment type, the models and settings an assignment may ask for, its price list with the exchange rate, and the maximum run time of each service. (Q55′, Q90) |
| T2-R02 | **What an executor knows.** It receives the frozen content of the assignment and carries out one operation. It knows no assignment, budget or requesting module. (Q103) |
| T2-R03 | **Outcome.** An operation ends in exactly one of four ways: a result; an ordinary failure, which may be retried; a non-retryable failure; or uncertain, when the executor cannot tell how the work ended. Every way but the result carries a cause from one closed list of the AI module, the same for all executors. The executor alone decides which of the four an event of its technology means. (Q13, Q17, Q103) |
| T2-R04 | **Usage.** With every outcome the executor reports the usage it knows; the AI module computes the actual cost from it and the price list valid when the operation started. Missing usage after the provider was called leaves the cost unknown. (Q90, ZA-R04) |
| T2-R05 | **Maximum run time.** The executor ends its own work when the maximum run time passes and reports an ordinary failure. Every maximum run time is shorter than the time limit of the executor's queue. (Q45; owner, 2026-11-20) |
| T2-R06 | **The two executors.** The paid executor offers the single answer and the agent session with web search; the local executor offers the single answer on the local model. Their requests to the providers, their limits per request to the provider (90 seconds for a paid single answer, 120 seconds for each step of an agent session) and the materials an agent gathers with their source rules stay as they are today. The maximum run times are: 2 minutes for a paid single answer, 15 minutes for a paid agent session (owner, 2026-11-21; today's session of two steps takes at most about 4 minutes) and 30 minutes for the local executor (owner, 2026-11-20; today it has none). While an agent session runs, the paid executor's other operations wait ([T3-R01](#t3)). |
| T2-R07 | **No check of the result.** For an assignment, the AI module passes the response format to the executor and does not check the result against it. A response the executor cannot read at all is the executor's failure. (Q80, Q84) |
| T2-R08 | **Exchange kept.** Each operation keeps the exact request sent to the provider and each raw response received, saved before the request is sent and before the response is read. (owner, 2026-11-20: always, replacing today's optional archive; Q83) |
| T2-R09 | **Same rules for all.** Statuses, retries, budget, time limit and delivery are the same for every executor; the AI module's handling of assignments has no rule for a particular executor. (Q104) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T2-AC01 | Each executor's declaration lists its services, parameters, prices and maximum run times, and placing ([T1-R04](#t1)) refuses what the declaration does not offer. (T2-R01) | Automated test |
| T2-AC02 | For each event in the mapping table of the solution design, the paid and the local executor return the listed outcome, cause and usage. (T2-R03, T2-R04) | Automated test with simulated providers |
| T2-AC03 | An operation of a simulated provider that does not answer ends as an ordinary failure once the maximum run time passes; every declared maximum run time is below the queue's time limit. (T2-R05) | Automated test and code review |
| T2-AC04 | A paid single answer, a paid agent session and a local single answer with simulated providers send the same provider requests as before the task and return their result, and the agent its materials. (T2-R06) | Automated test |
| T2-AC05 | A result that does not follow the response format is returned as a result. (T2-R07) | Automated test |
| T2-AC06 | After an operation, the request sent and every raw response are stored with it, also when the response could not be read. (T2-R08) | Automated test on a real database |
| T2-AC07 | In the code of assignments, nothing outside the executors and the settings of requesting modules names a provider, an executor or a provider's fact; the executors' code reads no assignment, budget or requesting module. (T2-R02, T2-R09) | Code review |

<a id="t3"></a>

## T3. Operations start in order and within the budget (`oferty-pracy-sq2.4`)

Source: groups B and F of the interview; owner, 2026-11-20. Depends on [T2](#t2).

### Scope

Carrying out pending operations: their order, the budget check at the start and the end of an operation with its settlement. What follows the end belongs to [T4](#t4) (a failure) and [T6](#t6) (a result); until those tasks an assignment whose operation ended stays in progress.

### Requirements

| ID | Requirement |
| --- | --- |
| T3-R01 | **One at a time per executor.** Each executor carries out at most one operation at a time in the whole system; operations of different executors run at the same time. An executor takes its operations in the order they began to wait for it. (owner, 2026-11-20; Q41, Q42) |
| T3-R02 | **Budget at the start.** When an operation is about to start, its potential cost is computed from the executor's price list valid at that moment. The operation starts only when the budget of the current month has room for it; the check and the charge are one save, so two operations starting together cannot both take the last room. A started operation belongs to the month it started in. (Q18b, Q87, Q90) |
| T3-R03 | **Free work.** An operation whose potential cost is zero charges nothing and never waits for the budget. (Q89) |
| T3-R04 | **Waiting for the budget.** An operation the budget has no room for stays pending, waiting for the budget. It does not hold its executor: later operations the budget covers, and free ones, start. (Q43) |
| T3-R05 | **Room appears.** When the budget gets room (a higher limit, a new month, or a settlement below the potential cost), operations waiting for the budget begin to wait for their executor within two minutes, oldest first, as far as the room reaches; a cheaper later one may pass a dearer earlier one. Such an operation joins the end of its executor's line. (owner, 2026-11-20; replaces Q43, which kept its place) |
| T3-R06 | **Carrying out.** A started operation calls its executor once. Its end is one save: the state, the result or cause, the usage, the actual cost or unknown, and with them the budget charge (ZA-R04). (Q46) |
| T3-R07 | **Budget month.** A month is a calendar month in Polish time. The first operation that needs a month's budget creates it with the default limit. (Q85; default limit: [T13](#t13)) |
| T3-R08 | **Cost of an assignment.** The AI module computes for an assignment the sum of its operations' potential costs, the sum of their known actual costs, its budget charge and the number of its operations with an unknown cost; the panel shows them from [T11](#t11). (Q35) |
| T3-R09 | **Budget read.** A read of the AI module gives every month that has a budget, newest first, with its limit, the amount settled (known actual costs) and the amount held (the potential costs of running operations and of operations with an unknown cost); the month's charge is their sum. The budget card of the profile page uses it from [T10-R06](#t10), and the panel from [T13](#t13). |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T3-AC01 | Two assignments for the paid executor are carried out one after the other in the order placed; one for the paid and one for the local executor run at the same time. (T3-R01) | Automated test on a real database |
| T3-AC02 | An operation starts with its potential cost charged to the current month; with room for one, two operations starting together leave one running and one waiting for the budget; a price change after the start does not change the started operation's costs. (T3-R02) | Automated test on a real database |
| T3-AC03 | With no room in the budget, an operation of the local executor starts and charges nothing. (T3-R03) | Automated test on a real database |
| T3-AC04 | With room for the second of two paid operations only, the second runs while the first waits for the budget. (T3-R04) | Automated test on a real database |
| T3-AC05 | After the limit is raised, and after the month changes, a pass of the periodic process lets waiting operations start, oldest first as far as the room reaches, and leaves the rest waiting. (T3-R05) | Automated test on a real database |
| T3-AC06 | An operation with a result, with a failure and with missing usage each end in one save with the state, the cost (known, known, unknown) and the month's charge of ZA-R04; the executor was called once. (T3-R06) | Automated test on a real database |
| T3-AC07 | An operation started one second before midnight of a month's last day in Polish time belongs to that month, also when it ends in the next; the first start in a month without a budget creates it with the default limit. (T3-R07) | Automated test on a real database |
| T3-AC08 | An assignment with a settled, an unknown-cost and a never-started operation gives the four figures of T3-R08 when they are computed. (T3-R08) | Automated test on a real database |
| T3-AC09 | The budget read returns two months, newest first, each with its limit, settled and held amounts by T3-R09. (T3-R09) | Automated test on a real database |

<a id="t4"></a>

## T4. Automatic retries and "needs attention" (`oferty-pracy-sq2.5`)

Source: groups A, C and D of the interview. Depends on [T3](#t3).

### Scope

What happens to an assignment after one of its operations ends without a result: a further automatic operation or the status needs attention. Delivery of a result is [T6](#t6); the owner's Retry is [T12](#t12).

### Requirements

| ID | Requirement |
| --- | --- |
| T4-R01 | **Automatic operations.** An assignment gets at most 3 operations without the owner, the first one included. (Q13) |
| T4-R02 | **Retry.** When an automatic operation ends with an ordinary failure and fewer than 3 automatic operations exist, the assignment stays in progress and a new pending operation is added in the same save, with no delay. (Q13; a delay is item 10 of `oferty-pracy-sz5`) |
| T4-R03 | **Needs attention.** The assignment moves to needs attention when: its third automatic operation fails; an operation ends with a non-retryable failure; or an operation ends uncertain. Nothing of the assignment runs or waits while it needs attention. (Q1, Q13, Q17) |
| T4-R04 | **No blocking.** An operation that ended, also as uncertain, no longer holds its executor; other assignments are not affected. (Q66) |
| T4-R05 | **Unavailable executor.** An executor that cannot be reached is an ordinary failure. (Q69) |
| T4-R06 | **Work that could not start.** When the background work of a pending operation fails finally before the operation started, the operation ends as an ordinary failure with nothing charged, and T4-R02 or T4-R03 applies. (owner, 2026-11-20) |
| T4-R07 | **One retry rule.** An operation calls its provider once for each request it has to make; nothing in the handling of assignments or in an executor repeats a call after a provider's transient error, as the old way does once. T4-R02 is the only retry. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T4-AC01 | An assignment whose executor fails ordinarily twice and then answers ends its third operation with a result; the three operations use the same frozen content. (T4-R01, T4-R02) | Automated test on a real database |
| T4-AC02 | Three ordinary failures, one non-retryable failure and one uncertain end each leave the assignment in needs attention with no pending or running operation. (T4-R03) | Automated test on a real database |
| T4-AC03 | After an operation of the paid executor ends uncertain, the next assignment for that executor is carried out. (T4-R04) | Automated test on a real database |
| T4-AC04 | An executor whose provider cannot be reached gives an ordinary failure, and the assignment gets its next operation. (T4-R05) | Automated test |
| T4-AC05 | A pending operation whose background work fails on every attempt before the start ends as an ordinary failure with no charge, and the assignment gets its next operation. (T4-R06) | Automated test on a real database |
| T4-AC06 | No code of assignments or executors repeats a provider call inside one operation after a transient error. (T4-R07) | Code review |

<a id="t5"></a>

## T5. Interrupted operations (`oferty-pracy-sq2.6`)

Source: Q44, Q66, Q68; owner, 2026-11-20 (replaces Q67 and Q71). Depends on [T3](#t3).

### Scope

The end of an operation whose work stopped without an outcome. Out of scope: repeating such an operation automatically (collection task `oferty-pracy-sz5`, item 31).

### Requirements

| ID | Requirement |
| --- | --- |
| T5-R01 | **Interrupted means uncertain.** A running operation whose work stopped without an outcome (its process was ended or lost, the application was deployed, or the queue's time limit passed) ends as uncertain, and the assignment needs attention ([T4-R03](#t4)). The executor is not called again. The AI module does not work out why the work stopped. |
| T5-R02 | **Cost.** The interrupted operation's actual cost is unknown, and its potential cost stays charged to its month. (Q68) |
| T5-R03 | **When.** The operation is ended this way within five minutes of the loss of its process. |
| T5-R04 | **Late process.** A process that returns after its operation was ended changes nothing and delivers nothing. What it received from the provider is already kept with the operation (T2-R08). |
| T5-R05 | **No automatic repeat.** No service repeats an interrupted operation by itself, also when nothing had been sent to the provider yet (owner, 2026-11-21; collection task `oferty-pracy-sz5`, item 31). |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T5-AC01 | After the worker is killed during an operation, and after an operation outlasts a short queue time limit, the operation is uncertain with an unknown actual cost and its potential cost charged, the assignment needs attention, and the provider was called once. (T5-R01, T5-R02) | Automated test on a real database |
| T5-AC02 | The same holds, within five minutes of the kill, when the worker is killed during the last attempt of the background work. (T5-R01, T5-R03) | Automated test on a real database |
| T5-AC03 | A result saved after its operation was ended as uncertain changes neither the operation nor the assignment, and the raw response is stored with the operation. (T5-R04) | Automated test on a real database |
| T5-AC04 | No executor declares, and no code performs, a repeat of an interrupted operation; an operation interrupted before anything was sent also ends uncertain. (T5-R05) | Automated test and code review |

<a id="t6"></a>

## T6. One result delivery and the time limit (`oferty-pracy-sq2.7`)

Source: groups B and E of the interview; owner, 2026-11-20 and 2026-11-21 (after the [review](../../research/sq2-egm-review/consolidated_review_report.md)). Depends on [T4](#t4).

### Scope

How a requesting module learns of the end of its assignment, and the time limit of an assignment. Out of scope: delivering again a result that was not taken (collection task `oferty-pracy-sz5`), a time limit chosen by the requesting module (item 32) and abandonment (item 34).

### Requirements

| ID | Requirement |
| --- | --- |
| T6-R01 | **Receiver.** The AI module defines the receiver of an assignment's end as part of its contract, and each requesting module provides one for its settings name. A receiver has two entries: a result, with the materials of an agent session, and a failure. Neither returns anything, and a failure carries no reason. (Q79; owner, 2026-11-21) |
| T6-R02 | **Always through the receiver, in the same save.** A requesting module learns of every end of its assignment, a result or a failure, through its receiver. The receiver's own saves and the assignment's final status are saved together or not at all, wherever the end is decided: after an operation, on the owner's Reject, or at the time limit. (owner, 2026-11-21; replaces the delivery of 2026-11-20 by separate background work) |
| T6-R03 | **Delivery of a result.** When an operation of an assignment in progress ends with a result, the result is delivered at once, in the same process, without waiting for anything else. With the receiver's saves the assignment succeeds. (Q77) |
| T6-R04 | **Result not taken.** When the receiver raises an error on a result, or none is provided, nothing of that call is saved; the assignment fails with the reason "result not taken", and the requesting module, when it has a receiver, gets the failure in the same save. The operation's cost stays as settled. (Q77, Q78) |
| T6-R05 | **Error on a failure.** When the receiver raises an error on a failure, the assignment's end is not saved either, and it is tried again: by the owner using Reject again ([T12-R06](#t12)), by the next check of the time limit a minute later, or by the next attempt of the background work after an operation. The error is logged. An assignment whose receiver always fails stays unfinished. (owner, 2026-11-21) |
| T6-R06 | **Time limit.** Every assignment has the same time limit of 7 days (owner, 2026-11-20; the value was left open in Q53), counted from the moment it was placed, also while it needs attention. (Q50, Q51; a limit chosen by the requesting module is item 32 of `oferty-pracy-sz5`) |
| T6-R07 | **Past the limit.** Within two minutes after the limit passed, an assignment that is in progress or needs attention fails with the reason "time limit exceeded", its pending operations end without having started, and its requesting module gets the failure (T6-R02). Two kinds of assignment are left alone: one with a running operation, and one in progress that has an operation ended with a result, whose delivery is still to be made. (Q52; owner, 2026-11-21, for the second) |
| T6-R08 | **Past the limit, operation running.** A running operation is not stopped. When it ends with a result, T6-R03 applies and the assignment can succeed. When it ends any other way, the assignment gets no further operation, and T6-R07 fails it. (Q52) |
| T6-R09 | **Receiver's behaviour.** A receiver called again with the same end changes nothing more. It uses only what the call gives it and asks the AI module nothing. A requesting module does not assume that it learns of an end at the moment the end happened. (owner, 2026-11-21) |
| T6-R10 | **Interrupted delivery.** When the process stops between the end of an operation with a result and its delivery, the delivery is made by the next attempt of the same background work, without calling the executor. |
| T6-R11 | **Status read.** The status read ([T1-R07](#t1)) stays for showing that work is in progress; no requesting module learns of an end from it. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T6-AC01 | An assignment whose operation returns a result ends succeeded, its receiver was called once with the result (an agent's with its materials), and what the receiver saved is in the database; the delivery is made while the other executor carries out an operation and with no other background work. (T6-R01, T6-R02, T6-R03) | Automated test on a real database |
| T6-AC02 | With a receiver that raises an error on a result, the assignment ends failed with the reason "result not taken", none of the saves of the result call remain, the failure entry was called and its saves are in the database, and the operation's cost is as settled. With no receiver provided, the assignment ends failed with the same reason. (T6-R04) | Automated test on a real database |
| T6-AC03 | With a receiver that raises an error on a failure, an assignment past its time limit stays as it was after a pass of the periodic process, and the error is logged; once the receiver works, the next pass fails the assignment and the receiver's saves are in the database. (T6-R05) | Automated test on a real database |
| T6-AC04 | An assignment waiting for the budget and one needing attention, both past the limit, fail with the reason "time limit exceeded" after a pass of the periodic process, their receivers got the failure with no reason, and their pending operations charge nothing; one not yet past the limit is not changed. (T6-R06, T6-R07) | Automated test on a real database |
| T6-AC05 | Past the limit, an assignment with a running operation and one in progress with an operation ended with a result are not changed by a pass of the periodic process. (T6-R07) | Automated test on a real database |
| T6-AC06 | With an operation running past the limit: a result gives a succeeded assignment; an ordinary failure gives no new operation and, after a pass of the periodic process, a failed assignment with the reason "time limit exceeded". (T6-R08) | Automated test on a real database |
| T6-AC07 | The contract of the receiver states the three rules of T6-R09, and a test receiver that follows them, called twice with the same result and twice with the same failure, leaves the same data as after one call. (T6-R09) | Automated test on a real database and code review |
| T6-AC08 | After the worker is killed between the end of an operation with a result and its delivery, the assignment ends succeeded with the receiver's saves present and the executor called once. (T6-R10) | Automated test on a real database |

<a id="t7"></a>

## T7. Profile on the new contract (`oferty-pracy-sq2.8`)

Source: Q108. Depends on [T6](#t6).

### Scope

The Profile's preparation of a proposal from a CV moves to assignments. The Profile's own check of a proposal (quotes, format) keeps its rules (collection task `oferty-pracy-sz5`, item 35). The old contract is still present for the other modules until [T10](#t10).

### Requirements

| ID | Requirement |
| --- | --- |
| T7-R01 | **Proposal by assignment.** Preparing a profile proposal from a CV places one single-answer assignment in the save that marks the preparation as started, labelled with the CV's file name, and the Profile keeps the assignment's identifier with the text revision it was placed for. |
| T7-R02 | **One preparation per CV.** The Profile itself allows at most one preparation in progress for a CV; a second request is refused as today. |
| T7-R03 | **Taking the result.** The Profile's receiver checks the result against its own format and rules (the quotes must be found in the CV text) and saves the proposal for the revision the assignment was placed for; a result for an older revision does not replace a newer proposal. A proposal that does not pass these checks is the Profile's own matter: the receiver takes the result without an error, the assignment succeeds, and the Profile records which check failed. On a result and on a failure alike the receiver ends the preparation, so a new one can be requested ([T6-R02](#t6)). (Q80) |
| T7-R04 | **What the owner sees.** While the assignment is in progress or needs attention: "Przygotowywanie propozycji". The end has the label "Wymaga sprawdzenia" with one of three messages. A proposal whose quotes are not found in the CV text keeps today's message "Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian." A proposal that is not in the Profile's format keeps today's message "Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian." A failed assignment gives the new message "Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI." (owner, 2026-11-21; it replaces the single message of 2026-11-20). The labels "Czeka na przygotowanie propozycji" and "Czeka na środki w budżecie" and the messages chosen by the cause of an AI failure are gone. "Wymaga konfiguracji AI" stays for T1-R08. |
| T7-R05 | **No resuming.** The Profile no longer requests AI work again by itself, at start or periodically; retries belong to the AI module. |
| T7-R06 | **Kept.** Importing a CV, applying a proposal to the draft, reading saved proposals and the budget card on the profile page keep working; the card reads the earlier records until [T10-R06](#t10). |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T7-AC01 | Requesting a preparation places one assignment and stores its identifier; rolling the request back leaves neither; a second request for the same CV while the first is in progress is refused. (T7-R01, T7-R02) | Automated test on a real database |
| T7-AC02 | With a simulated provider a correct result gives a proposal for the right revision; a proposal with a quote not in the text, and one not in the format, each leave the assignment succeeded and the preparation ended in the Profile with its own message of T7-R04; a result for an older revision does not replace a newer proposal. (T7-R03) | Automated test on a real database |
| T7-AC03 | The profile page shows the texts of T7-R04 for an assignment in progress and needing attention, for a failed assignment, for a proposal with an unconfirmed quote and for one outside the format; a preparation with an assignment never shows one of the removed texts. (T7-R04) | Automated test of the view's state, and the page requested from the running application in the sandbox |
| T7-AC04 | No Profile operation requests AI work without the owner's request; the periodic process has no Profile step. (T7-R05) | Code review |
| T7-AC05 | The existing tests of CV import, of applying a proposal and of reading proposals pass; the budget card still lists its months. (T7-R06) | Automated tests |
| T7-AC06 | To prepare a proposal the Profile uses only the operations of [T1](#t1) and the receiver of [T6-R01](#t6) of the AI module; it requests nothing through the old way any more, and learns of an end only through its receiver. (T7-R01, T7-R03, T6-R11) | Code review |
| T7-AC07 | After a failure reaches the Profile's receiver, the preparation is ended with the message for a failed assignment, and a new preparation of the same CV can be requested. (T7-R03) | Automated test on a real database |
| T7-AC08 | The Profile's receiver, called twice with the same result and twice with the same failure, leaves the same data as after one call. ([T6-R09](#t6)) | Automated test on a real database |

<a id="t8"></a>

## T8. Matching on the new contract (`oferty-pracy-sq2.9`)

Source: Q108, Q114; owner, 2026-11-20. Depends on [T6](#t6).

### Scope

Matching's AI assessments move to assignments, one per offer, with ordinary requests. Out of scope: an assignment for a batch of offers (item 29), the provider's batch mode (item 16) and the rules for local assessments in groups (`oferty-pracy-0dv`).

### Requirements

| ID | Requirement |
| --- | --- |
| T8-R01 | **One assignment per offer.** Every AI assessment is its own single-answer assignment with an ordinary request, labelled with the offer's title and employer. Assessing several offers at once (up to 100, as today) places one assignment per offer in one save: all are placed or none. |
| T8-R02 | **No group in the AI module.** The group of one command stays a concept of Matching. The AI module funds each assignment on its own: those the budget covers run, the rest wait ([T3-R04](#t3)). The rule "a group gets its budget as a whole" is gone. |
| T8-R03 | **Taking the result.** Matching's receiver checks the result against its own format and its evidence rules and publishes the assessment when the profile version and the ad revision still allow it, as today. An assessment that does not pass these checks is Matching's own matter: the receiver takes the result without an error, the assignment succeeds, and the assessment ends as failed in Matching. On a failure the receiver ends the assessment as failed. (Q80, [T6-R02](#t6)) |
| T8-R04 | **What the owner sees.** In progress or needs attention: "Ocena w toku". Succeeded and published: "Ocena gotowa". After a failed assignment, or an assessment that did not pass Matching's own check: "Ocena nie powiodła się". The texts "Czeka na budżet", "W kolejce", "Wymaga sprawdzenia", "Wysyłka lub koszt wymagają sprawdzenia" and "Grupa czeka na budżet." are gone from the offer views (the Profile's label "Wymaga sprawdzenia" is another one and stays). In the offer list a failed assessment keeps today's short label "Błąd oceny", and the list's filter keeps its options until T10. |
| T8-R05 | **Oversized offer.** An assessment whose request exceeds what the price list covers is refused when placed (T1-R04), as today. |
| T8-R06 | **Kept.** Manual assessments, excluding an offer from assessment, ratings and weights, and the refresh of the offer list while assessments are in progress keep working; the refresh uses the status read of T1-R07. |
| T8-R07 | **Provider exchange of an assessment.** The view of what was sent to the provider and what came back shows, for an assessment made after deployment, the exchange kept with its assignment's operations (T2-R08). |
| T8-R08 | Moved to [T10-R08](#t10): what the history shows for assessments made before deployment. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T8-AC01 | A command for 30 offers places 30 assignments, each with its own label, and stores each identifier with its assessment request; a failure while placing leaves none. (T8-R01) | Automated test on a real database |
| T8-AC02 | With room in the budget for 2 of 5 assessments, 2 are carried out and published while 3 stay in progress; after the limit is raised they are carried out. (T8-R02) | Automated test on a real database |
| T8-AC03 | With a simulated provider: a correct result is published; a result outside the format, and one whose evidence fails, give a failed assessment with the assignment succeeded; a result for a replaced profile version is not published. (T8-R03) | Automated test on a real database |
| T8-AC04 | The offer views show the texts of T8-R04 for an assessment with an assignment in each status, and never one of the removed texts for it. (T8-R04) | Automated test of the view's state, and the page requested from the running application in the sandbox |
| T8-AC05 | An oversized assessment is refused with nothing placed. (T8-R05) | Automated test |
| T8-AC06 | The existing tests of manual assessments, exclusions, ratings and weights pass; the offer list stops refreshing when no assessment is in progress. (T8-R06) | Automated tests |
| T8-AC07 | The exchange view of a new assessment shows the request and the raw response of each of its operations. (T8-R07) | Automated test on a real database |
| T8-AC08 | To assess offers Matching uses only the operations of [T1](#t1), the receiver of [T6-R01](#t6) and the exchange read of the AI module; it requests nothing through the old way any more, nothing in Matching requests a provider batch, and it learns of an end only through its receiver. (T8-R01, T8-R03, T8-R07, T6-R11) | Code review |
| T8-AC09 | Moved to T10-AC06. |
| T8-AC10 | After a failure reaches Matching's receiver, the assessment shows as failed. (T8-R03) | Automated test on a real database |
| T8-AC11 | Matching's receiver, called twice with the same result and twice with the same failure, leaves the same data as after one call. ([T6-R09](#t6)) | Automated test on a real database |

<a id="t9"></a>

## T9. Companies on the new contract (`oferty-pracy-sq2.10`)

Source: Q108. Depends on [T6](#t6).

### Scope

Company research moves to an agent assignment. Out of scope: the rules for research by a local agent (`oferty-pracy-rss`).

### Requirements

| ID | Requirement |
| --- | --- |
| T9-R01 | **Research by assignment.** Company research places one agent assignment with web search, labelled with the company's name, in the save that records the research request, and Companies keeps the assignment's identifier. |
| T9-R02 | **Taking the result.** Companies' receiver validates the report and its sources by its own rules, as today, and saves it. A report that does not pass is Companies' own matter: the receiver takes the result without an error, the assignment succeeds, and the research ends as failed in Companies. On a result and on a failure alike the receiver ends the research, so a new one can be requested. (Q80, [T6-R02](#t6)) |
| T9-R03 | **What the owner sees.** In progress or needs attention: "Trwa zbieranie źródeł i przygotowywanie raportu". After a failed assignment, or a report that did not pass Companies' own check: "Nie udało się przygotować raportu". The texts "Czeka na dostępny budżet", "Czeka na wykonanie" and "Przerwano — koszt wymaga sprawdzenia" and the reserved amount are gone (owner, 2026-11-20: the cost is in the AI assignments panel). |
| T9-R04 | **Kept.** Reusing an existing report and an explicit refresh keep working; Companies itself allows one research in progress per company. |
| T9-R05 | Moved to [T10-R08](#t10): what the history shows for research done before deployment. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T9-AC01 | Requesting research places one agent assignment and stores its identifier; a second request for the same company while the first is in progress places nothing. (T9-R01, T9-R04) | Automated test on a real database |
| T9-AC02 | With a simulated provider a valid report is saved with its sources; an invalid one gives failed research with the assignment succeeded. (T9-R02) | Automated test on a real database |
| T9-AC03 | The company view shows the texts of T9-R03 for research with an assignment in each status, with no amount and never one of the removed texts for it. (T9-R03) | Automated test of the view's state, and the page requested from the running application in the sandbox |
| T9-AC04 | The existing tests of reusing a report and of an explicit refresh pass. (T9-R04) | Automated tests |
| T9-AC05 | To research a company Companies uses only the operations of [T1](#t1) and the receiver of [T6-R01](#t6) of the AI module; it requests nothing through the old way any more, and learns of an end only through its receiver. (T9-R01, T9-R02, T6-R11) | Code review |
| T9-AC06 | Moved to T10-AC07. |
| T9-AC07 | After a failure reaches Companies' receiver, the research shows as failed, and new research of the same company can be requested. (T9-R02) | Automated test on a real database |
| T9-AC08 | Companies' receiver, called twice with the same result and twice with the same failure, leaves the same data as after one call. ([T6-R09](#t6)) | Automated test on a real database |

<a id="t10"></a>

## T10. Budget migration and removal of the old path (`oferty-pracy-sq2.11`)

Source: Q108, Q113; owner, 2026-11-20. Depends on [T7](#t7), [T8](#t8) and [T9](#t9).

### Scope

The deployment step of the epic: the budget is carried into the new model, unfinished work of the old way is ended, and the old way is removed from the code. Out of scope: deleting the archive, and settling a cost the provider did not report (`oferty-pracy-qld`).

### Requirements

| ID | Requirement |
| --- | --- |
| T10-R01 | **Budget carried over.** Every month that has a budget keeps its limit. Its charge before deployment is carried as two amounts: settled (the settled costs in its earlier records) and held (the reserved amounts of T10-R02). The month's settled and held amounts after deployment are these plus those of the month's operations. (Q113) |
| T10-R02 | **Unfinished work.** AI work of the old path that is unfinished at deployment is ended. Work for which nothing was sent to a provider (waiting for the budget, or waiting in the queue with a reservation) releases its reservation; work that had started, or whose result waited to be taken, keeps its reserved amount in the carried amount. Each requesting module's matter that waited for it shows as failed (T7-R04, T8-R04, T9-R03), and the owner requests it again (owner, 2026-11-20). |
| T10-R03 | **Archive.** The earlier records stay in the database, read by no part of the application; the panel's history starts empty. (Q113; owner, 2026-11-20) |
| T10-R04 | **Old path gone.** The old contract of the AI module, its handling of provider batches, its check of results against the response format, and the old states and causes given to requesting modules no longer exist. The periodic process keeps three steps: operations waiting for the budget (T3-R05), the time limit (T6-R07) and the daily ad syncs. |
| T10-R05 | **Unused fields.** The fields of the former Profile path that no code reads are removed from the archive's structure. (Q106) |
| T10-R06 | **Budget card.** From this task the budget card of the profile page reads its months through the budget read of [T3-R09](#t3) and keeps its layout and texts: "Limit", "Rozliczone" (the settled amount) and "Zarezerwowane" (the held amount). |
| T10-R07 | **Default limit.** The default limit after deployment is the 100 PLN every month has started with so far ([T13-R03](#t13)). |
| T10-R08 | **Earlier work in the modules' histories.** For an assessment made and for research done before deployment, the history shows only what Matching or Companies stored itself: a published assessment and a saved report stay visible; their cost, the entries of earlier AI work that ended without an assessment or a report, and the provider exchange of an earlier assessment are no longer shown. Matching and Companies stop reading the AI module's earlier records. (owner, 2026-11-20) |
| T10-R09 | **Old texts and old view code.** The texts T7-R04, T8-R04 and T9-R03 call gone, the offer list's filter option "Wymaga sprawdzenia", and the code of the Profile, Matching and Companies that shows matters of the old way or receives its results, no longer exist. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T10-AC01 | On a database with earlier records (settled, of unknown cost, waiting for the budget, waiting in the queue, started and unfinished, waiting to be taken), each month's charge after the migration equals the settled costs plus the reserved amounts of those of unknown cost, started or waiting to be taken, and its limit is as it was; the default limit is 100 PLN. (T10-R01, T10-R02, T10-R07) | Migration test on a database with earlier data |
| T10-AC02 | After the migration, a profile preparation, an assessment and a company research that were unfinished show as failed and can be requested again. (T10-R02) | Migration test on a database with earlier data |
| T10-AC03 | After the migration the earlier records are still in the database, and no assignment exists. (T10-R03) | Migration test |
| T10-AC04 | No code uses the old contract, provider batches or the result check; the periodic process runs exactly the three steps of T10-R04; the AI module's description describes the first version. (T10-R04, T10-R05) | Code and documentation review |
| T10-AC05 | After the migration the budget card of the profile page shows each earlier month with the limit and the "Rozliczone" amount it showed before, and a "Zarezerwowane" amount lower than before by exactly the reservations released by T10-R02. (T10-R06) | Migration test on a database with earlier data |
| T10-AC06 | After the migration, an offer with an assessment published before it still shows that assessment; its history shows no cost, no entry of earlier AI work without an assessment and no exchange view for it. (T10-R08) | Migration test on a database with earlier data |
| T10-AC07 | After the migration, a company with a report saved before it still shows that report; its history shows no cost and no entry of earlier research without a report. (T10-R08) | Migration test on a database with earlier data |
| T10-AC08 | None of the texts T7-R04, T8-R04 and T9-R03 call gone is in the application's code, except the Profile's label "Wymaga sprawdzenia"; the offer list's filter has no option "Wymaga sprawdzenia"; no code of the three modules reads the AI module's earlier records or registers a receiver of the old way. (T10-R09) | Code search and review |

<a id="t11"></a>

## T11. AI assignments panel: list and details (`oferty-pracy-sq2.12`)

Source: group H of the interview; owner, 2026-11-20. Depends on [T3](#t3).

### Scope

The page of assignments with its list, details and counter, read-only. Actions are [T12](#t12), the budget is [T13](#t13). Out of scope: filters and the raw response (item 33), bulk actions (item 13), notifications outside the application (item 15).

### Requirements

| ID | Requirement |
| --- | --- |
| T11-R01 | **Place.** The application has a page "Zlecenia AI", reached from the navigation of every page. |
| T11-R02 | **List.** All assignments: those needing attention first, then the others, each group from the newest. A row shows the label, the type, the requesting module, the executor, the status, the time left to the time limit (for an assignment not yet final) and the budget charge. The list is shown 50 rows at a time (owner, 2026-11-20). It has no filters (item 33 of `oferty-pracy-sz5`). (Q97) |
| T11-R03 | **Details.** An assignment's page shows its row data, the reason it failed (ZA-R05), the figures of T3-R08, and its operations from the first: state, what a pending one waits for, the executor's parameters, start and end, potential and actual cost (an unknown one shown as unknown), and the cause of a failure. It does not show the raw response (item 33). (Q98) |
| T11-R04 | **Counter.** The navigation item shows the number of assignments needing attention when it is above zero. (Q101) |
| T11-R05 | **Only the AI module's data.** The panel reads through the AI module's read operations; the requesting module's name comes from the settings name. |
| T11-R06 | **Texts.** Status: "W toku", "Wymaga uwagi", "Udane", "Nieudane". Operation state: "Oczekuje na budżet", "Oczekuje na wykonawcę", "W toku", "Udana", "Nieudana", "Niepewna". Reason of a failed assignment: "Odrzucone przez właściciela", "Przekroczony limit czasu", "Wynik nie odebrany". Type: "Pojedyncza odpowiedź", "Sesja agenta". Any other text of the panel (column headings, the wording of a cause, messages of T12-R06 and T13-R04) is the implementer's, in Polish and in the words of the glossary. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T11-AC01 | With assignments in every status, the list read returns those needing attention first and the rest from the newest, 50 at a time, with the row data of T11-R02. (T11-R02) | Automated test on a real database |
| T11-AC02 | The details read of an assignment with a settled, a failed, an uncertain and a budget-waiting operation returns the data of T11-R03, and no raw response. (T11-R03) | Automated test on a real database |
| T11-AC03 | The page "Zlecenia AI" opens from the navigation of the offers, companies and profile pages, shows the list and opens an assignment's details; the counter shows 2 with two assignments needing attention and nothing with none. (T11-R01, T11-R04) | Automated test of the routes, and the page requested from the running application in the sandbox |
| T11-AC04 | The panel's routes use only the AI module's public read operations. (T11-R05) | Code review |
| T11-AC05 | The list and the details show the texts of T11-R06 for each status, operation state, reason and type. (T11-R06) | Automated test of the view's state |

<a id="t12"></a>

## T12. Retry and Reject (`oferty-pracy-sq2.13`)

Source: groups D and G of the interview. Depends on [T11](#t11), [T4](#t4) and [T6](#t6).

### Scope

The owner's two actions on an assignment. Out of scope: Approve (item 29), Settle (`oferty-pracy-qld`), delivering a result again, and actions outside the panel.

### Requirements

| ID | Requirement |
| --- | --- |
| T12-R01 | **Retry.** Available only for an assignment that needs attention and is within its time limit. It adds one pending operation with the assignment's frozen content, and the assignment is in progress again. The time limit is not extended; the panel shows the time left next to the action. (Q12, Q72, Q73, Q75) |
| T12-R02 | **After a Retry.** When the operation of a Retry ends any way other than a result, the assignment needs attention again at once, whatever the kind of failure. (Q74) |
| T12-R03 | **Reject.** Available for an assignment in progress or needing attention. The assignment fails at once with the reason "rejected by the owner", its pending operations end without having started, and the requesting module gets the failure in the same save ([T6-R02](#t6)). A running operation is not stopped: it ends and is settled, and its result stays with the operation and goes nowhere. (Q28, Q91) |
| T12-R04 | **Changed state.** An action on an assignment whose status no longer allows it changes nothing, and the owner sees "Zlecenie zmieniło stan" with the current status. (Q93) |
| T12-R05 | **Where.** The actions exist in the panel only, on one assignment at a time. (Q92, Q96) |
| T12-R06 | **Reject that cannot be saved.** When the requesting module's receiver raises an error on the failure, the Reject is not saved, the assignment keeps its status, and the owner sees that the Reject did not succeed and can use it again. (owner, 2026-11-21) |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T12-AC01 | Retry on an assignment needing attention adds one operation and makes it in progress with the same time limit; a result then ends it succeeded. (T12-R01) | Automated test on a real database |
| T12-AC02 | An ordinary failure of a Retry's operation returns the assignment to needs attention with no further operation. (T12-R02) | Automated test on a real database |
| T12-AC03 | Reject on an assignment waiting for the budget, and on one needing attention, fails it with its receiver given the failure once, in the same save; Reject while an operation runs fails it at once, and the operation's later result is settled, kept with the operation and not delivered. (T12-R03) | Automated test on a real database |
| T12-AC04 | Retry on an assignment in progress, on a final one and on one past its time limit, and a second Reject, change nothing and return the current status; two Rejects sent together fail the assignment once with one delivery. (T12-R04) | Automated test on a real database |
| T12-AC05 | The details page offers Retry with the time left only when the assignment needs attention, and Reject only while it is not final; after an action that changed nothing it shows "Zlecenie zmieniło stan" and the current status. (T12-R01, T12-R04, T12-R05) | Automated test of the routes, and the page requested from the running application in the sandbox |
| T12-AC06 | With a receiver that raises an error on a failure, Reject leaves the assignment and its operations as they were and returns an error; once the receiver works, Reject fails the assignment. (T12-R06) | Automated test on a real database |

<a id="t13"></a>

## T13. Budget management (`oferty-pracy-sq2.14`)

Source: group F of the interview, Q99. Depends on [T11](#t11) and [T3](#t3).

### Scope

The budget view of the panel and the two limits the owner sets. Out of scope: separate budgets per requesting module, correcting a settlement (item 14) and settling an unknown cost (`oferty-pracy-qld`).

### Requirements

| ID | Requirement |
| --- | --- |
| T13-R01 | **Budget view.** The panel shows for the current month: the limit, the amount spent (known actual costs), the amount held by running operations, the amount charged by operations of unknown cost with their number, the part of these carried from before deployment (T10-R01) when above zero, and what remains, never shown below zero. Earlier months are listed with their limit and charge. (Q99) |
| T13-R02 | **Current limit.** The owner sets the limit of the current month. Any amount of zero or more is accepted, also below what the month already charged; then no paid operation starts until the limit is raised or the month ends (owner, 2026-11-20; Q86 speaks of raising). Unspent money does not pass to the next month. (Q86) |
| T13-R03 | **Default limit.** The owner sets the limit a new month starts with. It is 100 PLN until changed. Changing it does not change the current month. (Q86) |
| T13-R04 | **Invalid amount.** An amount that is not a number, is below zero or has more than two decimal places is refused with a message, and nothing changes. |
| T13-R05 | **Budget card of the profile page.** The card keeps listing the months as T10-R06 left it. |
| T13-R06 | **Top-up takes effect by itself.** After the limit is raised, operations waiting for the budget start without any other action ([T3-R05](#t3)). |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T13-AC01 | For a month with a settled, a running and an unknown-cost operation and a carried amount, the budget read returns the figures of T13-R01, and what remains equals the limit minus the month's charge, or zero when the charge is higher. (T13-R01) | Automated test on a real database |
| T13-AC02 | Setting the current limit changes the current month only; setting it below the charge is accepted and no paid operation starts; the next month starts with the default limit, whatever remained. (T13-R02, T13-R03) | Automated test on a real database |
| T13-AC03 | Setting the default limit changes the limit of a month created afterwards and not the current one; without any change a new month starts with 100 PLN. (T13-R03) | Automated test on a real database |
| T13-AC04 | A text, a negative amount and an amount with three decimal places are each refused with a message and change nothing. (T13-R04) | Automated test |
| T13-AC05 | The panel shows the budget view and both forms; after the owner raises the limit there, an assignment that waited for the budget is carried out within two minutes. The profile page's card shows the same limit for the month, and amounts that add up to the panel's charge. (T13-R01, T13-R05, T13-R06) | Automated test of the routes, and the page requested from the running application in the sandbox |

<a id="open"></a>

## Decisions of 20 November 2026

The owner settled these while the requirements were written; none is open. The IDs are cited from the solution design.

| ID | Decision | Where |
| --- | --- | --- |
| O-1 | The time limit of an assignment is 7 days. | T6-R06 |
| O-2 | Histories of work done before deployment show only what Matching and Companies stored themselves. | T10-R08, T10-R03 |
| O-3 | The current month's limit may be set below what the month already charged. | T13-R02 |
| O-4 | An operation that waited for the budget joins the end of its executor's line. | T3-R05 |
| O-5 | The local executor's maximum run time is 30 minutes. | T2-R06 |
| O-6 | The exact request and raw response are kept for every operation. | T2-R08 |
| O-7 | No reserved amount in the company research view. The Profile's message after a failed assignment; on 2026-11-21 the owner kept the Profile's two messages for a proposal that does not pass its own check. | T7-R04, T9-R03 |
| O-8 | A matter whose AI work was unfinished at deployment shows as failed, and the owner requests it again. | T10-R02 |
| O-9 | Background work that fails on every attempt before its operation started is an ordinary failure with nothing charged. | T4-R06 |
| O-10 | The panel's list shows 50 assignments at a time. | T11-R02 |

The Beads task `oferty-pracy-sq2.1` is an earlier check of the paid executor's code against these rules; its questions are answered by the mapping table of [T2](solution-design.md#t2).
