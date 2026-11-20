# AI assignments — Solution design

Basis: [PRD](PRD.md), [requirements](requirements.md). Builds on the [background work design](../2ba-praca-w-tle/solution-design.md), sections B1 and B6. Binding rules: [architecture rules](../../architecture/moduly-i-zasady-kodu.md).

Section `T<n>` belongs to stage n of the PRD. Decision IDs (`ZA-D..`) are stable. Sections marked *Contract* are constraints once the design is agreed; everything else names the mechanism and leaves names, files and paths to the implementer.

**Status: draft.** A decision marked *Owner* records a choice the owner made, with the source. The owner has not read the contracts and approaches below the decisions. The owner's [decisions of 20 November 2026](requirements.md#open) on the requirements are settled; of the decisions below, only the choice of table in ZA-D08 is still the agent's proposal.

**Code observed** at commit `0f2e0ae` for the AI module and the requesting modules. The queue and worker libraries and the AI module after `oferty-pracy-2ba.6` are taken from the background work design, not from code: that task is not implemented yet.

<a id="wspolne"></a>

## Shared design

### Parts and what each owns

| Part | Owns |
| --- | --- |
| Assignment handling (the AI module's common part) | Assignments and operations with their statuses and states, the order of work, the budget, retries, the time limit, delivery, the owner's actions and the panel's reads. The only code that changes an assignment's status or an operation's state. |
| Executor submodule (one per executor) | Its declaration (services, parameters, price list, maximum run times), carrying out one operation, the translation of its technology's events into the four outcomes, and its own state between the steps of one operation. |
| Settings of requesting modules | The fixed table, in the AI module, from a settings name to the executor, its parameters and the requesting module's display name. Its inner design belongs to `oferty-pracy-334`. |
| Requesting module | Its own matter, the assignment identifier it keeps, its receiver, the check of the result and what its views show. |
| Module plugin of the AI module | Registers the job definitions with their handlers and failure handlers. The plugins of the requesting modules register their receivers. |
| Periodic process | Calls three public operations in turn: operations waiting for the budget, the time limit, the daily ad syncs. |

### Data

Four tables of the AI module. Status, state and reason columns carry a database check on their closed list.

**Assignment.** Identifier; settings name; type (`single`, `agent`); label; instruction; input; response format (nullable); agent options (allowed tools and result instruction; null for `single`); executor name; executor parameters (a JSON value only the executor reads, the check's value included); status (`in_progress`, `needs_attention`, `succeeded`, `failed`); failure reason (null, or `rejected`, `time_limit`, `delivery_failed`); delivery error (nullable text, without secrets); automatic operation limit (3, written at placing); placed at; deadline; delivered at (nullable); finished at (nullable). A database check ties a failure reason to `failed` only.

**Operation.** Identifier; assignment; ordinal within the assignment; origin (`automatic`, `manual`); state (`pending`, `running`, `succeeded`, `failed`, `uncertain`); waits for (`budget`, `executor`; null unless pending); pending since; cause (from the closed list of causes; null for a result); retryable (boolean; null unless failed); potential cost (null until started); actual cost (null while unknown or not started); budget month (null until started); price list used (JSON, written at the start); usage (JSON, nullable); result (JSON, nullable); executor state (JSON, only the executor reads and writes it); started at; finished at.

**Operation exchange.** Operation; sequence; kind (`request`, `response`); content. Written by the executor before it sends and before it reads (T2-R08).

**Budget.** The existing month table (month in the form year-month in Polish time, limit) gets a carried charge column, zero by default (T10-R01). A one-row table holds the default limit.

Nothing stores a sum. A month's charge, an assignment's cost figures and the count of assignments needing attention are computed when read: for an operation with a budget month the charge is the actual cost when not null and the potential cost otherwise (ZA-R04).

### Queues

| Queue | Key mode | Job data | Settings |
| --- | --- | --- | --- |
| Paid executor's queue: the paid AI queue of B6 | Exclusivity, constant key | Operation identifier | As B6: 4 attempts, 30 s delay with backoff, 60 min time limit |
| Local executor's queue: the local-model AI queue of B6 | Exclusivity, constant key | Operation identifier | As B6 |
| Delivery queue (new, created by its own queue migration) | None | Assignment identifier | The queue mechanism's defaults |

Each executor names its queue in its declaration. A job is sent only inside the save that makes its operation wait for the executor, or that makes an assignment deliverable, so the request is rolled back with it (architecture rules, queue in the transaction).

### Decisions

**ZA-D01 (Owner, 2026-11-20). One operation at a time per executor comes from the queue: one queue per executor with exclusivity on a constant key.**
Reason: the owner chose one operation at a time for the first version; the queues of B6 already give it.
Discarded: a number of operations at a time kept by the AI module and set in the panel (Q39, Q46, Q100): put off, item 30 of `oferty-pracy-sz5`. It returns later as the pool size of workers dedicated to one executor's queue (B1-D06), without a change to assignments.

**ZA-D02 (Owner, 2026-11-20). The AI module keeps no line of its own; an operation waiting for its executor is one job in the executor's queue.**
Reason: the PRD's constraint that the AI module keeps no waiting line and no supervision of its own.
Discarded: the module's own ordered line with a selection step (Q38, Q41, Q43): a second mechanism beside the queue.
Consequence: order is the order of sending. An operation that waited for the budget is sent when the budget gets room, so it stands behind operations sent meanwhile; the owner accepted this on 2026-11-20 (T3-R05).

**ZA-D03 (Owner, 2026-11-20). The budget is charged when an operation starts, in the same transaction as the check.**
Reason: Q18b, confirmed for this epic; it changes what B6 leaves, where the reservation is made when work is requested.
Discarded: charging when the assignment is placed (today): money held by work that waits.

**ZA-D04 (Owner, 2026-11-20). An operation found running by a later attempt, or by the failure handler, ends as uncertain; the executor is not called again.**
Reason: B6-D02 and the notes of `oferty-pracy-2ba.1`, points 14 and 26; a declaration that a service may be repeated is put off (item 31).
Discarded: a lease on the operation with a periodic check (`oferty-pracy-0mq.15`, Q71): removed by B6.

**ZA-D05 (Owner, 2026-11-20, on the agent's proposal). The attempts of a queue job never repeat the executor's call; retries are new operations of the assignment.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: one counter of retries (the assignment's limit of 3) instead of two; a second attempt of a job either starts an operation that never started or closes one that was interrupted (ZA-D04).
Discarded: one attempt for the executors' queues: a passing database error before the start would use up one of the assignment's three operations although the provider was not called.

**ZA-D06 (Owner, 2026-11-20, on the agent's proposal). Every delivery is a job of a separate delivery queue without a key.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: Reject (from the web application) and the time limit (from the periodic process) cannot call a receiver, because receivers are registered only in the worker's processes (B1-R15); a result is delivered the same way so that there is one delivery path. The job is sent in the save that makes the assignment deliverable, so no result can be lost between the end of an operation and its delivery.
Discarded: delivering a result inside the operation's handler and only failures through a job (two paths, but a result is delivered without waiting for a free process); delivering through the executor's queue as B6 does (a failure notice would wait behind an hour of research).
Consequence: with the pool size of 2 and both executors busy, a delivery waits for a free process. The worker's pool size is set to 3 in the container configuration.

**ZA-D07 (Owner, 2026-11-20, on the agent's proposal). The old and the new way coexist from T1 to T10.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the requesting modules move one task at a time and the checks must pass between tasks.
Consequences, all removed by T10: a second mechanism (architecture rules, costs); while both exist, a month's room counts the old attempts' charge and the new operations' charge together; the executors' queues carry the job definitions of both ways, which keeps "one at a time" across them.

### Contract: the closed lists

- Assignment status, operation state, failure reason: as in the data above. Requesting modules import the status list from the AI module's public entry; no other list is public.
- Causes: the existing list of the AI module (`refused`, `incomplete`, `no_content`, `format`, `configuration`, `network`, `http`, `aborted`, `model_unavailable`, `context_overflow`, `unknown`) plus `not_started` for a pending operation ended with its assignment and `time_limit_run` for a passed maximum run time. `interrupted` and `adapter_unavailable` are not written any more. The list is no longer public: only the panel's reads return a cause.

### Contract: what follows the end of an operation

One function of assignment handling decides it, in the transaction that ends the operation, after locking the assignment's row. Every caller that ends an operation uses it.

| Operation ended as | Assignment is | Then |
| --- | --- | --- |
| succeeded | in progress | Send a delivery job |
| succeeded | failed (rejected meanwhile) | Nothing; the result stays with the operation |
| failed, retryable, origin automatic, fewer than 3 automatic operations, deadline not passed | in progress | Insert the next operation (pending, waits for executor) and send its job |
| any other failed or uncertain end, deadline not passed | in progress | Status needs attention |
| any failed or uncertain end, deadline passed | in progress | Status failed, reason `time_limit`; send a delivery job |
| anything | not in progress | Nothing |

<a id="t1"></a>

## T1. Placing and reading

Requirements: [T1](requirements.md#t1).

### Approach

- Placing runs in the caller's transaction: it resolves the settings name, validates against the executor's declaration, inserts the assignment (deadline = placed at + the time limit) and its first operation (pending, waits for executor, origin automatic) and sends the operation's job to the executor's queue. Placing many assignments is one call per assignment inside the caller's transaction.
- The size check of T1-R04 uses the executor's own measure of the request it would send, as today's refusal of an oversized request does.
- The status read takes a list of identifiers and returns identifier and status per known one. It takes no row locks.
- The index that allows one execution in progress per matter has no counterpart (T1-R06).

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Place | Independent assignments | Database unavailable: throws, the caller rolls back | A new assignment each time; the requesting module guards its own matter | Refused with a defined error, nothing created (T1-R04) |
| Read status | Reads committed state | — | Same answer | Unknown identifier: reported as not found; an empty list: an empty answer |

### Verification

Integration tests on a real database cover T1-AC01–AC05 and AC07 with a test executor declaration; T1-AC06 is a unit test of the settings and declarations.

<a id="t2"></a>

## T2. Executors

Requirements: [T2](requirements.md#t2).

### Approach

- The existing provider adapters become two executor submodules behind one interface: the declaration, and carrying out one operation given the assignment's frozen content, the operation's saved executor state and two writers (for the exchange and for the executor state). The interface returns an outcome: a result with usage, or one of the three other ways with a cause and the usage known.
- Both writers are conditional on the operation still running. A write that matches nothing tells the executor to stop: nothing more is sent (as the agent's step log does today).
- The paid agent keeps its step log and materials in the executor state column (architecture rules, default storage of adapter state); the materials are read from it for delivery.
- The executor enforces its maximum run time itself, with a timer around the whole operation, in addition to its limits per request.
- Removed from the adapters: the batch cycle, the shared-slot flag, the translation of a lost lease, the transient flag with its suggested wait, and the reconstruction of batch input.
- The result is the content the provider returned, parsed as JSON when the service promised JSON; content that cannot be parsed is the cause `format`. No comparison with the response format is made (T2-R07).

### Contract: mapping of events to outcomes

Derived from the mapping tables of the AI module's description; the rows marked *changed* differ from today.

| What the executor observed | Outcome | Cause | Cost |
| --- | --- | --- | --- |
| A complete answer | Result | — | From usage; unknown without usage |
| The model refused | Non-retryable failure | `refused` | From usage |
| Missing secret or address; a request the provider cannot take at all | Non-retryable failure | `configuration` | Zero: nothing was sent |
| Input beyond the model's context | Non-retryable failure | `context_overflow` | From usage, else unknown |
| An answer stopped before it was complete; no single usable content; content that cannot be read | Ordinary failure | `incomplete`, `no_content`, `format` | From usage, else unknown |
| A connection error before the request was sent; the provider or model cannot be reached | Ordinary failure | `network`, `model_unavailable` | Zero |
| A rate limit or a server error answered by the provider (*changed*: no wait and no second call inside the operation) | Ordinary failure | `http` | Zero for a rate limit; unknown otherwise |
| The maximum run time, or a request's own limit, passed (*changed* for the agent: uncertain today) | Ordinary failure | `time_limit_run` | Unknown when anything was sent |
| A broken connection after the request was sent, with no answer (*changed* for the paid single answer: retried once today) | Uncertain | `network` | Unknown |
| An agent step whose search is still in progress in the answer | Uncertain | `incomplete` | Unknown |
| Any other error | Uncertain | `unknown` | Unknown |

An agent session is never continued by a later operation: a retry starts it from its first step.

### Decision

**ZA-D08 (Owner, 2026-11-20, for keeping it always; Proposal for the table). The exchange is always kept, in a table of the AI module, not in the batch archive table taken over from Matching.**
Reason for always: the owner accepted [O-6](requirements.md#open); the agent's reasoning was one rule instead of an option per requesting module, and that a raw response cannot be recovered later.
Discarded: keeping it only where the requesting module asks (today).
Not weighed: reusing the existing archive table.

### Verification

Unit tests per executor with simulated providers cover each row of the mapping table (T2-AC02), the maximum run time with a provider that does not answer (T2-AC03) and the unchanged provider requests (T2-AC04, compared with the request bodies the existing adapter tests pin). T2-AC06 is an integration test. T2-AC07 is a review.

<a id="t3"></a>

## T3. Start, budget and end

Requirements: [T3](requirements.md#t3).

### Approach

**Handler of an operation's job.**

1. *Start*, one transaction. It locks the operation's row and acts by its state:
   - pending and waiting for the executor, assignment in progress: compute the potential cost from the executor's price list. When it is zero, set running with a potential cost of zero and no budget month. Otherwise lock the current month's row (creating it with the default limit when missing) and compare the potential cost with the limit minus the month's charge. With room: set running, write the potential cost, the month and the price list used. Without room: set waits for budget, commit, end the job.
   - pending, assignment not in progress: end the operation as failed with the cause `not_started`; end the job.
   - running: the interrupted path of [T5](#t5).
   - any other state: end the job without effect.
2. *Carry out*, outside any transaction: call the executor.
3. *End*, one transaction: a conditional write on the operation still running saves the state, cause, retryable flag, usage, result and actual cost; then the function of [what follows the end](#contract-what-follows-the-end-of-an-operation) runs. When the write matches nothing, the handler ends without effect (T5-R04).

**Operations waiting for the budget** (a public operation the periodic process calls). It reads the room of the current month once, then walks the operations that wait for the budget, of assignments in progress, by pending since. For each whose potential cost at today's prices fits the remaining room, it subtracts the cost from the remaining room and, in one transaction, sets waits for executor (conditional on still waiting for the budget) and sends the job. Others are skipped. The charge itself is still made at the start.

### Contract: room in the budget

- Room of a month = limit − carried charge − the sum of the charges of the operations with that budget month (while the old way exists, also minus its attempts' charge, ZA-D07).
- The lock on the month's row makes check and charge one step for all executors (T3-R02).
- Amounts are kept and computed as today, in millionths of a złoty.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Start | Excluded per executor by the queue; the month's row lock orders starts of different executors | No room: waits for budget. Database unavailable: the attempt fails and is retried | A second job for a started or ended operation has no effect, or ends an interrupted one (T5) | Unknown operation: no row, no effect |
| End | Conditional on running; of two ends one is kept | Database unavailable: the attempt fails; the next one finds the operation running (T5) | No effect | — |
| Waiting for the budget | Passes never overlap; a start may take room first, then the sent operation waits for the budget again | A slow pass delays the next | An operation already sent is skipped by the condition | — |

### Verification

Integration tests with the worker library and a test executor cover T3-AC01–AC08; the month boundary uses a controlled clock.

<a id="t4"></a>

## T4. Retries and needs attention

Requirements: [T4](requirements.md#t4).

### Approach

- The rule is the table of [what follows the end](#contract-what-follows-the-end-of-an-operation); this task adds its failure rows.
- The count of automatic operations is the number of the assignment's operations with origin automatic, compared with the limit stored on the assignment.
- **Failure handler of the executors' queues**, called after a job failed finally (B1-R11): a pending operation ends as failed, retryable, cause `unknown`, with no cost; a running one ends as uncertain ([T5](#t5)); then the same function runs. Other states: no effect. It is a conditional write.
- The coordination's single extra attempt after a transient error is removed (T4-R07).

### Verification

Integration tests with a test executor that fails by script cover T4-AC01–AC05; T4-AC06 is a review.

<a id="t5"></a>

## T5. Interrupted operations

Requirements: [T5](requirements.md#t5).

### Approach

- An attempt that finds its operation running (step 1 of the handler) and the failure handler both end it as uncertain with the cause `unknown`, actual cost null, potential cost kept, and run the function of what follows the end, which moves the assignment to needs attention. Exclusivity guarantees that the attempt that left it running has ended or was lost (B1-D03).
- A lost attempt is found by the queue in about 30–90 s (B1-R10), and the next attempt follows the retry delay, which gives T5-R03.
- A late process: its end matches no row. Its responses are in the exchange table already, because the executor writes each before reading it; when even that write matched nothing, the executor stopped (T2).
- Not kept from B6: the delivery of an uncertain end to the requesting module; it now learns nothing until the assignment is final.

### Verification

Integration tests kill a worker during an operation and during the last attempt, and run an operation past a short queue time limit (T5-AC01, AC02); a test saves a result after the operation was ended (T5-AC03).

<a id="t6"></a>

## T6. Delivery and the time limit

Requirements: [T6](requirements.md#t6).

### Approach

**Handler of a delivery job.** It locks the assignment's row in a transaction and acts by what it finds:

- delivered at is set: no effect.
- in progress with a succeeded operation: call the receiver with the assignment identifier and the operation's result (and the agent's materials, read by the executor from its state); set succeeded, delivered at and finished at; commit. An error raised by the receiver, or a missing receiver, rolls the transaction back; a second transaction then sets failed with the reason `delivery_failed`, the error's message and delivered at, conditional on the assignment still being in progress and undelivered.
- failed and undelivered: set delivered at and call the receiver's failure entry in the same transaction; on the receiver's error, roll back and, in a second transaction, set delivered at and the delivery error.

An error that does not come from the receiver's call (the database, the commit) fails the attempt, and the queue retries the job (T6-R09).

**Time limit** (a public operation the periodic process calls). For each assignment in progress or needing attention whose deadline has passed and which has no running operation, one transaction: a conditional write sets failed with the reason `time_limit` and finished at; its pending operations end as failed with the cause `not_started`; a delivery job is sent. An assignment with a running operation is left to the function of what follows the end.

### Contract: receiver

- Registered per settings name in the requesting module's plugin; a second registration of a name throws when the plugin runs.
- Two entries: a result (assignment identifier, result, materials when the type is agent) and a failure (assignment identifier). Neither returns a value; neither receives a cost, a cause or a reason.
- Both run inside the AI module's delivery transaction, so the receiver's writes are saved with the status or not at all. A receiver must not rely on being called at most once before a crash, only on taking effect at most once.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Deliver | The row lock orders it with Reject and the time limit; the one that saves first wins (ZA-R03) | Pool full: the job waits. Database error: retried | Delivered at set: no effect | Unknown assignment: no effect |
| Time limit | Conditional write; an operation that starts between the check and the write keeps running, and its end applies the rule | — | A failed assignment is skipped | — |

### Verification

Integration tests with test receivers (accepting, raising, missing, writing its own row) cover T6-AC01–AC03 and AC07; T6-AC04 uses a long test operation on the paid executor's queue; T6-AC05 and AC06 use a controlled clock.

<a id="t7"></a><a id="t8"></a><a id="t9"></a>

## T7–T9. Requesting modules

Requirements: [T7](requirements.md#t7), [T8](requirements.md#t8), [T9](requirements.md#t9).

### Approach, common

- Each module's integration layer builds the content of T1-R02, places the assignment inside the module's own requesting operation, and stores the identifier in the module's row for the matter: the Profile with the CV import and its text revision, Matching in its assessment request, Companies in its research row. The columns that hold an execution identifier today are replaced.
- Each receiver validates the result with the response format the module already defines (the check the AI module made until now moves here), then applies the rules it already has. A failed check is saved as the module's own failed outcome; the receiver does not raise an error for it, so the assignment succeeds.
- Each module's view state is computed from its own outcome when it has one, otherwise from the status read: in progress and needs attention give the module's "in progress" text, failed gives its failure text.
- Each module guards its own matter against a second request in progress with a conditional write on its own row.

### Per module

- **Profile (T7).** The operation that resumes preparations and its periodic step are removed. The mapping from states and causes to messages shrinks to the three texts of T7-R04.
- **Matching (T8).** The group command loops over its offers and places one assignment each, inside its one transaction. The batch request, the group identifier passed to the AI module and the text about a group waiting for the budget are removed. The exchange view reads the new exchange read of the AI module by assignment identifier. The count that drives the list's refresh comes from the status read over the assessments shown.
- **Companies (T9).** The research request places an agent assignment with the web search tool and its result instruction; the view no longer reads a reserved amount.

### Contract: exchange read

A public read of the AI module for T8-R07: given an assignment identifier, the request and responses of each of its operations, in order. Its one consumer is Matching's exchange view.

### Verification

Each module's existing integration tests are rewritten onto assignments with simulated providers and cover the criteria of its section; the text criteria (T7-AC03, T8-AC04, T9-AC03) are unit tests of the view state plus a check of the running application.

<a id="t10"></a>

## T10. Migration and removal

Requirements: [T10](requirements.md#t10).

### Approach

Order within the deployment's migration step, with the old worker stopped:

1. Each requesting module's public operation marks its matters that wait for AI work of the old way as failed (T10-R02). It is called from the migration step because it needs the module's rules ([good practices](../../architecture/good-practices.md), item 1).
2. A database migration computes each month's carried charge from the old attempts: the actual cost of settled ones, the reserved amount of those of unknown cost and of those whose work had started and not ended; nothing for those that never started.
3. The old tables are renamed with an archive prefix and lose the columns of the former Profile path; no code references them.
4. The job definitions, handlers and failure handler of the old way, its public operations, the batch steps of the periodic process and the public lists of states and causes are removed. Jobs of the old definitions left in the executors' queues are deleted.

The AI module's description is rewritten for the first version, and the glossary's AI section loses or marks the terms of the parts put off (batch item, partially succeeded, Approve, abandonment, executor capacity, Settle).

### Verification

A migration test on a database with earlier data in every state covers T10-AC01–AC03; T10-AC04 is a review and a search of the code.

<a id="t11"></a><a id="t12"></a><a id="t13"></a>

## T11–T13. Panel, actions and budget

Requirements: [T11](requirements.md#t11), [T12](requirements.md#t12), [T13](requirements.md#t13).

### Approach

- **Reads.** The AI module exposes a read object without server code (architecture rules, dependency rule 2) with four reads: the list (a page of 50 by a cursor, ordered by needs attention first and then placed at descending; each row with its computed budget charge and the display name of the requesting module from the settings table), the details of one assignment with its operations, the count of assignments needing attention, and the budget (the current month's figures of T13-R01 and the list of months). The budget card of the profile page uses the last one in place of today's history read.
- **Navigation.** The repeated navigation of the pages becomes one shared component that also shows the item "Zadania AI" with the counter; the count is fetched with each page.
- **Retry.** One transaction: a conditional write moves the assignment from needs attention to in progress when its deadline has not passed; it inserts an operation with origin manual (pending, waits for executor) and sends its job. A manual operation's failure never meets the retry row of the table of what follows the end, which gives T12-R02.
- **Reject.** One transaction: a conditional write moves the assignment from in progress or needs attention to failed with the reason `rejected`; its pending operations end as failed with the cause `not_started`; a delivery job is sent.
- Both actions return the assignment's current status, and whether the action took effect; the page shows the message of T12-R04 when it did not.
- **Limits.** Setting the current limit inserts or updates the current month's row; setting the default limit updates the one-row table. Both validate the amount (T13-R04) and are idempotent.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Retry, Reject | Conditional on the status; the first wins (ZA-R03) | Database unavailable: an error, nothing changed | No effect, current status returned | Unknown assignment: not found |
| Set a limit | The last save wins | — | Same value: no change | Refused with a message (T13-R04) |
| Panel reads | Read committed state | A page of 50 | — | An unknown cursor or identifier: an empty page or not found |

### Verification

Integration tests of the reads and actions on a real database cover T11-AC01, AC02, T12-AC01–AC04 and T13-AC01–AC04, including two Rejects sent together. The pages (T11-AC03, T12-AC05, T13-AC05) are checked in the running application.

## Order of the tasks

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13, one after another. T11 needs only T3 and may be done earlier; the order above keeps tasks that touch the same code apart. Every task depends on `oferty-pracy-2ba.6`.

## Towards more traffic

Not part of this epic; recorded so that today's choices are seen not to block it. A queue per executor lets dedicated workers be added per executor, and the number of operations at a time then becomes their pool size (ZA-D01). Correctness rests on conditional writes and one job per waiting operation, not on a single process. Requesting modules know only an assignment identifier, a status and a receiver, so the AI module can move behind a network boundary without changing them. The cost is stored per operation, so separate budgets per requesting module are a new sum over the same data.
