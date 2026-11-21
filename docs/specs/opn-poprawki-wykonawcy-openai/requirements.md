# Paid executor: readable provider errors, longer answers and a wait before a retry — Requirements

Basis: [PRD](PRD.md). Technical solution: [solution-design.md](solution-design.md). Concepts: [domain glossary](../../../GLOSSARY.md#ai-module).

Section `T<n>` describes stage n of the PRD and the Beads task `oferty-pracy-opn.<n>`. Requirement IDs (`T<n>-R..`) and criterion IDs (`T<n>-AC..`) are stable, and the Beads task of a stage cites criteria by ID. The *Check* column says how the implementer proves that a criterion is met. No criterion needs the owner: a check "requested from the running application" is made by the implementer against the application started in its sandbox.

**Sources.** `(owner, 2026-11-21)` cites the owner's decisions in the conversation of that day about the [research](../../research/openai-integracja-wzorcowa.md); the research itself is cited as `(research)`. References that start with `sq2` point into the [requirements of AI assignments](../sq2-zlecenia-ai/requirements.md), for example sq2 T4-R02; this epic builds on that epic as delivered.

**Words.** *Operation*, *assignment*, *executor*, *potential cost* and *needs attention* have their glossary meaning. *Provider* is the service an executor calls. *Error answer* is a provider's answer that reports an error instead of doing the work.

**Depends on** `oferty-pracy-sq2` as a whole: the old way of requesting AI work is removed, and the AI assignments panel with its Retry and Reject exists.

<a id="wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| PW-AC01 | All of the project's automated quality checks pass: code rules and formatting, types, the application build, and automated tests including the tests on a real database. | Full run of the quality checks |
| PW-AC02 | Code created or moved in the task belongs to the module that owns its data and rules, and uses modules only through their public operations, in line with the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). | Code review |

<a id="t1"></a>

## T1. Longer answers and readable provider errors (`oferty-pracy-opn.1`)

### Scope

The paid executor's room for an answer, how it reads an answer's text, what it keeps of a provider's error answer and of its requests, what the panel shows of it, and the failure for lack of funds at the provider. Out of scope: the price list's rates, the time limits of a request and the maximum run times (sq2 T2-R06), the raw response in the panel.

### Requirements

| ID | Requirement |
| --- | --- |
| T1-R01 | **Room for an answer.** Every request of the paid executor allows the model up to 25,000 output tokens: the one request of a single answer and each of the two steps of an agent session. (owner, 2026-11-21; the research gives the provider's suggestion of 25,000 for reasoning models) |
| T1-R02 | **Potential cost follows.** The paid executor's price list counts 25,000 output tokens for a single answer and 50,000 for an agent session, so an operation's potential cost covers the room of T1-R01. With today's rates and exchange rate the potential cost is 0.3125 PLN for a single answer and 0.525 PLN for an agent session. The rates, the exchange rate, the input caps and the cap of paid tool calls stay as the price list has them. (owner, 2026-11-21) |
| T1-R03 | **Text in several parts.** When a complete answer holds its text in more than one part, the result is the parts joined in the order received. An answer with no text, or with only blank text, remains the ordinary failure "no usable content". This holds for a single answer and for the last step of an agent session. (owner, 2026-11-21) |
| T1-R04 | **Request identifiers.** The paid executor sends its own identifier with every request to the provider and keeps, for each request of an operation, that identifier and the identifier the provider returned for it, when one came. They are kept with the operation when it ends, whatever its outcome. An operation whose work was interrupted keeps none. (owner, 2026-11-21; research) |
| T1-R05 | **Provider's error.** When the provider answers with an error, the operation also keeps the provider's error code, error type and message as given; a message longer than 500 characters is cut to 500. An error answer that carries none of them keeps none. Together with T1-R04 this is the operation's *provider detail*. (owner, 2026-11-21) |
| T1-R06 | **Any executor.** Provider detail is part of what every executor may report with an outcome; the AI module keeps it without interpreting it. An executor that reports none, as the local executor does, leaves the operation without one. |
| T1-R07 | **Shown in the panel.** The details of an assignment show, for each operation that has a provider detail, below the cause: the provider's error code and message when present, and the request identifiers. An operation without a provider detail shows nothing in that place. The panel still shows no raw response. (owner, 2026-11-21) |
| T1-R08 | **No funds at the provider.** When the provider answers that the account has no funds or has reached its spending limit, the operation ends as a non-retryable failure with the cause "the provider answered with an error", with nothing charged. By sq2 T4-R03 the assignment then needs attention. (owner, 2026-11-21) |
| T1-R09 | **Kept: the other error answers.** A rate limit that is not a lack of funds remains an ordinary failure with nothing charged. A server error remains an ordinary failure of unknown cost. An input beyond the model's context remains a non-retryable failure. Any other error answer that the provider cannot take at all remains a non-retryable failure of unknown cost. |
| T1-R10 | **Kept: one request, kept exchange.** Each request is still sent once (sq2 T4-R07), and the exact request and each raw response are still saved with the operation before the request is sent and before the response is read (sq2 T2-R08). The identifier of T1-R04 is the only addition to what is sent. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T1-AC01 | A paid single answer is sent allowing 25,000 output tokens, and each of the two steps of a paid agent session is sent allowing 25,000. (T1-R01) | Automated test with a simulated provider |
| T1-AC02 | The potential cost charged at the start of a paid single answer is 0.3125 PLN and of a paid agent session 0.525 PLN; an operation whose usage is within the new caps gets its actual cost computed, and one above them an unknown cost. (T1-R02) | Automated test on a real database |
| T1-AC03 | A complete answer with its text in two parts gives a result equal to the parts joined in order, for a single answer and for an agent session; an answer with two blank parts ends as the ordinary failure "no usable content". (T1-R03) | Automated test with a simulated provider |
| T1-AC04 | Every request the paid executor sends carries its own identifier, different for each request. After a result, after an error answer and after a connection broken once the request was sent, the operation holds the sent identifier of each request and the provider's identifier where the provider answered. (T1-R04) | Automated test on a real database |
| T1-AC05 | After an error answer with a code, a type and a message of 600 characters, the operation holds the code, the type and the first 500 characters of the message; after an error answer that is not readable, it holds the request identifiers only. (T1-R05) | Automated test on a real database |
| T1-AC06 | An operation of the local executor, and an operation of a test executor that reports no provider detail, end with none; a test executor's provider detail is stored as reported. (T1-R06) | Automated test on a real database |
| T1-AC07 | The details read of an assignment returns the provider detail of each of its operations, and the details page shows the error code, the message and the request identifiers for an operation that has them and nothing in their place for one that has none. (T1-R07) | Automated test of the read and of the view's state, and the page requested from the running application in the sandbox |
| T1-AC08 | An error answer that reports a lack of funds ends the operation as a non-retryable failure with the cause "the provider answered with an error" and a cost of zero, and its assignment needs attention with one operation. (T1-R08) | Automated test on a real database |
| T1-AC09 | A rate limit answer without a lack of funds, a server error, an input beyond the context and another client error each end with the outcome and cost of T1-R09. (T1-R09) | Automated test with a simulated provider |
| T1-AC10 | With a simulated provider, the paid executor calls the provider once per request of an operation, and the exchange of the operation holds the request and the raw response of each, also for an error answer. (T1-R10) | Automated test on a real database |

<a id="t2"></a>

## T2. A wait before an automatic retry (`oferty-pracy-opn.2`)

Depends on [T1](#t1). Takes up item 10 of the collection task `oferty-pracy-sz5`.

### Scope

The moment the next automatic operation of an assignment starts after its provider was temporarily unavailable, and the option of the shared way of requesting background work that it needs. From this task the rule of sq2 T4-R02 "with no delay" holds only for the failures T2-R03 names. Out of scope: holding back other assignments of the executor, a wait after the owner's Retry, a wait for the local executor.

### Requirements

| ID | Requirement |
| --- | --- |
| T2-R01 | **Temporarily unavailable.** With an ordinary failure, an executor may report that its provider is temporarily unavailable, and the wait the provider named, when it named one. The paid executor reports it for a rate limit that is not a lack of funds (T1-R08) and for a server error. The local executor never reports it. (owner, 2026-11-21) |
| T2-R02 | **The wait.** When an automatic operation ends with such a failure and sq2 T4-R02 adds the next operation, that operation does not start before a wait has passed, counted from the end of the failed operation: the wait the provider named, when it is above zero, but at most 15 minutes; otherwise 1 minute after the assignment's first automatic operation and 5 minutes after its second. (owner, 2026-11-21) |
| T2-R03 | **No wait otherwise.** After any other ordinary failure the next automatic operation is added with no wait, as sq2 T4-R02 says. The owner's Retry (sq2 T12-R01) adds its operation with no wait. |
| T2-R04 | **Same rule for every executor.** The wait of T2-R02 is a rule of the AI module's handling of assignments. It names no executor and no provider; it uses only what T2-R01 lets an executor report. (sq2 T2-R09) |
| T2-R05 | **What the waiting operation is.** During the wait the operation is pending and waits for its executor; it keeps the moment before which it will not start. Nothing is charged for it until it starts (sq2 T3-R02). The details of the assignment show the operation's state "Oczekuje na wykonawcę" with that moment, labelled "nie wcześniej niż", while the operation is pending. (owner, 2026-11-21) |
| T2-R06 | **Others are not held back.** While an operation waits this way, other operations of the same executor start in their order. (owner, 2026-11-21) |
| T2-R07 | **Ended while waiting.** A waiting operation is ended like any pending operation when its assignment is rejected or passes its time limit (sq2 T12-R03, T6-R07); when its moment then comes, nothing starts and nothing is charged. |
| T2-R08 | **Limits stay.** The wait changes neither the count of automatic operations (sq2 T4-R01) nor the assignment's time limit (sq2 T6-R06): an assignment whose time limit passes during a wait fails by sq2 T6-R07. |
| T2-R09 | **Background work not before a moment.** A module may request a queue job that is not to be carried out before a given moment, as part of its own save like any request. Until that moment the worker does not take the job; other jobs of the same queue, also those with the same exclusivity key, are carried out meanwhile. A moment that has already passed means no wait. A request without a moment behaves as it did before this task. |

### Acceptance criteria

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| T2-AC01 | For a rate limit answer without a lack of funds and for a server error, the paid executor reports an ordinary failure with the provider temporarily unavailable, and the wait named by the provider when the answer names one in seconds or as a date; for a lack of funds, for every other failure and for the local executor it reports none. (T2-R01) | Automated test with a simulated provider |
| T2-AC02 | With a test executor that reports the provider temporarily unavailable: with a named wait of 30 seconds the next operation's moment is 30 seconds after the end; with a named wait of one hour, 15 minutes after it; with none, 1 minute after the first automatic operation and 5 minutes after the second; with a named wait of zero, as with none. (T2-R02) | Automated test on a real database with a controlled clock |
| T2-AC03 | After an ordinary failure that does not report the provider temporarily unavailable, and after the owner's Retry, the added operation has no moment and its work can be taken at once. (T2-R03) | Automated test on a real database |
| T2-AC04 | The code that computes the wait and adds the next operation names no executor and no provider, and reads nothing of an outcome beyond what the executor contract defines. (T2-R04) | Code review |
| T2-AC05 | During the wait the operation is pending, waiting for the executor, with its moment stored and no potential cost; the details read returns the moment, and the details page shows "Oczekuje na wykonawcę" with "nie wcześniej niż" and the moment for it, and no such text for a pending operation without a moment. (T2-R05) | Automated test on a real database and of the view's state, and the page requested from the running application in the sandbox |
| T2-AC06 | With one assignment's operation waiting for a moment in the future, a second assignment for the same executor is carried out before that moment; after the moment the waiting operation is carried out and, with a provider that then answers, the assignment succeeds. (T2-R06) | Automated test on a real database, through the worker |
| T2-AC07 | An assignment rejected during the wait, and one whose time limit passes during it, end as failed with the waiting operation ended as not started; when the moment has passed, the executor was not called again and nothing was charged. (T2-R07, T2-R08) | Automated test on a real database |
| T2-AC08 | An assignment whose executor reports the provider temporarily unavailable three times ends in needs attention with three operations, the second and third of which carried a moment. (T2-R08) | Automated test on a real database |
| T2-AC09 | A queue job requested with a moment in the future, in a queue with an exclusivity key, is not carried out before that moment, while a job requested later with the same key value and no moment is; the first is carried out after its moment. A job requested with a moment in the past is carried out at once. A job requested with a moment in a save that is rolled back is not in the queue. (T2-R09) | Automated test on a real database, through the worker |
