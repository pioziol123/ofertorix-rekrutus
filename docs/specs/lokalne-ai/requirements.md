# Local AI and the research agent — cross-cutting requirements

Status: **scope and product decisions approved**, updated 2026-11-05. The owner's conversation settled the rules described as confirmed. The technical contracts serve staged implementation, and the integration trials remain to be done. Preparing this package is not proof of deployment.

Product goal and scope: [PRD](PRD.md). Order: [stage plan](README.md). Technical design: [solution design](solution-design.md). Beads keeps the execution state: `bd show oferty-pracy-334`.

## Confirmed owner's decisions — update 2026-11-04

- Model for all local uses: **`gpt-oss:20b` in a local Ollama**, without the `-cloud` variant.
- Research agent: **OpenCode**. The project integrates its execution and result; it does not implement its own agent loop.
- **No limits on Ollama use**: no budget, token quotas, or limits on the number of calls or agent rounds imposed by the application. We do not copy the paid OpenAI limits into the local path. The parameters of the real context window are a property of the model and its launch, not an application usage limit. We keep validation and the handling of errors, interruption and restart.

These decisions replace the earlier proposals for choosing a model, a custom agent loop and limiting local work. The reviewed SDs keep the implementation contracts; execution has not been verified.

## Clarification confirmed 2026-11-05

The owner confirmed a separate choice of model and execution method for the profile, assessments and research. Initial set: profile and assessments — Ollama `gpt-oss:20b` directly; research — OpenCode using Ollama `gpt-oss:20b`. This is the choice for the local path once it is enabled, not an automatic redirection of existing installations and OpenAI requests. OpenCode is the agent runtime, not a model.

The following rules were also confirmed:

- Server configuration in `.env`, without a selection screen for each request. The exact variable format remains an SD contract.
- We check the availability of the configured model through the Ollama model list API (`GET /api/tags`). A missing model gives an explicit error without automatic download or fallback. We do not require benchmarks or a separate pilot of answer quality; the owner assesses usefulness during normal use. Answer validation and technical integration tests remain.
- Cancellation tries to stop the agent if the runtime allows it. A lost connection alone does not confirm the stop. LA-11/15 and the runtime contracts define the rules for restart/unknown, the queue and explicit retry.
- We keep reports, evidence, sessions, conversations, events and diagnostics indefinitely; no automatic deletion or data-destroying rotation. We still do not save secrets. This applies to the data of this integration; it does not change the existing cleanup of files at the OpenAI provider.
- Each new local assessment group has at most 20 items. We split a larger request into groups of up to 20, for example 30 → 20 + 10; all items remain in the request. This is batching of work, not a quota on model use. We keep separate results and state counters.

Google through a browser was confirmed as the initial search method. At this stage we do not use a paid search engine API. Chrome DevTools MCP, intervention and the scope of material were chosen; whether the integration works is subject to the technical gates T03–T05. We do not guarantee Google's availability. The owner extended the scope with a [task management panel](features/panel-zadan/requirements.md): check, stop and skip. The semantics of these commands and the panel scope were confirmed in the panel requirements; the latest addition about the queue is below. The SD and the runtime contracts describe the integration/restart contract; whether it works needs tests of the pinned version.

## Relation to existing requirements

This is an extension of the ways of executing AI, not a new definition of the profile, assessment or research. The rules for the [profile](../pierwsza-wersja/features/profil/requirements.md), [matching](../pierwsza-wersja/features/dopasowanie/requirements.md), [research](../pierwsza-wersja/features/firmy-research/requirements.md) and [operations and budget](../pierwsza-wersja/features/operacje/requirements.md) still apply.

The existing requirements AC-B1 and AC-G4–G7 describe executing assessments through Batch. The proposed extension keeps them for OpenAI Batch; local assessments have a group of independent tasks, with no obligation to create a JSONL file. Before that stage, this scope must be added to the canonical matching pair. We do not silently change the meaning of the existing criteria.

The [separate requirements/SD pairs](README.md#requirements-and-sd-for-each-stage) contain the detailed scope of each stage, the local criteria E01–E09 and their verification. LA-01–LA-21 below remain the canonical cross-cutting criteria.

## Requirements and acceptance

| ID | Behaviour | Acceptance criterion |
| --- | --- | --- |
| LA-01 | The provider and model can be chosen separately for the profile, assessments and research; an unsupported combination is explicitly rejected. | A mixed configuration works. A missing configuration or required capability sends no data; it does not switch the provider automatically. |
| LA-02 | The refactor keeps existing results, history and active OpenAI operations. | Older configurations and batches can be read, collected and cleaned up after deployment. Identical commands do not create further operations; the existing tests pass. |
| LA-03 | The choice of executor, model, instruction version, inputs, launch parameters and prices of paid services is saved with the request. | A change of the environment configuration does not redirect a pending operation. For the agent we save the OpenCode runtime and the session identifier. Secrets are not saved in the snapshot. A new request uses the new settings. |
| LA-04 | Local profile import does not need an OpenAI key or a price list for a paid model. | With an empty key and price list, Ollama prepares a proposal that passes the existing quote check. The profile changes only after approval. |
| LA-05 | Local single and bulk assessments keep the matching rules. | The same validators of evidence, unknowns, rating, freshness and history as for OpenAI. An error in one item does not remove the correct results of others; repeated delivery does not publish the same assessment a second time. |
| LA-06 | Cost and usage are independent of task success. | The local model has an API cost of zero even without token telemetry; we do not pretend that usage is zero. An exhausted budget for paid services does not block purely local work. Paid tools still need a reservation. |
| LA-07 | OpenCode performs research with the `gpt-oss:20b` model, search and page reading; the research module checks the report. | The project does not implement a second agent loop. OpenCode does not write reports or company links directly. Claims refer to evidence that was actually received; a lack of sources remains an explicit failure or an unknown consistent with the existing contract. The old report remains available. |
| LA-08 | Local work has no Ollama usage quotas; it has a controlled execution state and a defined course after a restart. | A long run is not interrupted because of a quota on tokens, calls, rounds or a fixed deadline of local work. A missing model, invalid JSON, exceeding the physical context, a tool error, an interruption and a process crash have an explicit state. A restart checks the specific OpenCode session; it does not start a second agent for an operation that is already active, or repeat a paid call with an unknown outcome. |
| LA-09 | Research tools read only allowed public resources. | The agent has no access to files, the shell or data writes. Reading blocks private and local addresses also after redirects and DNS resolution; page content and tool arguments are subject to limits and validation. The exception for the configured local Ollama address does not cover web tools. |
| LA-10 | One shared deployment keeps the execution method recognisable and lets new requests be changed. | The UI and history show the provider/model and the correct local or Batch state. It is possible to go back to OpenAI for new tasks without deleting the local history and without rewriting pending tasks. |

An API cost of zero does not mean zero cost of energy or hardware. A local model does not mean offline research: queries go to the chosen search source, and reading visits public pages. We do not pass the CV or the full professional profile to the search engine.

## Scope boundaries

The first agent supports the existing manual basic research. Deep research and automated thresholds remain separate work; we do not consider them finished by this refactor. We do not change the rating rules, the owner's decisions, ad import, backups or the application stack.

The first release does not include automatic model choice, model download, cloud fallback, arbitrary agent tools or building a general agent platform. A new settings screen is not a condition of the first release — the confirmed configuration is server-side in `.env`.

## Decisions and technical conditions

| ID | What to settle | What it blocks |
| --- | --- | --- |
| O-L1 | Model choice closed: `gpt-oss:20b`; agent runtime closed: OpenCode. Check model availability through GET /api/tags and the correctness of the technical integration. No separate pilot of answer quality; the owner assesses quality in normal use. | Connection readiness and model presence; does not need a benchmark, a new model choice or a new runtime choice. |
| O-L2 | Decisions closed: Google, Chrome DevTools MCP, state per execution, intervention and archive. The technical contract is described in the runtime contracts. | Verification of T03–T05 before enabling live tools; does not block the profile or assessments. |
| O-L3 | OpenCode HTTP, sessions, the shared queue of one local AI work item, restart, cancellation, result and retention described in the runtime contracts. | T01/T02 before enabling the live agent: proof that the pinned version works, without a quality benchmark. |
| O-L4 | Review of the relevant stage's pair and the current code before implementation. The owner's decisions recorded above are approved; we do not reopen them at each stage. | Implementation readiness of a specific task; a deviation from the approved behaviour is reported to the owner, and the implementer settles routine details within the SD. |

OpenCode is the chosen agent runtime. The project needs a launch/session adapter, configuration of a dedicated research agent and evidence integration; it does not need its own agent framework.

## Panel confirmation — 2026-11-05

The first scope is AI tasks. Actions cover a single item or a group of up to 20, not the whole parent request. "Pomiń" (Skip) tries to stop the work and blocks publication, letting the group continue. An explicit retry is also allowed in running/unknown: the previous execution loses the right to publish and gets a stop attempt; we keep its late response for inspection. Automatic recovery still does not start a duplicate. Other confirmed rules: [task panel](features/panel-zadan/requirements.md). The Google flow through a dedicated browser, with user intervention when blocked, was accepted.

Confirmed decision 2026-11-05: OpenCode controls a dedicated Google Chrome through **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP is not part of the chosen integration. Details: [stage 7 SD](etapy/07-narzedzia-www/solution-design.md). The choice does not mean that implementation has started or that services have been installed.

## Agent queue, browser and resumption — confirmed 2026-11-05

The decisions below replace earlier conflicting proposals. Confirming them does not start implementation.

| ID | Confirmed rule | Acceptance criterion |
| --- | --- | --- |
| LA-11 | Because the computer has few resources, executions of the profile, single assessments and research go into a shared durable queue; at most one local AI work item runs at a time across the whole installation. The same restriction covers direct Ollama calls for the profile and assessments. | Two requests of any local kinds, even when picked up by different workers, do not run two local AI work items in parallel. Waiting for intervention, cancelling and unknown keep the slot occupied until the end of the work is confirmed. A retry can be saved at once, but its start waits for the slot to be freed. A restart or lease expiry does not allow a second agent to start while the state of the first is uncertain. |
| LA-12 | Each execution has its own OpenCode session and dedicated Chrome state. Public pages, without signing in to the owner's accounts; a new execution starts with a clean state. Cookies stay within the execution, also during intervention and resumption. | A later execution does not inherit the cookies or tabs of the previous one; resuming the same execution keeps its state as long as the environment still exists. The execution state is tied to its ID, and the inability to restore it is explicit. |
| LA-13 | We keep the text actually passed to the agent, the URL, title, read time and execution ID, distinguishing a Google snippet from a page that was read. We keep the conversation and the tool calls. We take screenshots on blocks, errors and user intervention. | The report points to the saved versions of the evidence. By default we do not save all page resources or all network traffic. Collected material keeps indefinite retention without secrets. The Chrome profile, cookies and cache are removable working state after confirmed completion and saving of the material; we do not remove them during activity or intervention. Cleanup does not remove the archive. |
| LA-14 | Ollama and OpenCode are separate local services started with prepared commands/a script. The application connects to the addresses from `.env`, checks availability and shows errors; the research environment manages Chrome. | The launch instructions cover the services and the browser. An unavailable service gives an explicit state without an automatic switch to the cloud. No separate end-user application is created. |
| LA-15 | After the block is removed, the user chooses "Wznów" (Resume) in the panel. The same execution continues; a restart first checks the existing session. If the state cannot be confirmed, the result is unknown. | "Wznów" does not create a new execution or a second active session. An explicit retry creates a new ID and blocks publication of the previous result, but its start still respects LA-11. |

O-L2: the product decisions on the browser, cookies, evidence and intervention are closed; technical verification of isolation and of capturing material remains. O-L3: headless HTTP OpenCode and separate services were chosen; correlation, recovery, result and interruption need technical checks of the pinned version. A model quality benchmark is not needed.

The technical details of execution and their gates are maintained in one place: [runtime contracts](kontrakty-runtime.md). Entry instructions for the implementer: [hand-off to the local model](przekazanie-lokalnemu-modelowi.md).

## Outcome of the grill-me interview — approved 2026-11-05

The owner confirmed the shared understanding of Q1–Q13. The rules below, together with the changed LA-11/13, replace the earlier proposals. The stages define the implementation, not separate releases.

| ID | Confirmed rule | Acceptance criterion |
| --- | --- | --- |
| LA-16 | We deploy the whole epic together, with the task panel. | Release acceptance covers all nine stages and PZ-01–08. The profile/assessments/research can be tested in turn during implementation, but this is not a separate release for the owner. |
| LA-17 | "Ponów" (Retry) is manual and keeps the input, instructions, schema, model and parameters of the previous execution. | After a change of the profile or `.env`, the retry still has an identical snapshot and a new execution ID; a missing saved model version gives an error, without substitution. Using new data/settings needs a new request. Invalid JSON, quotes or report end the attempt without another automatic generation; the answer and the error remain available for inspection. |
| LA-18 | The application reports infrastructure problems; it does not repair services. | It does not automatically restart or reconfigure Ollama, OpenCode or the network infrastructure. The emergency instructions describe manually ending the dedicated OpenCode/Chrome environment and, if needed, manually restarting Ollama. Health alone does not confirm the end of the old execution; only a confirmation frees the queue. |
| LA-19 | In local research, Google serves to find a source, and a report finding needs a public page that was actually read. | A Google snippet alone is not enough to publish a fact/opinion; it stays in the archive, not in the set of evidence admissible for a claim. When there is no basis for a correct report, an explicit lack of data does not replace the previous report. |
| LA-20 | Queries use only company and position data, without data from the professional profile. | Allowed: company name, domain, country, position and technologies from the ad. The owner's contact data, employment history, experience and preferences do not go into queries or public tools. |
| LA-21 | Research checks the existing categories and finishes them with findings or explicit unknowns. | The instructions require an attempt to check each category, without an obligation to find all answers. A block on a single page leads to trying other public sources that were found, without signing in or bypassing blocks. Intervention concerns a block on further public work, for example a Google CAPTCHA, and still occupies the local slot. |

Signing in to portals and parking a session to move on to the next task are not part of this release. Separate future task: `oferty-pracy-281`, after acceptance of the epic. In the current version, waiting for intervention alone does not free the slot. A group of up to 20 means up to 20 independent assessments/requests, not one prompt with many offers.

## Clarification of technical readiness — 2026-11-05

The review of the stage specifications was recorded in their pairs. After the owner's suggestion, the design uses headless Chrome in a container, with preview and manual intervention through DevTools; Google, Chrome DevTools MCP, public sources and no signing in remain approved. The [qualification](kwalifikacja-runtime.md) (`334.21`) is a dependency of stage 7 and indirectly of 8/acceptance. It does not block the refactors or the local profile/assessments. Tests of isolation and manual intervention are mandatory; choosing headless does not remove these criteria.
