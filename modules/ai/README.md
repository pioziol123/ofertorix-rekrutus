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
