# AI refactor, Ollama and a local agent — implementation plan

Status: **specification package for staged work**, updated 2026-11-05. The product decisions described in the requirements are approved; the technical design and the verification plan serve the implementer. The current work covers documentation, without implementation and without starting services.

**Update of the owner's decisions:** the local model is `gpt-oss:20b`, and the agent runtime is OpenCode. No application-imposed limits on Ollama use (budget, tokens, calls and rounds). This choice replaces a custom agent loop and the earlier proposal to limit local work. Handling of errors, cancellation and restart remains part of the integration.

- [PRD — goal, scope and outcomes for the owner](PRD.md).
- [Cross-cutting requirements and criteria LA-01–LA-21](requirements.md).
- [Module boundaries and cross-cutting design](solution-design.md).
- [Existing project architecture](../pierwsza-wersja/architecture.md).
- [Runtime contracts: sessions, queue, Chrome, archive and commands](kontrakty-runtime.md).
- [Hand-off to the local model: entry, stages and validation](przekazanie-lokalnemu-modelowi.md).
- [Qualification of pinned versions and Chrome isolation](kwalifikacja-runtime.md).

The specification keeps the scope and decisions. **Beads is the only source of status, assignments and dependencies**: `bd show oferty-pracy-334`. The order below is a technical plan, not a list of finished work. We assess the readiness of each task separately, after reviewing and refining its requirements/SD pair. The label `ready-for-agent` means the specification is prepared; it does not mean the task is done or that its implementation dependencies are met.

## Goal and transition rules

The profile and assessments are to use the local model without an OpenAI key. Basic research is to get an alternative execution through an agent with a local model and tools for searching and reading pages. The existing OpenAI, Batch, history and shared budget remain supported.

First we separate the existing responsibilities without changing behaviour. Then we add a second model adapter and local execution, and later we integrate the OpenCode agent. OpenCode implements the agent loop. The profile can be checked technically earlier, but the owner gets one shared deployment of the whole epic, including the panel.

Before each stage, read the current code and existing changes, and refresh the stage's reviewed requirements/SD against the results of the preceding stage. Specification readiness was recorded in Beads after the review; do not formally repeat the whole preparation without a new discrepancy. Get a decision for a material change of behaviour. When implementing behaviour, use `implement-with-tester`. We do not commit, push or sync Dolt as part of the plan itself.

## Requirements and SD for each stage

The pairs prepared on 2026-11-04 were reviewed and refined on 2026-11-05 in tasks 334.19/20. The critical contracts were clarified in the SD and the shared runtime. Headless Chrome in a container with manual DevTools preview was chosen; the version/isolation qualification task is listed below and blocks stage 7 until evidence is obtained. Technical verification remains the implementer's work, not a completed result of the documentation.

| Stage | Requirements | Solution design |
| --- | --- | --- |
| 1. Shared configuration and budget | [Requirements](etapy/01-konfiguracja-budzet/requirements.md) | [SD](etapy/01-konfiguracja-budzet/solution-design.md) |
| 2. Profile independent of the OpenAI protocol | [Requirements](etapy/02-profil-adapter/requirements.md) | [SD](etapy/02-profil-adapter/solution-design.md) |
| 3. Assessments separated from OpenAI Batch | [Requirements](etapy/03-oceny-batch/requirements.md) | [SD](etapy/03-oceny-batch/solution-design.md) |
| 4. Research independent of the OpenAI executor | [Requirements](etapy/04-research-wykonawca/requirements.md) | [SD](etapy/04-research-wykonawca/solution-design.md) |
| 5. Ollama gpt-oss:20b and local profile | [Requirements](etapy/05-ollama-profil/requirements.md) | [SD](etapy/05-ollama-profil/solution-design.md) |
| 6. Local single and bulk assessments | [Requirements](etapy/06-ollama-oceny/requirements.md) | [SD](etapy/06-ollama-oceny/solution-design.md) |
| 7. Search and page reading for OpenCode | [Requirements](etapy/07-narzedzia-www/requirements.md) | [SD](etapy/07-narzedzia-www/solution-design.md) |
| 8. OpenCode as the research agent with gpt-oss:20b | [Requirements](etapy/08-opencode/requirements.md) | [SD](etapy/08-opencode/solution-design.md) |
| 9. Acceptance and shared deployment | [Requirements](etapy/09-odbior/requirements.md) | [SD](etapy/09-odbior/solution-design.md) |

## Stages

| Stage | Result | Dependencies | Coverage | Beads |
| --- | --- | --- | --- | --- |
| 1 | Shared configuration and budget outside the profile module | Review of the first SD | LA-02, foundation for LA-03/06 | `oferty-pracy-334.2` |
| 2 | Profile separated from the OpenAI protocol | 1 | LA-02/03, foundation for LA-04 | `oferty-pracy-334.3` |
| 3 | Assessments separated from the OpenAI Batch cycle | 1 | LA-02/03, foundation for LA-05 | `oferty-pracy-334.4` |
| 4 | Research separated from the current OpenAI executor | 1 | LA-02/03, foundation for LA-07 | `oferty-pracy-334.5` |
| 5 | Ollama adapter, profile with gpt-oss:20b and model availability check | 2; check of the chosen model | LA-01/03/04/06/08 | `oferty-pracy-334.6` |
| 6 | Local single and bulk assessments | 3, 5 | LA-01/05/06/08/10 | `oferty-pracy-334.7` |
| 7 | Chosen search source and controlled web tools | 5 — executions and the shared slot; qualification 334.21; T03–T05 before live use | LA-07/09/12/13 | `oferty-pracy-334.8` |
| 8 | OpenCode with gpt-oss:20b as the research agent | 4, 5, 7; session and recovery contract | LA-01/03/06/07/08/09/11/14/15 | `oferty-pracy-334.9` |
| 9 | Acceptance of the mixed installation and shared deployment | 6, 8, panel | LA-01–LA-21, PZ-01–08 | `oferty-pracy-334.10` |

The numbering sets the recommended order of work. Stages 2, 3 and 4 can be done after 1 independently of one another. Stage 7 needs qualification 334.21 and the foundation of executions/queue/slot from stage 5; the protocol investigation and isolated Chrome tests can be prepared earlier. These are technical dependencies, not an instruction to edit the same files in parallel.

### Stage 1 — extract configuration and budget

Move the shared functions from `lib/profile/ai.ts` to `lib/ai/`, and switch the consumers in assessments and research. Details: [stage 1 requirements](etapy/01-konfiguracja-budzet/requirements.md) and [stage 1 SD](etapy/01-konfiguracja-budzet/solution-design.md).

Completion: identical calculations and reservation behaviour, old configurations still supported, no migration and no new paid calls. Verification: unit tests of prices/configuration and the existing PG tests of the profile, assessments and research. The 2026-11-05 review of the pair clarified the internal arithmetic, the consumer in the offer list and the caller's transaction for reserve; the stage 1 SD keeps the details and criteria E01-AC01–04.

### Stage 2 — separate the profile from the provider call

Keep input preparation, instructions, schema and `checkProposal` in the profile. Extract the single OpenAI call into a model adapter. Keep the current retry, limits and the way the profile is approved; do not move CV rules into the transport.

Completion: profile execution depends on a small model interface, and tests can supply an answer without HTTP. OpenAI keeps a compatible request and settlement. Tests cover refusal, truncation, invalid JSON, a missing quote, a network error and missing telemetry. In this stage, define neutral messages, the result and the capabilities required for a structured answer. Do not move OpenCode session management into this interface.

### Stage 3 — separate assessment from OpenAI Batch

Separate building an assessment task and its validation from upload/create/poll/results/cleanup in `matching/batch.ts`, `store.ts`, `groups.ts`. Extract the shared publication of a correct result. A request group and a provider batch have different meanings.

Completion: existing single and group batches can still be sent, read, archived and cleaned up. Kept: custom_id, command idempotency, atomic funding, freshness and revision publication. Tests: results out of order, partial error, interruption before/after the batch is created, repeated delivery and an older version of the input. No local executor in this stage.

### Stage 4 — separate research from the current executor

In the Companies module, keep the goal, report versions, reuse/refresh and evidence validation. Keep the OpenAI executor with built-in search as a working whole behind a research execution contract. Separate the collected evidence material, synthesis and final validation where this helps the second executor; do not replace working search with a fictional generic adapter.

Completion: the current manual basic research keeps its two calls, costs and source contract. Tests: no sources, wrong quotes/URLs, synthesis error after paid search, restart and keeping the previous report. Deep research and automatic thresholds remain out of scope.

### Stage 5 — add Ollama and run the local profile

Extend the configuration with an explicit provider and execution method, treating old snapshots as OpenAI. Add a native Ollama adapter, structured output and detection of an incomplete answer. The saved snapshot does not include secrets. Add to `.env.example`, Compose and the README the configuration for the web app and the worker, and a model availability check.

Offline HTTP tests first. Check the connection from the worker and the presence of the configured gpt-oss:20b through GET /api/tags, without automatic download. We do not run a separate model quality pilot; the owner will assess the result during normal use. Do not impose inference quotas; concurrency of all local work is 1 because of resources. Handling of context, cancellation and errors remains part of the integration.

Completion: the profile works through Ollama without an OpenAI key/price list; API cost is zero, unknown tokens remain unknown, and an exhausted paid budget does not block a local proposal. An unavailable model or a context that is too small gives a controlled error; never silent truncation of input or a fallback. This is the first working internal increment, not a separate release.

### Stage 6 — run local assessments

Add a local executor for the task from stage 3, using the adapter from stage 5. A bulk request keeps the command and per-item results; the work is batched with durable progress, without creating OpenAI files. Add the local variant to the matching requirements and SD, and the provider/model and correct statuses to the UI.

Completion: single and group local assessments through `gpt-oss:20b` pass the same evidence and freshness checks. A restart does not repeat finished items. Old OpenAI batches and new local requests coexist; a change of settings does not rewrite their executor. Tests cover the absence of local work quotas, no double execution, and no blocking of the free source sync.

### Stage 7 — choose search and build the tools

Chosen: Google through a dedicated headless Chrome in a container and Chrome DevTools MCP; owner preview/input through a private DevTools. Build a controlled bridge that passes on ready-made browser operations and saves page reads before giving them to the model. Do not implement our own browser engine or search engine. Public pages without signing in, a clean profile per execution, intervention and resumption in the same state. Evidence distinguishes a search snippet from a page that was read, and keeps the text and its origin.

Completion: E07-AC01–06 and T03–T05 from the [runtime contracts](kontrakty-runtime.md). The isolation test covers all Chrome traffic, not just the URL parameter. Documents or proxy configuration alone are not proof that the protection works. No quotas on rounds/tokens/time of the whole agent.

### Stage 8 — integrate OpenCode as the research agent

Chosen: headless HTTP OpenCode as a separate local service. The adapter and a durable request journal tie the execution to the session and messages; the application does not run a second agent loop. A global FIFO queue allows one local AI work item; unknown, cancelling and intervention occupy the slot. An explicit retry records a new execution, but its start waits for confirmed completion of the previous one. The Companies module validates the final report against the evidence of that specific execution.

Completion: E08-AC01–06 and T01/T02, consistency with stage 7 and with the panel commands. Versions, sessions, restart, abort, result, isolation and retention need technical evidence. Intervention can be tested without a finished UI, so the panel does not block implementing the executor contract itself.

### Stage 9 — accept the whole and deploy it together

During acceptance, check in turn the local profile, several manual assessments, a group and manual research; make them available only as one release with the panel. Do not switch the whole database automatically and do not start a mass reassessment. Check mixed variants: local profile/assessments with OpenAI research, and all three uses locally with an explicit search source.

Completion: full `pnpm check`, the necessary PostgreSQL/API integrations on isolated schemas, build and a UI check. A separate migration trial on a copy with old pending batches, a worker restart and a settlement check. Going back to OpenAI for new tasks works without deleting history. The owner assesses answer quality in normal use; a separate benchmark is not a condition for deployment.

## Order resulting from dependencies

Beads stores blocks, not the display order by ID or update date. After the graph audit on 2026-11-05:

| Implementation task | Required earlier tasks |
| --- | --- |
| Stage 1 — `334.2` | No earlier implementation stage. |
| Stage 2 — `334.3` | Stage 1 (`334.2`). |
| Stage 3 — `334.4` | Stage 1 (`334.2`). |
| Stage 4 — `334.5` | Stage 1 (`334.2`). |
| Stage 5 — `334.6` | Stage 2 (`334.3`); stage 1 is an indirect dependency. |
| Stage 6 — `334.7` | Stages 3 and 5 (`334.4`, `334.6`). |
| Runtime qualification — `334.21` | Independent of the refactors; headless in a container chosen, trials without the owner's data. |
| Stage 7 — `334.8` | Stage 5 (`334.6`): durable executions and the shared slot; qualification (`334.21`). |
| Stage 8 — `334.9` | Stages 4, 5, 7 (`334.5`, `334.6`, `334.8`). |
| Panel — `334.15` | Stages 6 and 8 (`334.7`, `334.9`). |
| Acceptance and shared deployment — `334.10` | Stages 6 and 8 and the panel (`334.7`, `334.9`, `334.15`). |

Full ID prefix: `oferty-pracy-`. For a single implementer, the recommended order remains 1 → 2 → 3 → 4 → 5 → 6 → qualification 334.21 → 7 → 8 → panel → 9. The graph leaves independent work without artificial mutual blocks. It can be shown with `bd list --parent oferty-pracy-334 --deps`.

Backlog item `oferty-pracy-281` needs acceptance `334.10` to be finished, but it is not a child of the current epic and does not block the release. Closed planning/specification tasks do not mean the implementation stages are finished.

## Plan acceptance conditions and open choices

O-L4: the specification review was done and the result was recorded in the pairs. Before code, refresh the changes made after the review. The runtime qualification describes how headless Chrome is isolated; its tests are the implementer's work. The model (`gpt-oss:20b`), the agent runtime (OpenCode) and the absence of Ollama quotas are settled. Before enabling stage 5, we check model availability through the API; before enabling 7/8, the results of the technical gates T01–T05. The search source and session behaviour are chosen. These questions do not block preparation of the first refactor. We do not set calendar dates without measuring the chosen set and checking search.

This document adds no new tests or code changes. Verification of the plan covers links, coverage of criteria by stages, Beads dependencies and consistency of the described contracts. The planning result is not proof that Ollama or the agent works.

Decision update 2026-11-05: the `.env` configuration, indefinite retention of collected material except the working Chrome profile, checking the model through the API without a quality pilot, and batching local assessments into groups of up to 20 are described in the [cross-cutting requirements](requirements.md#clarification-confirmed-2026-11-05). Technical API/session trials are not a test of model quality.

## Extension: task management panel

Requested 2026-11-05: [Requirements](features/panel-zadan/requirements.md), [SD](features/panel-zadan/solution-design.md), Beads `oferty-pracy-334.15`. The panel will cover check, stop, skip, retry and resume; the behaviour is approved, and the contract is described in the panel SD and the runtime contracts. The panel specification was refined after the review; implementation needs stages 6/8 to be finished. It is not a finished feature. Before stage 9 acceptance, the agreed panel scope must be included. Google through a browser is the confirmed direction of stage 7.

Confirmed decision 2026-11-05: OpenCode controls a dedicated Google Chrome through **Chrome DevTools MCP** (`chrome-devtools-mcp`). Playwright MCP is not part of the chosen integration. Details: [stage 7 SD](etapy/07-narzedzia-www/solution-design.md). The choice does not mean that implementation has started or that services have been installed.

## Latest decisions — 2026-11-05

Confirmed: a shared queue with one local AI work item at a time because of resources (profile, single assessments, research), and the rules for cookies, the evidence archive, separate services and manual resumption. Canonical criteria: LA-11–LA-15 in the [requirements](requirements.md). A retry can be created at once, but its start waits for confirmed completion of the previous agent. This is a specification update, without starting implementation.

## Closed grill-me interview — 2026-11-05

Q1–Q13 and the shared summary approved. Criteria LA-16–LA-21 complement LA-11/13. All local work uses the shared slot from stage 5; we deploy the whole epic together. A retry copies the old input and configuration; after an invalid answer, the decision to generate again is manual. Public sources without signing in, Google only for search, no owner data in queries. The Chrome profile is removable after the end and after the material is archived. Infrastructure remains the operator's responsibility. Signing in and parking sessions: backlog item `oferty-pracy-281`, outside the current release.

## Entry after the implementation review

Start with `oferty-pracy-334.2`. Carry out later tasks once their Beads blockers are met, in the recommended stage order. Qualification `334.21` delivers the pinned set and isolation evidence before 7/8; headless Chrome in a container with a private DevTools is the chosen design, and its qualification needs real evidence. The SD of each stage defines the exact changes and tests.

The preparation did not run application tests or services. The current code and documents were reviewed; `334.20` records the results of the consistency and dependency checks. Acceptance, publication and running in the owner's environment remain separate activities.
