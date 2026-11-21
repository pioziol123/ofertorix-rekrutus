# AI assignments — Solution design

Basis: [PRD](PRD.md), [requirements](requirements.md). Builds on the [background work design](../2ba-praca-w-tle/solution-design.md), sections B1 and B6. Binding rules: [architecture rules](../../architecture/moduly-i-zasady-kodu.md).

References that start with B1 or B6 point into that design and its requirements: B1 is the queue and worker libraries, B6 the move of the AI module onto them (`oferty-pracy-2ba.6`). Each is quoted here with what it says; the libraries exist in the code.

Section `T<n>` belongs to stage n of the PRD. Decision IDs (`ZA-D..`) are stable. Sections marked *Contract* are constraints once the design is agreed; everything else names the mechanism and leaves names, files and paths to the implementer.

**Status: agreed for implementation (2026-11-21).** A decision marked *Owner* records a choice the owner made, with the source. The sections marked *Contract* bind the implementer. The approaches describe the intended mechanism; where an approach and a contract or a requirement differ, the contract and the requirement hold.

**Code observed** at commit `324f023`: the queue and worker libraries, the module plugins, the periodic process and the AI module after `oferty-pracy-2ba.6`, which requests its work through the two queues `ai-execution-paid` and `ai-execution-local` and registers the requesting modules' receivers in its module plugin.

<a id="wspolne"></a>

## Shared design

### Parts and what each owns

| Part | Owns |
| --- | --- |
| Assignment handling (the AI module's common part) | Assignments and operations with their statuses and states, the order of work, the budget, retries, the time limit, delivery, the owner's actions and the panel's reads. The only code that changes an assignment's status or an operation's state. |
| Executor submodule (one per executor) | Its declaration (services, parameters, price list, maximum run times), carrying out one operation, the translation of its technology's events into the four outcomes, and its own state between the steps of one operation. |
| Settings of requesting modules | The fixed table, in the AI module, from a settings name to the executor, its parameters and the requesting module's display name. Its inner design belongs to `oferty-pracy-334`. |
| Requesting module | Its own matter, the assignment identifier it keeps, its receiver, the check of the result and what its views show. |
| Module plugin of the AI module | Registers the job definitions with their handlers and failure handlers. |
| Receiver registration | One shared place, run at the start of every process, where each requesting module's receiver is registered under its settings name (T6). |
| Periodic process | Calls three public operations in turn: operations waiting for the budget, the time limit, the daily ad syncs. |

### Data

Four tables of the AI module. Status, state and reason columns carry a database check on their closed list.

**Assignment.** Identifier; settings name; type (`single`, `agent`); label; instruction; input; response format (nullable); agent options (allowed tools and result instruction; null for `single`); executor name; executor parameters (a JSON value only the executor reads); status (`in_progress`, `needs_attention`, `succeeded`, `failed`); failure reason (null, or `rejected`, `time_limit`, `delivery_failed`); automatic operation limit (3, written at placing); placed at; deadline; finished at (nullable). A database check ties a failure reason to `failed` only.

**Operation.** Identifier; assignment; ordinal within the assignment; origin (`automatic`, `manual`); state (`pending`, `running`, `succeeded`, `failed`, `uncertain`); waits for (`budget`, `executor`; null unless pending); pending since; cause (from the closed list of causes; null for a result); retryable (boolean; null unless failed); potential cost (null until started); actual cost (null while unknown or not started); budget month (null until started); price list used (JSON, written at the start); usage (JSON, nullable); result (JSON, nullable); executor state (JSON, only the executor reads and writes it); started at; finished at.

**Operation exchange.** Operation; sequence; kind (`request`, `response`); content. Written by the executor before it sends and before it reads (T2-R08).

**Budget.** The existing month table (month in the form year-month in Polish time, limit) gets two carried columns, settled and held, zero by default (T10-R01). A one-row table holds the default limit.

Nothing stores a sum. A month's charge, an assignment's cost figures and the count of assignments needing attention are computed when read: for an operation with a budget month the charge is the actual cost when not null and the potential cost otherwise (ZA-R04).

### Queues

| Queue | Key mode | Job data | Settings |
| --- | --- | --- | --- |
| Paid executor's queue (new, created by its own queue migration, beside `ai-execution-paid` of the old way) | Exclusivity, constant key | Operation identifier | 4 attempts, 30 s delay with backoff, 60 min time limit |
| Local executor's queue (new, created by its own queue migration, beside `ai-execution-local`) | Exclusivity, constant key | Operation identifier | The same |

Each executor names its queue in its declaration. A job is sent only inside the save that makes its operation wait for the executor, so the request is rolled back with it (architecture rules, queue in the transaction). No job is sent for a delivery (ZA-D09).

### Decisions

**ZA-D01 (Owner, 2026-11-20). One operation at a time per executor comes from the queue: one queue per executor with exclusivity on a constant key.**
Reason: the owner chose one operation at a time for the first version; a queue with exclusivity on a constant key gives it, as the two AI queues of B6 do for the old way.
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

**ZA-D06. Withdrawn by ZA-D09 (2026-11-21).**
It made every delivery a job of a separate delivery queue and raised the worker's pool size to 3. It rested on reading a rule of the background work epic (module plugins, which register the handlers of queue jobs, run only in the worker and its pool processes; requirement B1-R15 there) as a ban on calling a requesting module's receiver outside the worker. The owner's decision behind that rule concerned handlers of queue jobs and had no such reason; a receiver is not one.

**ZA-D07 (Owner, 2026-11-21, after the review of that day). The old and the new way coexist from T1 to T10, each with its own queues and its own count against the budget.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the requesting modules move one task at a time and the checks must pass between tasks.
Discarded: sharing the two AI queues of B6 between both ways and counting both ways' charges in a month's room (the decision of 2026-11-20). Verified fact: the handler registry takes one job definition per queue, so a queue cannot serve both ways; and the old way would not count the new operations, so the shared count held in one direction only.
Consequences, all removed by T10 and accepted by the owner because the system does not run in production: a second mechanism (architecture rules, costs); a month may be charged by both ways beyond its limit; a paid operation of each way may run at the same time, and so may a local one.

### Confirmed assumptions

Gaps in these documents that an implementing agent settled and the owner confirmed on 2026-11-21. Each is still marked in the code with its `ASSUMPTION(...)` marker, so the places that rely on it can be found.

**ZA-D10 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.3/ASM-1)`, T1-R02, T2-R06, T2-R07). Without a response format an executor sends none and the result is the provider's text as it came.**
The paid single answer and the agent's synthesis send no `text.format`; the local chat sends no `format`. With a format the requests are byte-identical to the old way's and the result is the parsed JSON.

**ZA-D11 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.3/ASM-2)`, T2-R06, T2-R08). The local executor keeps its request for the list of models in the exchange, without headers.**
The exchange holds `GET <endpoint>/api/tags` and its raw response, then the chat body and its raw response. Headers are not kept, so the endpoint's credential is not either (architecture rules: diagnostics leave out secrets).

**ZA-D12 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.3/ASM-3)`, T2-R03). Both executors read an error answer by one shared rule.**
429 is an ordinary `http` failure charged nothing. A context overflow is a non-retryable `context_overflow` failure. 5xx is an ordinary `http` failure. Any other 4xx except 408 and 409 is a request the provider cannot take at all: a non-retryable `configuration` failure. Any other answer, 408 and 409 included, is uncertain with the cause `unknown`. Every answered request except 429 has an unknown cost unless the provider reported usage (ZA-R04 is unchanged). For the local executor a 404 of the chat stays `model_unavailable`.

**ZA-D13 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.4/ASM-1)`, T3-R02, T3-R05). An operation whose executor, or its offer of the frozen parameters, is no longer declared does not start and is charged nothing.**
Its start throws inside the start transaction, so nothing changes; the attempt fails and the queue's attempts and the failure handler decide its end (T4-R06). The pass over operations waiting for the budget skips it, so it waits until the time limit (T6) ends it. Accepted for the first version only: the owner wants such an assignment to end at once with a clear reason, which is item 47 of `oferty-pracy-sz5`.

**ZA-D14 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.8/ASM-1)`, T7-R01, T1-R04). An assignment placed for a pasted CV is labelled "Wklejony tekst".**
It is the name the profile page already shows for such an import; an uploaded CV is labelled with its stored file name.

**ZA-D15 (Owner, 2026-11-21; `ASSUMPTION(oferty-pracy-sq2.8/ASM-2)`, T7-R02, T7-AC06). The import's own stored status decides whether the Profile refuses a new preparation.**
A request is refused while the import records a preparation in progress, of the old way (`ai_queued`, `ai_running`, `waiting_budget`) or with an assignment (`ai_running`). A CV whose old-way preparation ended without reaching the import stays refused ("A proposal is already pending") until the migration of T10 step 1 marks it failed. This is a regression against today's behaviour that exists only between the Profile's move to the new contract and T10, in a build that is not released.

### Contract: the closed lists

- Assignment status, operation state, failure reason: as in the data above. The failure reasons of the requirements (ZA-R05) are stored as `rejected` (rejected by the owner), `time_limit` (time limit exceeded) and `delivery_failed` (result not taken). Requesting modules import the status list from the AI module's public entry; no other list is public.
- Causes: the existing list of the AI module (`refused`, `incomplete`, `no_content`, `format`, `configuration`, `network`, `http`, `aborted`, `model_unavailable`, `context_overflow`, `unknown`) plus `not_started` for a pending operation ended with its assignment and `time_limit_run` for a passed maximum run time. `interrupted` and `adapter_unavailable` are not written any more. The list is no longer public: only the panel's reads return a cause.

### Contract: what follows the end of an operation

One function of assignment handling decides it, in the transaction that ends the operation, after locking the assignment's row. Every caller that ends an operation uses it. The last column names the task that adds the row; before that task, the row's case leaves the assignment as it is.

| Operation ended as | Assignment is | Then | Added by |
| --- | --- | --- | --- |
| succeeded | in progress | Nothing in this transaction; the handler delivers next (T6) | T6 |
| succeeded | failed (rejected meanwhile) | Nothing; the result stays with the operation | T3 |
| failed, retryable, origin automatic, fewer than 3 automatic operations, deadline not passed | in progress | Insert the next operation (pending, waits for executor) and send its job | T4 |
| any other failed or uncertain end, deadline not passed | in progress | Status needs attention | T4 |
| any failed or uncertain end, deadline passed | in progress | Status needs attention; the time limit fails it at its next pass (T6) | T4; the deadline is read from T6 on |
| anything | not in progress | Nothing | T3 |

The old way stays whole until T10 (ZA-D07): no task before T10 removes or changes code, tables or queues the old way uses; where a section says something of the old way is removed or replaced, T10 does it unless the section names another task. A task that needs the old code's logic, such as an adapter's request to a provider, uses it from the new code or copies it.

T3 builds the function with its two rows and the conditional end of the operation. Between T3 and T4 a failed operation leaves its assignment in progress with nothing pending; between T3 and T6 so does a succeeded one. Both are states of the build only (requirements, T3 scope).

### Which task changes the database

| Task | Change |
| --- | --- |
| T1 | The assignment table and the operation table, with every column of the data above; later tasks add no column to them. The two executors' queues, each by its own queue migration, with their entries in the queue configuration (the settings of the queues table above). |
| T2 | The operation exchange table. |
| T3 | The one-row table of the default limit, holding 100 PLN, the amount fixed in code today. |
| T7, T8, T9 | In the module's own data: a column for the assignment identifier beside today's reference to the old AI record (the Profile has an unused one of that kind and identifies its AI work by the CV import; Matching keeps its reference with the assessment request; Companies with the research row). The old reference stays until T10. |
| T10 | In the month table `ai_budget_months`: two carried columns, settled and held, filled by the migration. The old AI tables renamed with an archive prefix: `ai_executions`, `ai_attempts`, `ai_execution_artifacts`, `matching_batch_artifacts`. From the renamed executions table the four columns of the former Profile path dropped: `result_status`, `error_code`, `disposition`, `publication_allowed`; no other column of an archived table is dropped. The old references dropped: `execution_id` of `matching_requests` and of `company_research`, and `current_execution_id` of `profile_imports`. Matching's earlier batch and group tables are not touched. The queues `ai-execution-paid` and `ai-execution-local` deleted. |
| T4, T5, T6, T11, T12, T13 | None. |

<a id="t1"></a>

## T1. Placing and reading

Requirements: [T1](requirements.md#t1).

### Approach

- This task defines the declaration part of the [executor contract](#contract-executor) and writes the declarations of the two executors from today's settings and model catalogue; T2 adds carrying out an operation. It also creates the two executors' queues. No handler is registered for them until T3, so the worker cancels and logs a job that reaches them before T3; no requesting module places assignments before T7.
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

Integration tests on a real database cover T1-AC01–AC05 with a test executor declaration; T1-AC06 is a unit test of the settings and declarations.

<a id="t2"></a>

## T2. Executors

Requirements: [T2](requirements.md#t2).

### Approach

- Two executor submodules are built behind one interface, beside the existing provider adapters, which the old way keeps using until T10; the submodules send the same requests to the providers as those adapters. The interface: the declaration, and carrying out one operation given the assignment's frozen content, the operation's saved executor state and two writers (for the exchange and for the executor state). The interface returns an outcome: a result with usage, or one of the three other ways with a cause and the usage known.
- Both writers are conditional on the operation still running. A write that matches nothing tells the executor to stop: nothing more is sent (as the agent's step log does today).
- The paid agent keeps its step log and materials in the executor state column (architecture rules, default storage of adapter state); the materials are read from it for delivery.
- The executor enforces its maximum run time itself, with a timer around the whole operation, in addition to its limits per request. The values are those of T2-R06: 120 s, 900 s and 1800 s, all below the 3600 s of the executors' queues.
- The executors have no counterpart of these parts of the adapters: the batch cycle, the translation of an interrupted run, the transient flag with its suggested wait, and the reconstruction of batch input. T10 removes them with the adapters.
- The result is the content the provider returned, parsed as JSON when the service promised JSON; content that cannot be parsed is the cause `format`. No comparison with the response format is made (T2-R07).

### Contract: executor

Agreed shape of the interface between assignment handling and an executor submodule. Names are the implementer's; the parts and their meaning are fixed here, and T3–T6 use them without changing them.

**Declaration** (read without calling a provider):

- the executor's name and the name of its queue;
- per assignment type it serves: the parameters an assignment may carry with their allowed values (today: model and reasoning effort; for the agent also the tools it offers), the maximum run time, and the price list: a version, the exchange rate, the rates and the caps of input, output and paid tool calls that the potential cost is computed from. A local executor's price list is absent, which means a potential and actual cost of zero;
- whether it is configured now (its secret or address is present);
- optionally, the size of the request it would send for a given content, for the size check of T1-R04.

**Carry out one operation.** Input:

- the assignment's frozen content: type, instruction, input, response format, agent options, executor parameters;
- the executor state saved for this operation so far (empty for a new operation; an executor never receives another operation's state);
- a writer for the exchange: given a kind (request or response) and the raw text, it appends a row and answers whether the operation is still running;
- a writer for the executor state: given the new state, it replaces the saved one and answers the same.

When a writer answers that the operation is no longer running, or fails, the executor sends nothing more and returns; whatever it returns is then discarded by the conditional end (T5-R04). The executor writes the request before sending it and each response before reading it.

Output, exactly one of:

- **a result**: the content (a JSON value when the service promised JSON, otherwise text) and the usage;
- **an ordinary failure**, **a non-retryable failure** or **uncertain**: a cause from the closed list and the usage known so far.

Usage is the count of input tokens, output tokens and paid tool calls, each known or unknown, and whether anything was sent to the provider. Assignment handling computes the actual cost from it and the price list saved at the start: nothing sent gives zero; every count known and within the caps gives the computed cost; anything else gives an unknown cost. This keeps today's rule of the cost computation.

**Materials of an agent session.** A second entry of the executor, given a saved executor state, returns the materials gathered (text with its sources) or none. Assignment handling calls it at delivery and passes the result to the receiver; it never reads the state itself.

**Not part of the interface**: any knowledge of assignments, operations' identifiers, budget, retries or receivers; a retry inside the executor; a translation of a lost process (assignment handling ends such an operation itself, T5).

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

**ZA-D08 (Owner, 2026-11-20, for keeping it always; the table is the design's choice). The exchange is always kept, in a table of the AI module, not in the batch archive table taken over from Matching.**
Reason for always: the owner accepted [O-6](requirements.md#open); the agent's reasoning was one rule instead of an option per requesting module, and that a raw response cannot be recovered later.
Discarded: keeping it only where the requesting module asks (today).
Not chosen: reusing the existing archive table, which after T10 belongs to the archive nothing reads.

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
   - running: the interrupted path of [T5](#t5); until T5, end the job without effect.
   - any other state: end the job without effect.
2. *Carry out*, outside any transaction: call the executor.
3. *End*, one transaction: a conditional write on the operation still running saves the state, cause, retryable flag, usage, result and actual cost; then the function of [what follows the end](#contract-what-follows-the-end-of-an-operation) runs. When the write matches nothing, the handler ends without effect (T5-R04).

**Operations waiting for the budget** (a public operation, added to the periodic process as a new step by this task, beside the steps of the old way). It reads the room of the current month once, then walks the operations that wait for the budget, of assignments in progress, by pending since. For each whose potential cost at today's prices fits the remaining room, it subtracts the cost from the remaining room and, in one transaction, sets waits for executor (conditional on still waiting for the budget) and sends the job. Others are skipped. The charge itself is still made at the start.

### Contract: room in the budget

- Room of a month = limit − carried settled − carried held − the sum of the charges of the operations with that budget month. The old way's attempts are not counted (ZA-D07); both carried amounts are zero until T10.
- The month table and its limits are shared with the old way until T10. This task adds the one-row table of the default limit and the budget read of T3-R09: every month with its limit, its settled amount (carried settled plus the known actual costs of its operations) and its held amount (carried held plus the potential costs of its running operations and of those with an unknown cost); the month's charge is their sum.
- The lock on the month's row makes check and charge one step for all executors (T3-R02).
- Amounts are kept and computed as today, in millionths of a złoty.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Start | Excluded per executor by the queue; the month's row lock orders starts of different executors | No room: waits for budget. Database unavailable: the attempt fails and is retried | A second job for a started or ended operation has no effect, or ends an interrupted one (T5) | Unknown operation: no row, no effect |
| End | Conditional on running; of two ends one is kept | Database unavailable: the attempt fails; the next one finds the operation running (T5) | No effect | — |
| Waiting for the budget | Passes never overlap; a start may take room first, then the sent operation waits for the budget again | A slow pass delays the next | An operation already sent is skipped by the condition | — |

### Verification

Integration tests with the worker library and a test executor cover T3-AC01–AC09; the month boundary uses a controlled clock.

<a id="t4"></a>

## T4. Retries and needs attention

Requirements: [T4](requirements.md#t4).

### Approach

- The rule is the table of [what follows the end](#contract-what-follows-the-end-of-an-operation); this task adds its failure rows.
- The count of automatic operations is the number of the assignment's operations with origin automatic, compared with the limit stored on the assignment.
- **Failure handler of the executors' queues**, called by the worker through the failure queue after a job failed on its last attempt, also when the worker died in it: a pending operation ends as failed, retryable, cause `unknown`, with no cost (this task); a running one ends as uncertain (added by [T5](#t5)); then the same function runs. Other states: no effect. It is a conditional write.
- Assignment handling has no counterpart of the old way's single extra call after a transient error (T4-R07).

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
- An attempt that finds its operation succeeded while the assignment is in progress makes the delivery (T6-R10).

### Verification

Integration tests kill a worker during an operation and during the last attempt, and run an operation past a short queue time limit (T5-AC01, AC02); a test saves a result after the operation was ended (T5-AC03).

<a id="t6"></a>

## T6. Delivery and the time limit

Requirements: [T6](requirements.md#t6).

### Approach

**Delivery after an operation.** The operation's handler, after the transaction that ends an operation with a result, and also when it finds its operation already succeeded with the assignment in progress (T6-R10), opens a delivery transaction: it locks the assignment's row and, when the assignment is still in progress, calls the receiver's result entry with the assignment identifier, the result and, for an agent, the materials (read by the executor from its state), then sets succeeded and finished at. An error raised by the receiver's call, or a missing receiver, rolls that transaction back; a second transaction, conditional on the assignment still being in progress, sets failed with the reason `delivery_failed` and calls the receiver's failure entry (with no receiver registered there is nothing to call, and the status alone is saved). An error in the second transaction, or an error that does not come from the receiver (the database, the commit), fails the attempt; the queue's next attempt finds the operation succeeded and repeats the delivery from its beginning.

After the last attempt, the failure handler finds a succeeded operation and changes nothing: the error is in the log, the assignment stays in progress, the time limit leaves it alone (T6-R07), and the owner can still reject it.

**Time limit** (a public operation, added to the periodic process as a new step by this task). It takes each assignment in progress or needing attention whose deadline has passed, unless it has a running operation or, while in progress, a succeeded one. For each, one transaction: a conditional write sets failed with the reason `time_limit` and finished at; its pending operations end as failed with the cause `not_started`; the receiver's failure entry is called (with no receiver registered there is nothing to call, and the status alone is saved). An error of the receiver rolls the transaction back and is logged with the assignment's identifier; the other assignments are still handled, and the next pass tries again.

### Contract: receiver

- Defined by the AI module in its public contract; implemented by each requesting module in its integration layer.
- Registered per settings name in one shared registration that the web application, the periodic process, the worker and its pool processes each run at start. It is separate from the module plugins, which still only the worker and its pool processes run; it registers no job handler. T6 creates this registration, empty; T7, T8 and T9 each add their module's receiver to it. The receivers of the old way, which the AI module's plugin registers today, are a different interface and stay there until T10. A second registration of a name throws at start.
- Two entries: a result (assignment identifier, result, materials when the type is agent) and a failure (assignment identifier). Neither returns a value; neither receives a cost, a cause or a reason.
- Each call runs inside the transaction of the AI module that saves the assignment's final status.
- Three rules of T6-R09 bind every receiver: a repeated call has no further effect; it uses only its arguments; the requesting module does not rely on the end being reported at the moment it happened. They let the call become an event delivered through a queue later without changing the receivers.

### Decision

**ZA-D09 (Owner, 2026-11-21). Every end of an assignment reaches the requesting module through its receiver, synchronously, in the transaction that saves the final status; receivers are available in all three kinds of process.**
Reason (owner): the first version is to dig no holes for later. With failures learned from a status read, each requesting module would carry its own logic for guessing an end, and every later way of ending an assignment outside the worker would meet the same wall.
Discarded: a delivery queue (ZA-D06). Discarded: a result through the receiver and failures through the status read (the reviewers' simplest variant, first recommended by the agent): two sources of "failed" and a contract built into three modules that is costly to change.
Consequences the owner accepted: Reject and the time limit run code of the requesting module, so an error there holds back the end of the assignment until the receiver works; the web application and the periodic process load the requesting modules' receivers.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Deliver a result | The row lock orders it with Reject and the time limit; the one that saves first wins (ZA-R03) | Database error: the attempt fails and the next one repeats the delivery | Assignment no longer in progress: no effect | Unknown assignment: no effect |
| Time limit | Conditional write; an operation that starts between the check and the write keeps running, and the next pass applies the rule | — | A failed assignment is skipped | — |

### Verification

Integration tests with test receivers (accepting, raising on a result, raising on a failure, missing, writing its own row) cover T6-AC01–AC04 and AC07; T6-AC05 and AC06 use a controlled clock; T6-AC08 kills a worker between the two transactions.

<a id="t7"></a><a id="t8"></a><a id="t9"></a>

## T7–T9. Requesting modules

Requirements: [T7](requirements.md#t7), [T8](requirements.md#t8), [T9](requirements.md#t9).

### Approach, common

- Each module's integration layer builds the content of T1-R02, places the assignment inside the module's own requesting operation, and stores the identifier in a new column of the module's row for the matter: the Profile with the CV import and its text revision, Matching in its assessment request, Companies in its research row. Today's reference to the old AI record stays beside it until T10.
- Each module registers its receiver in the shared registration of T6 and stops requesting through the old way; its old receiver and the code that reads old AI records for its views go in T10, with the histories of [T10-R08](requirements.md#t10).
- Each receiver validates the result with the response format the module already defines (the check the AI module made until now moves here), then applies the rules it already has. A failed check is saved as the module's own failed outcome; the receiver does not raise an error for it, so the assignment succeeds.
- Each module's view state is computed from its own data, which its receiver updates on a result and on a failure (ZA-D09). The status read is used only to tell whether work is still in progress, for example to keep a list refreshing.
- Each module guards its own matter against a second request in progress with a conditional write on its own row.

### Per module

- **Profile (T7).** The operation that resumes preparations and its periodic step are removed. The Profile keeps its two messages for a proposal that does not pass its own check (quotes, format). For a preparation with an assignment, a failure gives the one message of T7-R04; the mapping from the old way's states and causes to messages stays for earlier preparations until T10.
- **Matching (T8).** The group command loops over its offers and places one assignment each, inside its one transaction. Matching no longer requests a provider batch or passes a group identifier to the AI module; the old code that shows earlier assessments, with its texts, stays until T10. The exchange view reads the new exchange read of the AI module by assignment identifier. The count that drives the list's refresh comes from the status read over the assessments shown.
- **Companies (T9).** The research request places an agent assignment with the web search tool and its result instruction; for research with an assignment the view shows no reserved amount.

### Contract: exchange read

A public read of the AI module for T8-R07: given an assignment identifier, the request and responses of each of its operations, in order; an unknown identifier is reported as not found. Its one consumer is Matching's exchange view.

### Verification

Each module's existing integration tests are rewritten onto assignments with simulated providers and cover the criteria of its section; the text criteria (T7-AC03, T8-AC04, T9-AC03) are unit tests of the view state plus a check of the running application.

<a id="t10"></a>

## T10. Migration and removal

Requirements: [T10](requirements.md#t10).

### Approach

The deployment's migration step runs with the old worker stopped. The database migrations run first, then the module operations, as that step is ordered today; the parts below do not depend on each other's order, because the module operation of part 1 reads only its own module's data:

1. Each requesting module's public operation marks as failed its matters that still wait for AI work of the old way (T10-R02): those that are in progress in the module's own data and have neither an outcome nor an assignment identifier. It is called from the migration step because it needs the module's rules ([good practices](../../architecture/good-practices.md), item 1).
2. A database migration computes each month's two carried amounts from the old settlement records (an actual cost goes to carried settled, a reserved amount to carried held), by the state of each record and of its AI work at that moment:

   | Old work | Its settlement record | Enters the carried charge |
   | --- | --- | --- |
   | Ended, cost known | settled | Its actual cost |
   | Ended, cost unknown (also uncertain work) | unknown | Its reserved amount |
   | Waiting for delivery | open | Its reserved amount: the provider was called |
   | Running (a provider batch already sent, or work whose worker was killed) | open | Its reserved amount |
   | Queued, never started | open, holding a reservation | Nothing: the reservation is released, because nothing was sent |
   | Waiting for the budget | open, reserving nothing | Nothing |

   The month's limit stays in its row. The default limit needs no migration: its table holds 100 PLN since T3.
3. The old tables are renamed with an archive prefix and lose the columns of the former Profile path; no code references them.
4. The job definitions, handlers and failure handler of the old way, its public operations, the batch steps of the periodic process and the public lists of states and causes are removed. The queues `ai-execution-paid` and `ai-execution-local` are deleted with their jobs, and the profile page's budget card is switched to the budget read of T3 (T10-R06).

The AI module's description is rewritten for the first version. The glossary's AI section already describes it since the specification was written (2026-11-21), with the terms of the parts put off under their own heading.

### Verification

A migration test on a database with earlier data in every state covers T10-AC01–AC03; T10-AC04 is a review and a search of the code.

<a id="t11"></a><a id="t12"></a><a id="t13"></a>

## T11–T13. Panel, actions and budget

Requirements: [T11](requirements.md#t11), [T12](requirements.md#t12), [T13](requirements.md#t13).

### Approach

- **Reads.** The AI module exposes a read object without server code (architecture rules, dependency rule 2) with these reads: in T11, the list (a page of 50 by a cursor, ordered by needs attention first and then placed at descending; each row with its computed budget charge and the display name of the requesting module from the settings table), the details of one assignment with its operations, and the count of assignments needing attention; in T13, the current month's figures of T13-R01, which extend the budget read of T3 that the profile page's budget card uses since T10.
- **Navigation (T11).** The repeated navigation of the pages becomes one shared component that also shows the item "Zlecenia AI" with the counter; the count is fetched with each page.
- **Retry (T12).** One transaction: a conditional write moves the assignment from needs attention to in progress when its deadline has not passed; it inserts an operation with origin manual (pending, waits for executor) and sends its job. A manual operation's failure never meets the retry row of the table of what follows the end, which gives T12-R02.
- **Reject (T12).** One transaction: a conditional write moves the assignment from in progress or needs attention to failed with the reason `rejected`; its pending operations end as failed with the cause `not_started`; the receiver's failure entry is called (with no receiver registered, the status alone is saved). An error of the receiver rolls everything back, and the action returns an error (T12-R06).
- Both actions return the assignment's current status, and whether the action took effect; the page shows the message of T12-R04 when it did not.
- **Limits (T13).** Setting the current limit inserts or updates the current month's row; setting the default limit updates the one-row table. Both validate the amount (T13-R04) and are idempotent.

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

Not part of this epic; recorded so that today's choices are seen not to block it. A queue per executor lets dedicated workers be added per executor, and the number of operations at a time then becomes their pool size (ZA-D01). The receiver's call in one transaction becomes an event delivered through a queue; the three rules of the receiver's behaviour (T6-R09) keep the receivers unchanged, and the rule that a result not taken fails the assignment then needs a new decision. Correctness rests on conditional writes and one job per waiting operation, not on a single process. Requesting modules know only an assignment identifier, a status and a receiver, so the AI module can move behind a network boundary without changing them. The cost is stored per operation, so separate budgets per requesting module are a new sum over the same data.
