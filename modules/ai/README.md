# AI

Target architecture of the `modules/ai/` module. The module accepts a request to run AI and exposes its state and result through a provider-independent contract. It is responsible for executor configuration, the queue, handling interrupted executions and the shared budget for paid services. [Module map](../../docs/architecture/moduly.md) · [Cross-cutting requirements](../../docs/specs/lokalne-ai/requirements.md)

## Division of responsibility

| Part              | Responsibility                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requesting module | Prepares the needed data and ties the request to its version. Checks the result by its own rules and decides whether the domain result can be saved or published.                                   |
| Integration layer | Translates a specific use case into an instruction and a response schema. Uses the AI module's public operations and passes the requesting module a unified state and a result in an agreed format. |
| AI module         | Chooses the configured executor, persists the configuration, manages the execution state and settles usage. Exposes the result for domain validation.                                               |
| Executor adapter  | Translates the request, response, errors and usage data. Handles the executor's protocol, e.g. the batch cycle or the agent session cycle.                                                          |

The AI module records the execution state, usage and cost. The execution result is the input to an operation of the requesting module, which applies its own conditions for saving and publishing. The execution state, the settlement and the decision to accept the content are separate.

## Public operations

| Operation          | Contract                                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution request  | Takes the settings key, the domain operation ID and the prepared input. Returns the execution ID and its initial state, or a defined error.                                                                                            |
| Execution read     | Exposes the state, the result in the agreed format, usage, cost and the cause of an error or of waiting. Reading the history makes it possible to tell apart executions of the same operation.                                      |
| Execution commands | Allow checking, stopping, skipping, resuming or retrying, according to the executor's capabilities and the execution state. Accepting a command means recording the intent. The confirmed effect is visible in the execution state. |
| Budget read        | Exposes the period limit, the reserved and settled amounts and the funds available for new requests.                                                                                                                                |

Public operations hide the queue, the provider's protocol and how the state is stored. A domain operation has its own ID. Each of its executions has a separate ID, and a paid attempt has a separate settlement record.

## Execution modes

| Mode                  | Flow                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct model call     | The executor sends one request and receives a response, e.g. from the OpenAI Responses API or Ollama. For the module's client, the execution has an ID and a state.                                                                                |
| Batch at the provider | The executor sends a batch, checks its state and assigns the received results to the individual executions. A valid result of one item can be received even when another item ends in an error. An example is the OpenAI Batch API.                |
| Agent session         | The executor manages the session, observes its progress and collects the result and materials from the provided tools. The agent runs the work loop, and the allowed tools depend on the task. The target local executor uses OpenCode and Ollama. |

The settings of a key choose the provider and model, and the adapters set the allowed execution modes. On a request the module persists the input, the instruction and schema version, and the executor settings and any price list. A pending execution keeps this snapshot after the configuration changes. Secrets are read from the runtime configuration. An unavailable executor or a missing required capability gives an explicit state.

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

The sections above describe the target module. This section says what the code does today, so a client knows what it can rely on and what is still simpler than the target. The general contract works with the OpenAI provider in single mode. The Profile, Matching and Companies still run their own AI paths and move to the contract in tasks `oferty-pracy-0mq.9` (Profile) and `oferty-pracy-0mq.17` (Matching and Companies).

### Settings and configuration

A client names its executions with a **settings key**: a name it defines for itself, such as `profile`. Under the key AI keeps the client's settings: the provider, the model and the reasoning effort, and nothing else. Everything else is AI configuration: the price list of each model per execution mode, the token caps a reservation covers, the provider's secret, the endpoints and the parameters of a local runtime.

| What | Where it lives today |
| --- | --- |
| Settings per key | [client-settings.ts](client-settings.ts), fixed in code. The keys appear only in this file; no other AI code depends on a key's value. |
| Models, price lists, caps, local runtime | [model-catalog.ts](model-catalog.ts), fixed in code. |
| Provider secret | `OPENAI_API_KEY` in the environment. |
| Endpoint addresses of a local runtime | `AI_ENDPOINTS_JSON` in the environment. |

AI refuses a request with `not_configured` when the key has no settings, when they are incomplete, or when they name a provider or model AI does not know or a reasoning effort the model does not accept. It does the same when the model has no price list for the mode or the provider's secret is missing. Changing a client's provider or model, or a price, is a code change until the settings move to a table changed through an AI operation.

### Contract available now

| Operation | What it does |
| --- | --- |
| Execution request | Takes the settings key, the domain operation ID, an optional input version, the mode (single, a batch item with its group ID, or agent work with allowed tools), the instruction, the response schema and the input. A request in a mode that no adapter of the chosen provider declares is refused with `unsupported_mode` before anything is reserved. Otherwise, in the caller's transaction, it fixes the settings and the price list, reserves the budget or records a wait for budget, and sends the job to the AI execution queue. Rolling back the caller's transaction rolls all of it back. A group request reserves the whole group or nothing. An operation has at most one execution in progress (waiting for budget, queued, running or delivering); a second request gets `operation_busy`. |
| Execution read | The state, the result, the usage, the cost (reserved, settled, unknown), the cause of a failure or of the client's rejection, and the number of deliveries with the last delivery error. The history read lists every execution of an operation; a retry after a transient error is a new execution of the same operation. |
| Budget read | The month's limit, the reserved and settled amounts and the funds available. |
| Result receiver | A client registers one receiver per settings key where dependencies are composed. AI calls it in the transaction that settles the cost: with a result that is valid JSON, or with the cause of a final state without a result. The receiver accepts or rejects the result. The cost is settled whatever it decides, and an unknown cost stays reserved. |

### Execution states and delivery

An execution moves through `waiting_budget`, `queued`, `running` and `delivering` to one of the final states `completed`, `rejected`, `failed` or `retried`.

1. The worker claims a queued execution and calls the provider once.
2. AI saves the result or the cause, and the usage and cost, with the execution, and sets `delivering`. The cost stays reserved.
3. AI delivers: in one transaction it calls the receiver, settles the cost and sets the final state from the receiver's decision.

An exception thrown by the receiver is not a decision. The delivery transaction rolls back in full, so none of the receiver's writes and no settlement remain. The execution stays `delivering` with its result saved, and the AI execution queue runs the job again (three retries with a growing delay). The provider is not called again. A receiver must therefore accept the same delivery more than once. Only the receiver's decision, or a failure on the AI side such as a provider error, ends an execution.

The columns `state` and `cause` of the AI executions table are the only record of a general execution's stage and of the cause of its end.

### Simplifications

The coordination is simpler than the target in the points below. None of them changes the behaviour of the existing Profile, Matching and Companies paths, which keep their own handling until they move to the contract. Improvements beyond moving the existing behaviour belong to the epic `oferty-pracy-sq2`.

- **Single mode only.** Only the OpenAI adapter takes part in the coordination, and it declares single mode only. Batch items and agent work are refused at request time with `unsupported_mode`, with nothing reserved or queued. The batch and research adapters, with the research reservation rule, come from the Matching and Companies code in task `oferty-pracy-0mq.17`; once an adapter declares a mode, requests in it work without a change to the request.
- **No local execution yet.** Settings that name the local model (Ollama) are refused by the contract with `unsupported_mode`: no adapter of that provider takes part in the coordination. The Ollama adapter is in the module and the Profile's local path still uses it directly; the shared local slot and the local execution join the coordination in task `oferty-pracy-0mq.9`.
- **Transitional stage record of the local Profile path.** Rows written by the existing local Profile path keep `state` empty and record their stage in the columns `result_status`, `error_code`, `disposition` and `publication_allowed`. Only that path writes and reads them, until task `oferty-pracy-0mq.9` migrates its rows to `state` and `cause`; removing the columns belongs to `oferty-pracy-sq2`. The column `runtime_state` is not part of this record: it keeps what is observed about the process on the local model.
- **Delivery after the last retry.** An execution whose receiver keeps failing stays `delivering` with its cost reserved after the queue's retries. Recovery does not deliver it again; a person has to act. Redelivering by hand is a matter for `oferty-pracy-sq2`.
- **No detection of interrupted work.** An execution whose worker stopped stays running, and its operation cannot get a new execution. Recovery only sends again the jobs of queued executions and funds the ones that wait for budget. Detecting interrupted work belongs to task `oferty-pracy-0mq.15`.
- **Retries as before.** An error the adapter judges transient gives one more attempt, as the Profile path does today. The OpenAI adapter judges a rate limit or server error with an acceptable wait, and a request that may have been sent without a response, as transient; the coordination and the Profile path read only that judgement and the suggested wait. Execution commands (stopping, skipping, resuming, explicit retry) do not exist yet.
- **Uncertain cost as before.** When the provider was called, any error leaves the cost unknown and reserved unless the adapter reports the usage. Only an execution that no adapter could take settles at zero, because nothing reached a provider.
- **Schema check.** AI checks only that the result is a JSON value; anything else ends the execution as failed with the cause `format`. The provider enforces the response schema (OpenAI strict structured output), and the client validates the content. A provider whose schema enforcement differs, such as the local model joining in task `oferty-pracy-0mq.9`, needs a schema check in the coordination before it is added.
- **Composition.** The AI module registers its built-in adapters itself. The worker connects the queue and runs the queue handler and recovery. The server connects nothing yet, because no route requests an execution; the first client that requests one from a route connects the queue there.
- **Transitional exports.** The public entry point also exports the price lists, budget and adapters that the Profile, Matching and Companies use today; they read prices and caps from the same AI configuration. Tasks `oferty-pracy-0mq.9` and `oferty-pracy-0mq.17` remove these exports. The local slot operations still live in the shared code and move with the local path in task `oferty-pracy-0mq.9`.

The module owns the shared AI building blocks and a working general contract. Its clients move to that contract in the tasks named above, and any new guarantee of handling or settlement is a matter for `oferty-pracy-sq2`.
