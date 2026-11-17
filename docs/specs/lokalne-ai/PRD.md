# Local AI and research through OpenCode — PRD

Status: **scope and product decisions approved after grill-me**, 2026-11-05. One shared release scope covers the whole epic, including the panel. Stages order the implementation and verification. The documentation is not proof of a finished deployment.

## Context and sources

The owner wants to use local Ollama models in the existing application, and a local agent for employer research. The initiative extends the ways of executing AI described in the [first version PRD](../pierwsza-wersja/PRD.md). It keeps the concepts and rules of the professional profile, the offer match and employer research.

The source of the product decisions is a conversation with the owner on 2026-11-04. The [implementation plan](README.md) and the [SD](solution-design.md) record the earlier investigation and the proposed technical boundaries. The [requirements LA-01–LA-21](requirements.md) contain the detailed behaviour and acceptance criteria. Beads keeps the work status and dependencies: `bd show oferty-pracy-334`.

### Confirmed decisions

- Local model: **`gpt-oss:20b` in Ollama**, without a cloud variant.
- Research agent: **OpenCode**. OpenCode runs the agent's work loop; the application submits the work, checks the result and saves it in the domain.
- **No application limits on Ollama use**: no budget, token quotas, limits on the number of calls and rounds, or fixed deadline for cancelling the whole local work. Because of the computer's resources, all local AI work — profile, single assessments and research — uses a shared queue with one active execution.
- The work remains at the stage of documentation and agreeing the architecture.

The model's physical context parameters, data validation, cancellation and failure handling remain necessary. They are not quotas on local model use.

## Problem and audience

The audience is the owner of a personal job offer system. They want to use AI when building the professional profile, assessing offers and researching companies, choosing local execution for these tasks.

The current paths are tied to OpenAI: the profile uses a model call, assessments use Batch, and research uses search and synthesis at this provider. The [SD](solution-design.md) describes this state. Adding only the address of a local model does not yet support the whole process, in particular searching for sources and keeping the agent's work running.

The change is to make it possible to perform the same activities with a local model while keeping the quality of data control, history and the visible state of operations. We do not assume in advance that the local model will be faster or as accurate as the current one. These properties need assessment on the owner's hardware.

## Expected outcomes and evidence of usefulness

| Outcome for the owner | Evidence during acceptance |
| --- | --- |
| Can prepare a profile without OpenAI. | A proposal from `gpt-oss:20b` has correct references to the CV and changes the profile only after approval. |
| Can assess offers one by one and in bulk locally. | The results keep the rules for evidence, unknowns, rating and history; a partial error does not remove correct assessments. |
| Can request basic research from the agent. | The OpenCode report contains checkable sources and dates, distinguishes facts, opinions and unknowns, and passes the application's validation. |
| Recognises the executor, state and cost of an operation. | The history shows the provider and model, and an error or interruption does not look like a finished result. The local API cost is zero; any tool costs are separate. |
| Can turn on local execution without losing existing work. | Old results and active OpenAI operations remain supported, and a configuration change applies to new requests. |

We do not require a separate pilot or a benchmark of answer quality. The owner assesses usefulness during normal use, for example after running a profile proposal. Technical tests apply, as do checks of format, evidence and operation states; we check model availability through GET /api/tags.

## Proposed scope

### Professional profile

The owner imports a CV and requests a proposal prepared by the local model. The proposal goes through the existing check for consistency with the source material and approval by the owner. A missing OpenAI key or price list for a paid model does not block the local path.

### Offer matching

The owner requests an assessment of one offer or a group of offers. Local execution keeps the same rules of matching, of telling gaps from unknowns, and of assessment freshness. The result of each item is visible; correct results remain available after the others fail. Delivering the same result again does not create another assessment in the history.

### Basic research

The owner starts company research manually. OpenCode uses the local model and the agreed tools for searching and reading public pages. The application checks the report and the evidence before publication. The agent does not on its own change the company profile, organisation links or other application data.

An existing report can be reused under the current rules. An explicit request for new research creates a new version only after it finishes correctly. A failed execution does not replace the previous report. A lack of sources does not entitle the agent to present guesses as findings.

### Choice of execution and continuity of work

On 2026-11-05 the owner confirmed an independent choice of model and execution method for the profile, assessments and research; the [cross-cutting requirements](requirements.md#clarification-confirmed-2026-11-05) record the scope of this decision. A mixed installation is possible, for example a local profile and assessments with research through OpenAI. The first release uses the confirmed server configuration in `.env`; a new settings screen is not required.

A request keeps the choice of executor and model from the moment it was created. When the local model is unavailable, data is not sent to the cloud automatically. The owner sees the reason for the failure and can cancel the local work. A restart must not start a second agent for research that is still active, or publish finished results again.

## Typical flows

**First local profile.** After configuring Ollama, the owner imports a CV without an OpenAI key. They get a proposal marked with the model, review it and approve it. Wrong quotes cause the proposal to be rejected; the saved profile remains available.

**Group of offers.** The owner requests local assessments. Some finish correctly, and one answer is invalid. The correct assessments are available; the remaining item has an explicit error state. A restart does not publish previously finished assessments again.

**Company research.** OpenCode searches for material and reads pages. The report shows where findings came from. If the sources do not confirm working conditions, the report leaves this question as an unknown. It does not transfer the client's technologies to an intermediary without suitable evidence.

**Unavailable service or interruption.** The model or OpenCode becomes unavailable, or the owner cancels the work. The operation gets a clear state. Previous results remain available; data is not automatically routed to another provider.

**Configuration change.** While operations are active, the owner chooses a different execution for later requests. Pending tasks keep the earlier choice; older OpenAI batches can still be collected and finished. Going back to OpenAI does not remove the local history.

## Constraints and data boundaries

- Local inference has an API cost of zero. This does not mean zero cost of energy, hardware or external tools. Exhausting the budget for paid services does not block work that uses only the local model.
- The absence of Ollama quotas does not remove the agreed cost control of paid search or the technical protection of page reading. It must not be used to replace a limit on rounds or time of the whole local task.
- Research uses the internet. Queries go to the chosen search source, and reading visits public pages. The search engine does not receive the CV or the full professional profile.
- The agent has access only to the agreed research tools. It does not get a shell, project files, a private network or the ability to write domain data. Page content does not extend its permissions.
- The sessions and configuration of the dedicated OpenCode need isolation from the owner's private configuration. Indefinite retention of the material collected by this integration was confirmed. The Chrome profile with cookies/cache is an exception: it is removable working state after confirmed completion and archiving of the material.
- We check model presence through GET /api/tags; we do not require a pilot of answer quality. Input that is too large must give an explicit error, without silently truncating data.

## Out of scope

We do not change the rating rules, the owner's decisions, offer importing, recruitment management or backups. This initiative does not deliver deep research or automatic thresholds for starting research.

The first release does not include automatic choice or download of models, cloud fallback, arbitrary agent tools or a general agent platform. It does not remove support for OpenAI and Batch. It does not start a mass reassessment of saved offers.

## Implementation stages of one release

| Stage | Useful result | Link to the technical plan |
| --- | --- | --- |
| Preparation | Existing AI keeps working after responsibilities are separated. | Stages 1–4. |
| Adapter and local profile | Profile through `gpt-oss:20b` without OpenAI, with availability checked through the API. | Stage 5; does not need a finished search engine. |
| Local assessments | Single and group assessments with history and correct handling of partial errors. | Stage 6. |
| Local research agent | Manual basic research through OpenCode with agreed search and source validation. | Stages 7–8. |
| Acceptance and shared deployment | Verified mixed variants, continuity of old operations and the ability to change the execution of new requests. | Stage 9. |

The owner approved a shared deployment of the whole epic, without a separate release of only the profile or assessments. We do not set calendar dates before the integration is technically checked. We refine the detailed requirements and SD for a chosen stage before implementation, following the [project cycle](../pierwsza-wersja/README.md#feature-work-cycle).

## Unknowns and readiness

| Question | Consequence and next step |
| --- | --- |
| How the chosen model and runtime work on the host | O-L1: check access to the API and presence of the configured model; no quality benchmark. The model and OpenCode are already chosen. |
| Search source, access and cost | O-L2: Google through Chrome DevTools MCP chosen; T03–T05 required before live use, without blocking the profile/assessments. |
| OpenCode sessions, cancellation, restart and retention | O-L3: HTTP/session/queue contract described; T01/T02 required before live use. Retention closed: collected material kept indefinitely, working Chrome profile removable after the end; the absence of quotas is settled. |
| Acceptance of implementation documents | O-L4: implementation review of the pairs completed in 334.19/20; refresh existing changes before code. Beads shows readiness and unfinished dependencies. |

The register O-L1–O-L4 and the detailed criteria remain in the [requirements](requirements.md#decisions-and-technical-conditions). This PRD sets the approved goal and boundaries of the initiative; the [plan](README.md) sets the order, and the [SD](solution-design.md) the technical approach. The chosen set has not yet been confirmed to work in a pilot.

## Stage documentation — update 2026-11-04

At the owner's next request, [requirements and SD for all nine stages](README.md#requirements-and-sd-for-each-stage) were prepared. This extends the documentation scope compared with the earlier plan of refining a single pair. The implementation review took place on 2026-11-05 in 334.19/20; the contracts were clarified and the tasks have a ready specification. Before implementation, refresh the code state and the results of preceding tasks. This does not mean tests were run or deployment started.

Decision update 2026-11-05: the `.env` configuration, indefinite retention of collected material except the working Chrome profile, checking the model through the API without a quality pilot, and batching local assessments into groups of up to 20 are described in the [cross-cutting requirements](requirements.md#clarification-confirmed-2026-11-05). Technical API/session trials are not a test of model quality.

## Operations panel and search — extension 2026-11-05

The owner requested a task management panel with the ability to check, stop and skip manually. A [separate requirements/SD pair](features/panel-zadan/requirements.md) describes the details and decisions. The rules for skipping, retrying and resuming were then confirmed in the panel requirements. Search is to use Google through a browser. Chrome DevTools MCP and user intervention were chosen; the runtime contracts and their technical gates define the implementation.

## Panel confirmation — 2026-11-05

The first scope is AI tasks. Actions cover a single item or a group of up to 20, not the whole parent request. "Pomiń" (Skip) tries to stop the work and blocks publication, letting the group continue. An explicit retry is also allowed in running/unknown: the previous execution loses the right to publish and gets a stop attempt; we keep its late response for inspection. Automatic recovery still does not start a duplicate. Other confirmed rules: [task panel](features/panel-zadan/requirements.md). The Google flow through a dedicated browser, with user intervention when blocked, was accepted.

Confirmed decision 2026-11-05: OpenCode controls a dedicated Google Chrome through **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP is not part of the chosen integration. Details: [stage 7 SD](etapy/07-narzedzia-www/solution-design.md). The choice does not mean that implementation has started or that services have been installed.

## Confirmation of how local work is organised — 2026-11-05

Because of the computer's resources, OpenCode agent tasks wait in a queue and run one at a time across the whole installation. This does not introduce quotas on tokens, rounds or Ollama working time; the shared queue also covers the profile and single assessments. Confirmed: a clean browser state for a new execution, public pages without signing in, cookies kept while resuming the same execution, the scope of the evidence archive, separate local services and a manual "Wznów" (Resume). Canonical rules and criteria: [LA-11–LA-15](requirements.md#agent-queue-browser-and-resumption--confirmed-2026-11-05).

## Final grill-me decisions — 2026-11-05

One shared deployment, one local AI work item at a time, manual retry with an unchanged snapshot, and manual handling of service failures. Google serves only to find sources; findings need public pages that were read. Queries contain no data from the owner's profile. The agent tries the remaining public sources it found and can finish categories with explicit unknowns. It does not have to find all answers. The working Chrome state can be removed after completion, but reports, material and history remain. Normative criteria: LA-11/13 and LA-16–LA-21 in the [requirements](requirements.md).

Signing in and parking sessions so that the next tasks can run remain outside the release, in the backlog item `oferty-pracy-281`. For now, waiting for an intervention during public access blocks the shared local queue. None of these decisions adds a benchmark of answer quality.

## Clarification of the browser environment — 2026-11-05

At the owner's suggestion, the technical design provides headless Chrome in a dedicated container, reachable through Chrome DevTools MCP. We keep the ability to preview and manually handle a public block in the same session through DevTools and "Wznów" (Resume) in the panel. The agent's work does not need a personal Chrome or its profile. The qualification must confirm isolation and the ability to intervene; headless mode alone is not proof of either.
