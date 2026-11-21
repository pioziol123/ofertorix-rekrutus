# Paid executor: readable provider errors, longer answers and a wait before a retry — Solution design

Basis: [PRD](PRD.md), [requirements](requirements.md). Builds on the [solution design of AI assignments](../sq2-zlecenia-ai/solution-design.md) and on the queue library of the [background work design](../2ba-praca-w-tle/solution-design.md), section B1. Binding rules: [architecture rules](../../architecture/moduly-i-zasady-kodu.md).

References that start with `sq2` point into the design and requirements of AI assignments, for example sq2 ZA-D08 or sq2 T4-R02. Section `T<n>` belongs to stage n of the PRD. Decision IDs (`PW-D..`) are stable. Sections marked *Contract* bind the implementer; everything else names the mechanism and leaves names, files and paths to the implementer.

**Status: agreed for implementation (2026-11-21).** A decision marked *Owner* records a choice the owner made, with the source. The sections marked *Contract* bind the implementer.

**Code observed** at commit `fd1013e`, after `oferty-pracy-sq2.7`: the paid executor with its single answer and agent session, the rule of what follows the end of an operation, the queue library. Observed there:

- The single answer and the last step of the agent session each read the answer's text with their own copy of the same rule: exactly one text part, otherwise the cause `no_content`.
- The agent session sends each of its two steps with half of the price list's output cap, and the session is offered only for a price list whose output cap is at least 4,000.
- One shared rule of the executors turns an error answer's HTTP status into an outcome. It reads the error code of the body only to recognise an input beyond the context.
- The raw body of every answer, error answers included, is written to the operation's exchange before it is read (sq2 ZA-D08). Response headers are not kept anywhere.
- The executor contract's outcome carries a kind, a cause, a retryable flag and the usage; nothing else.
- The queue library's request of a job passes the job's data and its key value to pg-boss on the caller's transaction and has no option for a later start.
- The executors' queues use pg-boss's `singleton` policy for the exclusivity key mode. Read from the source of pg-boss (its main branch on 2026-11-21, not run): that policy limits only the active jobs of a key to one, through a unique index on jobs in the state `active`; the query that takes the next job skips a job whose `start_after` is in the future and checks only for an active job of the same key. A waiting job with a later start therefore does not hold back another job of the same key. pg-boss implements its own retry delay the same way, by setting `start_after`.

<a id="wspolne"></a>

## Shared design

### Parts and what each owns

| Part | Owns |
| --- | --- |
| Paid executor submodule | The room it asks for in each request, reading an answer's text, the identifier it sends with a request, what it extracts of an error answer, and which answers mean "no funds" and "temporarily unavailable". |
| Model catalogue of the AI configuration | The paid price lists with their caps, the one source of the output room (T1-R02). |
| Executor contract (AI module) | The shape of provider detail and of the report "temporarily unavailable", the same for every executor. |
| Assignment handling | Storing the provider detail with the operation, the wait rule with its values (1 minute, 5 minutes, at most 15 minutes), the moment of the next operation. |
| Queue library | Requesting a job that is not carried out before a moment. |
| Panel reads and page | Returning and showing the provider detail and the moment. |

### Data

The operation table of the AI module gets two nullable columns, added by a migration of the task named:

| Column | Task | Meaning |
| --- | --- | --- |
| Provider detail (JSON) | T1 | What the executor reported with the outcome ([contract](#contract-provider-detail)). Null: the executor reported none, or the operation has not ended, or it was ended without its executor (interrupted, not started). Written once, in the save that ends the operation; assignment handling never reads inside it. |
| Not before (timestamp with time zone) | T2 | The moment before which the operation's job is not carried out. Null: no wait. Written when the operation is inserted and never changed. It is what the panel shows; the queue alone enforces the wait. |

Both columns hold facts that cannot be rebuilt later: response headers are not in the exchange, and the queue's own record of a job goes with the job.

### Which task changes the database

| Task | Change |
| --- | --- |
| T1 | The provider detail column. |
| T2 | The not before column. No queue is created or changed: the option is a property of a single request. |

<a id="t1"></a>

## T1. Longer answers and readable provider errors

Requirements: [T1](requirements.md#t1).

### Approach

- **Room.** The paid price list of the single answer gets an output cap of 25,000 and that of the agent session 50,000; the session keeps sending each step with half of its cap, which gives 25,000 a step. A price list with different caps is a different price list, so both get a new version label. Nothing else of the price lists changes. The potential cost, the size check at placing and the bound of a computed actual cost read the caps from the price list and follow without a change of their own.
- **Text.** One reader of an answer's text, used by the single answer and by the session's last step: the text parts of the answer's assistant messages, joined in order with nothing between them. The joined text, when blank, gives `no_content`; otherwise it is read as before (JSON when a response format was given).
- **Request identifier.** Before each request the executor draws a random UUID and sends it in the header `X-Client-Request-Id`. From each response it reads the header `x-request-id`. Both go into the provider detail; the header is not part of the exchange, whose request row stays the body.
- **Error answer.** The shared rule for an error answer extracts, from a body that is JSON with an `error` object, the fields `code`, `type` and `message` when they are strings, and cuts the message to 500 characters. A body that cannot be read gives no error part.
- **No funds.** An answer with status 429 whose error code or error type is one of `insufficient_quota`, `credit_balance_exhausted`, `project_spend_limit_exceeded` is a failed outcome, not retryable, with the cause `http` and nothing charged. The list lives in the paid executor. The first value is the provider's long-standing code; the other two are quoted by the research from the provider's rate limit guide and were not checked against a live error answer. A code outside the list is treated as a rate limit, which costs at most the assignment's automatic operations.
- **Storing.** The save that ends an operation writes the provider detail the outcome carries, with the state, cause and usage, under the same condition that the operation is still running.
- **Panel.** The details read returns each operation's provider detail as stored. The page shows, under the cause, a line with the error code and message when the detail has an error, and the request identifiers; the wording of the labels is the implementer's, in Polish (sq2 T11-R06).

### Contract: provider detail

An optional part of every outcome of the executor contract, results included. Absent means the executor reports none.

- `requests`: a list, in the order sent, with one entry per request the executor sent to its provider in this operation: `sent`, the identifier the executor sent (a string), and `provider`, the identifier the provider returned for it (a string, or null when no answer came or it carried none).
- `error`: null, or the last error answer the operation received: `code`, `type` and `message`, each a string or null; `message` holds at most 500 characters.

Assignment handling stores the value and returns it in the details read. It does not read `requests` or `error`; the panel's page reads them to show them. The detail carries no secret: the executor puts nothing of the request's headers into it except the identifier it drew.

### Contract: mapping of events to outcomes, changes

The rows of sq2's mapping table hold except these:

| What the executor observed | Outcome | Cause | Cost |
| --- | --- | --- | --- |
| A complete answer whose text is in several parts (*changed*: `no_content` before) | Result | — | From usage |
| A complete answer with no text part, or whose joined text is blank | Ordinary failure | `no_content` | From usage, else unknown |
| A rate limit answer that reports a lack of funds (*changed*: ordinary failure before) | Non-retryable failure | `http` | Zero |

### Decisions

**PW-D01 (Owner, 2026-11-21, on the agent's proposal). A lack of funds is a non-retryable failure with the existing cause `http`; what happened is told by the provider detail.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the list of causes is closed and checked by the database, and the retryable flag is already separate from the cause.
Discarded: a new cause for a lack of funds. It changes the database check and adds a text to the panel, while the provider detail shows the provider's own code beside the cause.

**PW-D02 (Owner, 2026-11-21, on the agent's proposal). The provider detail is a column of the operation, filled by the executor's outcome.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the panel shows it without knowing a provider's format, and the provider's request identifier arrives in a header that the exchange does not hold.
Discarded: reading the detail out of the stored raw response each time the panel shows it. The panel's read would have to parse one provider's error format (sq2 T2-R09, architecture rules, interchangeable executors).
Cost accepted: an operation that is interrupted keeps no detail, because the detail is written when the operation ends (PRD, risks).

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| End of an operation with a provider detail | The conditional end of sq2 T3: of two ends one is kept, with its detail | A detail is bounded: one entry per request, a message of at most 500 characters | A second end changes nothing | An executor's detail is stored as reported; the paid executor builds it from typed values |
| Reading an error answer | — | — | — | A body that is not JSON, or has no `error` object, gives no error part; a field that is not a string is left out |
| Details read | Reads committed state | — | Same answer | A stored detail that does not have the contract's shape is shown as absent |

### Verification

Unit tests of the paid executor with a simulated provider cover T1-AC01, AC03, AC09 and the reported detail of AC04 and AC05; they replace the assertions of the existing tests that pin an output cap of 6,000 and a single text part. Integration tests on a real database cover the stored detail (T1-AC04–AC06), the potential cost (AC02), the lack of funds through an assignment (AC08) and the exchange (AC10). T1-AC07 is a test of the read, a unit test of the view's state and a check of the running application.

<a id="t2"></a>

## T2. A wait before an automatic retry

Requirements: [T2](requirements.md#t2).

### Approach

- **Report.** A failed outcome that is retryable may carry the report "temporarily unavailable" ([contract](#contract-temporarily-unavailable)). The shared rule for an error answer sets it for status 429 without a lack of funds and for status 500–599, and reads the wait from the response header `Retry-After`: a whole number of seconds, or an HTTP date, from which it subtracts the current time. A header that is missing or cannot be read gives no named wait.
- **Wait.** The function of what follows the end of an operation (sq2, contract of that name) receives the report with the ended operation. When it adds the next automatic operation and the report is present, it computes the wait: the named wait when it is above zero, capped at 900 seconds; otherwise 60 seconds when the assignment has one automatic operation and 300 seconds when it has two. The moment is the end of the failed operation plus the wait. The three values are constants of assignment handling.
- **Next operation.** It is inserted pending, waiting for the executor, with the moment in its not before column, and its job is requested with the same moment, in the same transaction as today. Without a report the moment is null and the job is requested as today.
- **Start.** The handler of an operation's job does not read the moment: a job the queue hands over is due. A job that arrives for an operation already ended as not started has no effect, as today.
- **Budget pass.** An operation that waited for its moment and then found no room in the budget waits for the budget; when it is sent again, it is sent without a moment, since the wait has passed.
- **Queue library.** The request of a job takes an optional moment and passes it to pg-boss as `startAfter`, with the caller's transaction as before. No moment: the request is what it was. The key mode's rules apply to a job with a moment as to any waiting job.
- **Panel.** The details read returns each operation's moment; the page shows it for a pending operation that has one.

### Contract: temporarily unavailable

An optional part of a failed outcome whose retryable flag is true: `unavailable`, an object holding the wait the provider named, in seconds: a number above zero, or null when it named none. Absent on every other outcome. An executor sets it only for an event of its technology that means the provider cannot serve requests for a while. Assignment handling reads the named wait and nothing else about the event.

### Contract: request not before a moment

The queue library's request of a job accepts an optional moment (a point in time):

- Given and in the future: the job enters the queue in the caller's transaction and is not handed to a worker before the moment. Rolling the transaction back removes it (B1-R01).
- Given and not in the future, or absent: no wait.
- It changes nothing in the job's attempts, retry delay, time limit or retention, which stay the queue's settings and count from the moment the job is taken.
- Exclusivity: a job waiting for its moment does not stop other jobs with the same key value from being carried out (observed in pg-boss's source, see Code observed; T2-AC09 proves it on a real database).
- Deduplication: a job waiting for its moment counts as a waiting job, so a second request with the same key value is a duplicate.

### Contract: what follows the end of an operation, change

The row of sq2's table "failed, retryable, origin automatic, fewer than 3 automatic operations, deadline not passed" becomes two:

| Operation ended as | Then |
| --- | --- |
| …and the outcome reports temporarily unavailable | Insert the next operation with its moment and request its job not before that moment |
| …and it reports nothing | Insert the next operation and request its job, as before |

The failure handler and an interrupted operation end an operation without an executor's outcome, so they never carry the report.

### Decisions

**PW-D03 (Owner, 2026-11-21, on the agent's proposal). The executor reports that its provider is temporarily unavailable, with the provider's named wait; assignment handling owns the wait rule.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the rules of assignments are the same for every executor (sq2 T2-R09), and only the executor can tell what an event of its technology means.
Discarded: a rule in assignment handling that names the paid executor's error answers. It puts a provider's fact into the common part.

**PW-D04 (Owner, 2026-11-21). The wait is carried by the queue: the job of the next operation is requested not before its moment.**
Reason: none recorded beyond the agent's reasoning, which the owner accepted: the fewest new parts in the AI module, and a small, general change of the queue library.
Discarded: a step of the periodic process that sends operations whose wait has passed, as it does for operations waiting for the budget. It needs no change of the queue library, but adds a new kind of waiting to an operation and a new step, and is exact only to about a minute.
Discarded: waiting inside the operation and calling the provider again. It holds the executor for every other assignment, is lost when the process stops, and sq2 T4-R07 forbids a second call inside an operation.
Cost accepted: the queue library's request gets an option with one consumer, the AI module.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Adding the next operation with a moment | Runs in the transaction that ends the operation, with the assignment's row locked, as today | A named wait above 900 seconds is cut to 900; the assignment's time limit is checked by its own pass (T2-R08) | The conditional end lets it run once | A named wait that is zero, negative or not a finite number counts as not named |
| Reject or the time limit during the wait | The row lock orders them with a start; the first save wins (sq2 ZA-R03) | — | No effect on an ended operation | — |
| Start of a job whose operation was ended | — | — | No effect | — |
| Request not before a moment | Independent requests | A missing queue throws and rolls the caller back (B1-R05) | Each request is a new job, or a duplicate in deduplication mode | A value that is not a valid point in time throws before anything is sent |

### Verification

Unit tests cover the wait rule with every case of T2-AC02 and the reading of the header (T2-AC01). Integration tests with a test executor and a controlled clock cover T2-AC03, AC05, AC07 and AC08. T2-AC06 and T2-AC09 run through the worker on a real database with moments a few seconds ahead; T2-AC09 is a test of the queue library with a test queue in exclusivity mode and is the proof of the behaviour observed in pg-boss's source. T2-AC04 is a review.

## Order of the tasks

T1 → T2. T2 extends the shared rule for an error answer that T1 changes, and its "lack of funds" exception is T1's. Both follow `oferty-pracy-sq2` as a whole.
