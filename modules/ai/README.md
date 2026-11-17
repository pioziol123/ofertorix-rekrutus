# AI

Target architecture of the `modules/ai/` module. The module accepts a request to run AI and exposes its state and result through a provider-independent contract. It is responsible for executor configuration, the queue, handling interrupted executions and the shared budget for paid services. [Module map](../../docs/architecture/moduly.md) · [Cross-cutting requirements](../../docs/specs/lokalne-ai/requirements.md)

## Division of responsibility

| Part | Responsibility |
| --- | --- |
| Requesting module | Prepares the needed data and ties the request to its version. Checks the result by its own rules and decides whether the domain result can be saved or published. |
| Integration layer | Translates a specific use case into an instruction and a response schema. Uses the AI module's public operations and passes the requesting module a unified state and a result in an agreed format. |
| AI module | Chooses the configured executor, persists the configuration, manages the execution state and settles usage. Exposes the result for domain validation. |
| Executor adapter | Translates the request, response, errors and usage data. Handles the executor's protocol, e.g. the batch cycle or the agent session cycle. |

The AI module records the execution state, usage and cost. The execution result is the input to an operation of the requesting module, which applies its own conditions for saving and publishing. The execution state, the settlement and the decision to accept the content are separate.

## Public operations

| Operation | Contract |
| --- | --- |
| Execution request | Takes the task type, the domain operation ID and the prepared input. Returns the execution ID and its initial state, or a defined error. |
| Execution read | Exposes the state, the result in the agreed format, usage, cost and the cause of an error or of waiting. Reading the history makes it possible to tell apart executions of the same operation. |
| Execution commands | Allow checking, stopping, skipping, resuming or retrying, according to the executor's capabilities and the execution state. Accepting a command means recording the intent. The confirmed effect is visible in the execution state. |
| Budget read | Exposes the period limit, the reserved and settled amounts and the funds available for new requests. |

Public operations hide the queue, the provider's protocol and how the state is stored. A domain operation has its own ID. Each of its executions has a separate ID, and a paid attempt has a separate settlement record.

## Execution modes

| Mode | Flow |
| --- | --- |
| Direct model call | The executor sends one request and receives a response, e.g. from the OpenAI Responses API or Ollama. For the module's client, the execution has an ID and a state. |
| Batch at the provider | The executor sends a batch, checks its state and assigns the received results to the individual executions. A valid result of one item can be received even when another item ends in an error. An example is the OpenAI Batch API. |
| Agent session | The executor manages the session, observes its progress and collects the result and materials from the provided tools. The agent runs the work loop, and the allowed tools depend on the task. The target local executor uses OpenCode and Ollama. |

The configuration sets the allowed execution modes and the model choice for a task type. On a request the module persists the input, the instruction and schema version, and the executor settings and any price list. A pending execution keeps this snapshot after the configuration changes. Secrets are read from the runtime configuration. An unavailable executor or a missing required capability gives an explicit state.

## State and retries

- **Shared local queue.** All local executions use one slot in the installation. The slot stays occupied during work, intervention, waiting for a stop confirmation and when the state is unknown. Releasing it requires confirmation that the specific execution has ended.
- **Recovering work.** After an interruption the module checks the existing execution and resumes receiving the state or the result, if the executor allows it. It records an uncertain submission as a state that needs resolving.
- **Resume and retry.** Resuming continues the same execution. An explicit retry creates a new execution with the saved snapshot of input and settings. The previous result stays in the history, and the previous execution loses the ability to publish. New data or settings require a new request.
- **Execution result and domain result.** When the executor finishes its work, the response can be received. The requesting module checks whether the response belongs to the current execution, whether the input version still allows applying it and whether the content meets the domain rules.

[Queue, session and command contracts](../../docs/specs/lokalne-ai/kontrakty-runtime.md)

## Budget and settlement

- **Reservation.** Before starting a paid attempt, AI reserves funds from the shared budget based on the saved cost configuration. A request without available funds waits for the budget.
- **Settlement.** AI settles an attempt based on confirmed usage. Rejection of the content by the requesting module still allows the incurred cost to be settled. An unknown cost stays reserved until it is clarified.
- **Local execution.** Local inference has zero API cost and is available when the paid budget is exhausted. A paid tool used in a local task requires a reservation. Unknown usage stays an unknown.

The execution history links the state, the cause, the result, usage and artefacts to the execution ID. Diagnostic messages contain only the needed IDs and causes. Input content, raw responses and tool materials have separate access through the execution history, according to the contract of the given mode of work.

## State of implementation

The sections above describe the target module. This section says what the code does today, so a client knows what it can rely on. The general contract exists; the Profile, Matching and Companies still run their own AI paths and move to it in tasks `oferty-pracy-0mq.9` (Profile) and `oferty-pracy-0mq.17` (Matching and Companies).

### Contract available now

| Operation | What it does |
| --- | --- |
| Execution request | Takes the job type (the key of an existing configuration and price list: `profile`, `matching`, `research`), the domain operation ID, an optional input version, the mode (single, a batch item with its group ID, or agent work with allowed tools), the instruction, the response schema and the input. In the caller's transaction it fixes the provider, model and price list, reserves the budget or records a wait for budget, and sends the job to the AI execution queue. Rolling back the caller's transaction rolls all of it back. A group request reserves the whole group or nothing. An operation has at most one execution waiting, queued or running. |
| Execution read | The state, the result, the usage, the cost (reserved, settled, unknown) and the cause of a failure or of the client's rejection. The history read lists every execution of an operation; a retry is a new execution of the same operation. |
| Budget read | The month's limit, the reserved and settled amounts and the funds available. |
| Result receiver | A client registers one receiver per job type where dependencies are composed. AI calls it in the transaction that saves the settlement: with a result that is valid JSON, or with the cause of a final state without a result. The receiver accepts or rejects the result. The cost is settled whatever it decides, and an unknown cost stays reserved. |

A refused request raises a defined error: no configuration, a mode the configured execution does not offer, a provider that cannot run here yet, an operation that already has an execution in progress, or an incomplete request.

### Simplifications

The coordination is simpler than the target in these points. None of them changes the behaviour of the existing Profile, Matching and Companies paths, which keep their own handling until they move to the contract. Improvements beyond moving the existing behaviour belong to the epic `oferty-pracy-sq2`.

- **Single mode only.** Only the OpenAI adapter takes part in the coordination, in single mode. A batch item or agent work ends in the failed state with the cause `unsupported_mode`, and nothing is charged. The batch and research adapters come from the Matching and Companies code in task `oferty-pracy-0mq.17`.
- **No local execution yet.** A request for a job type configured for the local model (Ollama) is refused as `executor_unavailable`. The Ollama adapter is in the module, but the shared local slot and the local execution mechanism join the coordination in task `oferty-pracy-0mq.9`.
- **No detection of interrupted work.** An execution whose worker stopped stays running, and its operation cannot get a new execution. Recovery only sends again the jobs of queued executions and funds the ones that wait for budget. Detecting interrupted work belongs to task `oferty-pracy-0mq.15`.
- **Retries as before.** A transient error (HTTP 429 or 5xx with an acceptable wait, or a request that may have been sent without a response) gives one more attempt, as the Profile path does today. Execution commands (stopping, skipping, resuming, explicit retry) do not exist yet.
- **Schema check.** AI checks only that the result is valid JSON; the provider enforces the response schema, and the client validates the content.
- **Composition in the worker only.** The worker connects the queue, registers the OpenAI adapter and runs the queue and recovery. The server connects nothing yet, because no route requests an execution; the first client that requests one from a route connects the queue there.
- **A receiver error** rolls back the client's writes and ends the execution as failed with the cause `receiver_error`; the cost is still settled.
- **Transitional exports.** The public entry point also exports the configuration, budget and adapters that the Profile, Matching and Companies use today. Tasks `oferty-pracy-0mq.9` and `oferty-pracy-0mq.17` remove them. The local slot operations still live in the shared code and move with the local path in task `oferty-pracy-0mq.9`.
- **Selection rule in two places.** The Profile still chooses its provider with its own copy of the configuration rule until task `oferty-pracy-0mq.9` makes it a client of the contract.

The module now owns the shared AI building blocks and a working general contract. Its clients move to that contract in the tasks named above, and any new guarantee of handling or settlement is a matter for `oferty-pracy-sq2`.
