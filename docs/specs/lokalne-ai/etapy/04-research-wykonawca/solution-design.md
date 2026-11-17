# Stage 4: Research independent of the OpenAI executor — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 4 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.5`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

Normative scope of behaviour: [Requirements](requirements.md), E04-R01–E04-R04. Baseline state: the local directory as of 2026-11-04, including the existing changes; this is not only HEAD. The designed files below are not a statement about an existing implementation.

## Approach and boundaries

lib/companies/research.ts owns the commands, the target snapshot, the queue, reuse/refresh, attempts and publication. lib/companies/research-provider.ts becomes the OpenAI executor behind a small ResearchExecutor; lib/companies/research-model.ts stays the owner of researchDraft, ResearchEvidence and validateResearch. We do not split web_search into a fictional universal search provider.

## Decision E04-D01 — An executor for the whole OpenAI research

**Technical decision:** Replacing the built-in search with a general single model does not preserve sources and costs. A contract for the whole execution allows OpenCode to be added later without rewriting the domain.

Integration points in the current directory: [lib/companies/research.ts](../../../../../lib/companies/research.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts), [lib/companies/research-model.ts](../../../../../lib/companies/research-model.ts). They show where the change happens, not an obligation to move all of their responsibilities.

## Contracts and invariants

ResearchExecutor.execute takes the recorded operationId/target/configuration and the options signal/onAccounting; the exact result union is defined below. target corresponds to the existing ResearchTarget, configuration is the recorded snapshot. draft is unvalidated JSON, and evidence has the type ResearchEvidence[] from research-model.ts; missing evidence is not an empty successful report.

accounting contains the usage of the individual steps, the response identifiers and the known cost or null. An executor error also carries the available accounting according to the disjoint result below, so the cost of the first step is not lost. Do not pass raw responses as public error messages.

The executor does not write the company, the report or ai_attempts. The coordinator always calls validateResearch before the atomic publication and settlement of the attempt. Publication checks the terminal state and blocks a repeated effect. OpenAI keeps two steps and the current search limit/price list; no rule of the paid executor becomes a global limit for the future Ollama.

## Migration and rollout

No migration, no change to env or routing. researchConfiguration still recognises the existing models. Old recovery records keep the existing handling of unknown. We do not add automatic research or deep research.

## Verification

All the checks below are a plan, not a result that has been produced. Automated tests with fakes do not prove that live services work.

1. OpenAI fake: the same two requests, sources, schema and costs.
2. Bad URL/quote, no sources, incomplete topics and refusal.
3. Error in the second step and unknown cost after the first.
4. Integration of reuse/refresh, command idempotency, restart and preservation of the previous version.

| Criterion | What verification must show |
| --- | --- |
| E04-AC01 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E04-AC02 | Check 2 above; observe the outcome stated in the corresponding Requirements criterion. |
| E04-AC03 | Check 3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E04-AC04 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Readiness and change control

The accounting contract is defined below; the review of 2026-11-05 clarifies the details of the extraction and of keeping the existing settlement. There is no open product decision.

Before coding, refresh the working state and the Beads dependencies. The specification review was done on 2026-11-05; it does not replace test results or control of changes made after the review.

## Result and accounting — clarification 2026-11-05

`ResearchExecutor.execute` returns a union: `{outcome:'completed', draft, evidence, accounting}` or `{outcome:'failed'|'unknown'|'cancelled', error:{code,message}, accounting}`. Expected transport/provider/format errors are a result, not an exception that loses accounting. We do not return a seemingly empty report. An unexpected programming error is not a success or a confirmation of zero cost; the coordinator keeps the execution log and marks the settlement as uncertain.

`accounting` contains the ordered steps executed up to the moment of success/error, the response ID or null, usage with null for unknown measurements, and the step cost as a decimal PLN string or null. The total cost is known only when all executed paid steps have a known measurement; otherwise null. For OpenAI, keep the existing aggregated rounding, defined in the review below. The absence of a second step after an error in the first does not create a fictional charge. A synthesis error does not remove the known search cost. For a local model, the API cost is always '0', also when usage or the result is unknown; any paid tools are separate steps. In stage 4, keep the existing OpenAI rules.

The coordinator writes the attempt log and the publication; the adapter does not mutate ai_attempts. Test E04-AC03 checks: first paid step completed, second step error/lost response, no loss of the known part of the cost, and no publication.

## Review and executor contract — 2026-11-05

Reviewed: `runResearch` in research-provider.ts, executeCompanyResearch in research.ts and validateResearch in research-model.ts. Today the executor already returns the report after validation; the extraction must move the final validation to the coordinator, keeping both requests and the evidence control. The executor does not publish the report.

`ResearchExecutor.execute({operationId,target,configuration},{signal,onAccounting})` returns the union described above. For completed, draft is unvalidated JSON (unknown), evidence has ResearchEvidence[]. The domain owns researchDraft and validateResearch; the executor does not force a declaration of a valid draft before validation. In stage 8, the additional execution/session context is handled by the OpenCode adapter, without forcing it into StructuredModel.

Each accounting step: `{step:'search'|'synthesis',requestId:UUID,status:'prepared'|'sent'|'completed'|'failed'|'unknown',responseId:string|null,usage:{inputTokens:number|null,outputTokens:number|null,searchCalls:number|null},knownCostPln:string|null}`. The order matches the actual calls. Do not create a synthesis step if its preparation has not started. The known search cost stays preserved even if the second request has an uncertain cost. The total `costPln:string|null` is a settlement field; null does not zero the known part.

**OpenAI arithmetic compatibility:** settlement of the whole keeps the current runResearch function: token sums of both steps, the special block of 8000 tokens per search for gpt-4.1-mini, searchFee and the existing rounding. Do not sum independently rounded step costs instead of the current aggregated calculation. The earlier general sentence about the sum of costs should be read with this rule for legacy OpenAI. Every executed paid step without a confirmed measurement gives costPln=null and keeps the reservation; the known step measurements stay in usage. Keep max_tool_calls=3, the source format, two requests and the paid 120 s timeouts; do not extend these constraints to the local agent.

`onAccounting` is an internal checkpoint, not a permission for the adapter to access the database: the coordinator writes the log in the existing ai_attempts.usage (the existing aggregate fields plus `execution_steps` with version 1). The callback is awaited before the request is sent and after the response metadata is collected, before the next step. A checkpoint error stops the execution, with no further paid HTTP. The update is made under the attempt identifier, without changing the final state and without releasing the reservation early. On a failure after sending and before the response checkpoint, recovery keeps unknown; it does not replay the call. This is a JSON extension, with no table migration and no rewriting of old history.

The coordinator receives the executor as a dependency; the existing public execution entry point can keep the fetcher as a compatibility facade. completed is validated, and only then, under the operation lock, the report and ai_attempts are written. Validation rejects the report but does not delete accounting. Expected errors are a failed/unknown/cancelled result with a safe code; an unexpected exception records a safe error and the last checkpoint, keeps the uncertain cost and no publication. Keep the response identifiers in order, also when there is no report; compatibility of the existing response_id and usage is maintained.

Regressions: `tests/company-research.test.ts`, `tests/company-research.integration.test.ts` and the existing fixtures. E04-AC01: reuse/refresh/command ID; AC02: missing topics/findings, foreign evidence and quote, validation after the executor returns; AC03: known search cost + synthesis error/unknown, rounding compatibility of the whole attempt, crash/checkpoint and no second HTTP after a write error; AC04: restart/duplicates and the previous report. Test through ResearchExecutor and the HTTP contract, without a separate public interface for an artificial search provider.
