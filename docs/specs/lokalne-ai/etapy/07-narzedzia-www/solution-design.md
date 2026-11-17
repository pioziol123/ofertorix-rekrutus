# Stage 7: Search and page reading for OpenCode — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Beads: `oferty-pracy-334.8`. Google through Chrome and Chrome DevTools MCP chosen, cookies/archive/intervention approved; live operation requires checking.

Basis: [Requirements](requirements.md), [LA-07–LA-15](../../requirements.md), [runtime contracts](../../kontrakty-runtime.md). The runtime contracts are a shared normative part of this SD, stage 8 and the panel. We do not build our own browser or agent loop. Playwright is not part of the integration.

## Approach and boundaries

OpenCode → controlled MCP bridge → pinned chrome-devtools-mcp → dedicated headless Google Chrome in a container. The bridge passes on ready Chrome operations and records the materials actually received before giving them to the model. OpenCode chooses the steps and runs the conversation; the companies module is responsible for interpreting and publishing the report.

We use Google through the browser, without a paid search API and without OpenCode's built-in external websearch. Queries without the CV and without the owner's full profile. Google has no guaranteed availability; a block gives an intervention, not automatic circumvention or a change of provider.

## Baseline state

[research-model.ts](../../../../../lib/companies/research-model.ts) defines ResearchEvidence and validateResearch: a quote must come from the text of the corresponding evidence and have safe sources. [research-provider.ts](../../../../../lib/companies/research-provider.ts) collects the OpenAI material in memory; the final report is not an archive of raw reads. A new durable archive is necessary for LA-13. The pattern of immutable artefacts and hashes exists in [matching/archive.ts](../../../../../lib/matching/archive.ts), but it is not a research integration.

## E07-D01 — Bridge with tool control and archiving

The set of operations and the argument filter, binding to the execution ID, Chrome profiles, recording of tools and evidence are in the sections "Chrome and the MCP bridge" and "Archive and evidence" of the runtime contracts. The earlier search/readPage is a description of the goal, not an obligation to build a search engine or replace ready Chrome tools.

The bridge is part of the integration in this repo, without a separate user interface. It records a call before execution and a response before making it available to the agent. It does not derive evidence only from the model's final report. The page text itself and an operationId argument from the model do not grant permissions or ownership of the material.

## E07-D02 — State per execution and intervention

A clean Chrome profile for a new execution ID; its own OpenCode session. Cookies stay within the execution during waiting and resumption. No personal accounts and no login; we do not attach to the everyday Chrome. A new execution does not inherit the tabs/cookies of the previous one, and the materials of the previous one still stay in the archive.

request_intervention records the reason and the wait, takes a screenshot or records the capture error. The user opens an authenticated DevTools preview of the same tab, removes the block and chooses "Wznów" (Resume) in the panel. We resolve the same intervention, without a new execution. Waiting occupies the shared local slot and has no automatic deadline. Inability to restore Chrome is explicit.

## E07-D03 — Network and material isolation

Tools only for allowed public research. Do not give the model files, a shell, arbitrary evaluate_script, upload or write paths. Protect all Chrome traffic from the local/private network, not only the navigate_page parameter. Isolation covers DNS/IPv6/redirect, iframe, subresources and WebSocket. A proxy configuration without proof that it cannot be bypassed is not enough. T04 blocks public research until the environment is verified.

A snapshot read is the material visible in the accessibility tree, not a guarantee of the full page. We record the exact text passed to the model; a partial read is explicitly marked. A search snippet does not turn into page evidence without the page being read. Screenshots on blocks/errors/intervention and the whole conversation/tools are kept indefinitely; there is no default archiving of all resources and the full network traffic.

## Migration and rollout

Implementation dependency: stage 5 (`oferty-pracy-334.6`) delivers the execution ID, the shared queue and the slot. The bridge uses these records, without creating competing infrastructure. The Chrome protocol checks alone can be done earlier, but they do not replace integration with execution.

An additive archive of observations per execution ID and integration with the existing ResearchEvidence. The new material does not change historical OpenAI reports. The MCP/Chrome/OpenCode versions and the configuration of the dedicated profile are explicit; statistics and unneeded performance features are disabled. We do not install Playwright. We do not introduce quotas on the number of local rounds/calls.

## Verification and readiness

| Criterion | Verification plan |
| --- | --- |
| E07-AC01 | A fake and technical access to Google; no paid search API and no silent fallback. |
| E07-AC02 | T05: actual text, metadata, idempotent ID, screenshot, snippet/page, partial read and archive failure. |
| E07-AC03 | T04: all Chrome traffic, attempts at private DNS/IPv6/redirect/iframe/subresource/WebSocket and proxy bypass. |
| E07-AC04 | 403/429/block/CAPTCHA, tool failure, empty/partial snapshot without fictional evidence. |
| E07-AC05 | T03/T05: two consecutive executions and resumption of the same one, a foreign ID/tabs, an old bridge after a slot change, instructions in a page. |
| E07-AC06 | Protection of a single read does not become a limit on local rounds, tokens and the whole session. |

Tool and archive tests can be run without an LLM. Before live, check T03–T05 from the runtime contracts and record the versions/results; official sources alone do not confirm isolation. We do not require a response quality benchmark. For implementing behaviour, use implement-with-tester. The sources verified on 2026-11-05 and the exact limits of the guarantees are collected in the runtime contracts.

## Public sources and cleanup — after grill-me

LA-19–21 apply: a Google snippet serves only for navigation/archiving; a fact/opinion requires evidence from a page that was read. E07-AC02 checks the rejection of a claim based only on a snippet. E07-AC05 checks that the owner's data is absent from the tools: only company and position data are allowed. E07-AC04 checks trying other public sources that were found when a single page is blocked. We do not open pages that require an account by logging in, and we do not wait for a login. A CAPTCHA/consent that blocks public work may require intervention.

The Chrome profile with cookies/cache is a removable working state after the confirmed end and the recording of materials. Activity or intervention keeps the same profile. E07-AC05 requires that cleanup of a finished profile does not remove evidence, conversations, events or reports and does not touch an active profile. Parking sessions and login only in backlog item 281, outside this release.

## Completion of the execution design — 2026-11-05

Dependencies: stage 5 and the [runtime qualification](../../kwalifikacja-runtime.md), `334.21`. The latter delivers the concrete manifest and configuration of headless Chrome in a container, nftables/proxy and private CDP with a DevTools preview. Ownership of the new files: `lib/ai/browser/` for the bridge and the MCP process, `lib/ai/operations/` for tokens/queue, a separate execution archive module; configurations/launchers in the repo. Do not move report rules or conversation control into the bridge.

The bridge's public interface is the standard MCP tools/list and tools/call. Fetch the schemas of the allowed tools from the pinned version and persist their hash. A disallowed tool/argument gives a safe error before the action; do not pass unknown fields on. The tab/navigation tools do not allow file/data/javascript URLs or an external page/target ID. The real target ID is bound by the context store of the given execution, never a global "last tab". Error pages or CAPTCHA pages do not become evidence of company facts.

Each read/navigation has a unique call ID and a record of intent before dispatch. A bridge started for an execution gets a dedicated archive credential and generation; it archives the normalised response and the raw tool response before returning it to the model. Handling of a duplicate returns the previously recorded result; a different payload is a conflict. A failure after the action and before the record gives an unknown action; do not repeat click/navigation automatically. Recovery first inspects the current target and the collected materials; a repeated MCP delivery alone does not give the right to repeat the effect.

Use `ai_execution_artifacts` delivered in stage 5 for direct; add `ai_tool_calls`, `ai_evidence` and `ai_interventions` with an FK execution_id, a unique call ID per execution and UNIQUE(execution_id,evidence_id). Archive state, SHA-256 and the durable object according to runtime. Intervention: id UUID, execution_id, reason, page_id, state pending/resolved/failed, screenshot_artifact_id nullable, screenshot_error nullable, resolved_command_id nullable, dates. A unique single pending intervention per execution. With a screenshot error, still record the wait and the reason; the missing screenshot is explicit.

Safety limit for a single tool result: 1 MiB of UTF-8 text passed to the model; the excess is cut at an encoding boundary, marked readStatus=partial, and exactly the returned fragment is recorded as evidence. Keep the full raw tool result separately, if it was actually received; an archive error is not a reason to delete it. Arguments of a single call up to 64 KiB, without their own write paths. The protection does not set a total of rounds/tokens/time for the job. Screenshots and sessions are not subject to this text limit; a disk failure stays an infrastructure error. These numbers are a technical safety decision for a single message, not a change of product scope.

Tests without a model: a legitimate read, snippet versus page, partial, missing metadata, archive unavailable, duplicate call ID, foreign context, old generation, prompt injection, screenshot failure and resumption of the same pending intervention. Repeat T03/T04 from the qualification on the final configuration, and T05 on the integrated archive. E07-AC01–06 must have references to specific tests/evidence; the qualification does not close the bridge implementation.
