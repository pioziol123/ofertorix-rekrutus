# Architecture review using codebase-design

Date: 2026-11-05. Beads: `oferty-pracy-ijo`.

Scope: a review of the current working directory, including the existing changes to `lib/profile/ai.ts`, the new `lib/ai/models/` and the local AI documentation. These are design recommendations, not approval of new contracts or proof that integrations work. No application code was changed.

## Conclusion

The biggest benefit will come from finishing the separation of profile and assessment rules from AI execution protocols. The existing `lokalne-ai` plan points in the right direction, but moving functions or adding an adapter class is not enough: consumers must stop knowing the provider's response format, its transport rules and the states of its batches.

A separate option is a shared module for requesting source syncs. A real transaction and queue protocol is repeated there. I recommend doing the AI work from the existing plan first, and assessing this refactor before adding the next importer.

The assessment uses the skill's notion of module depth: how much behaviour a consumer gets relative to the knowledge needed to use the interface correctly. File length alone is not an architectural problem.

## 1. Shared configuration and budget: fix the direction of dependencies

**Evidence:** `lib/profile/ai.ts:62` defines `AiConfiguration`, `:72` reading the configuration, `:101` cost calculation, `:128` budget reservation. They are imported by, among others, `lib/matching/store.ts:7`, `lib/matching/batch.ts:3`, `lib/companies/research.ts:5` and `lib/companies/research-provider.ts:2`.

The profile currently owns a mechanism that assessments and research also need. Changing the shared funding policy requires going into the profile module, and consumers take on this dependency.

**Recommendation:** carry out the existing stage 1: configuration and budget in `lib/ai/`, without a dependency back to the profile. Treat this as tidying ownership, not as an increase in module depth on its own. The reservation should still use the passed transaction client, so that saving the request, the reservation and the queue work stays atomic.

**Cost and limits:** do not build a universal operations system along the way. Profile, Batch and research give different meanings to restart, unknown result and retry. A shared cost journal does not mean an identical execution cycle.

**Verification during implementation:** amount arithmetic, the month in Europe/Warsaw, concurrent funding and unknown cost; regressions of the existing profile, assessment and research integrations. Changes to the rules for zero local cost belong to the relevant stage of the plan.

**Existing scope:** `oferty-pracy-334.2`, `docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md`.

## 2. Structured model: the adapter should hide the provider protocol

**Evidence from the working implementation:**

- `lib/ai/models/model.ts:11` introduces `StructuredModel`, but `:17–22` exposes, among others, `reasoning`, `store`, `tools` and `serviceTier`.
- `lib/ai/models/openai.ts:79–83` always returns `outcome: 'completed'` and puts the whole serialised OpenAI response into `text`.
- `lib/profile/ai.ts:358` creates `OpenAiAdapter` itself; `:373–385` reconstructs this response, and `readAiProposal` in `:24–51` still requires the fields `status`, `output`, `message` and `output_text`.
- The adapter in `lib/ai/models/openai.ts:57–94` reduces errors to plain `retryable`/`non-retryable` exceptions. The consumer in `lib/profile/ai.ts:368` sets `requestStarted` only after the call ends and in `:388` infers a retry from local flags.

The current interface still requires knowledge of OpenAI. Moving HTTP into a class does not yet make the profile independent of the provider. The places described are the state of work in progress, not an assessment of a completed implementation.

**Recommended interface:** one operation that generates a structured response. The input covers the instruction, the data and an unambiguously defined schema format. The result contains the response text, the real state of completion/refusal/incomplete result, an identifier, and known or unknown usage. An error must keep the information needed by the existing execution and settlement policy; it must not be reconstructed from the message text.

**What to hide:** the Responses format, reading the content, detecting refusal and incomplete responses, HTTP and header interpretation. Provider-specific settings go into the configuration of its adapter, to the extent the existing behaviour needs. The profile module keeps the domain instructions, `checkProposal`, quotation verification and proposal publication. The adapter should be passed to the executor from the place that assembles dependencies.

**Benefit:** OpenAI, the future Ollama and a test adapter deliver the same kind of result; the profile does not reconstruct another party's response. Do not extend this interface with OpenCode agent sessions or the Batch cycle — they behave differently.

**Verification during implementation:** profile tests through its operations with a test adapter; OpenAI adapter contract tests on HTTP responses. A refusal, an incomplete response, invalid JSON and an invalid quotation do not change the profile; cost is still settled regardless of whether the content is valid. Keep the retry policy required by stage 2, and make later changes to the rules in the stage meant for them.

**Existing scope:** `oferty-pracy-334.3` and `oferty-pracy-334.6`.

## 3. Matching: a neutral task and publication, a separate Batch execution

**Evidence:** `lib/matching/store.ts:113–135` already creates a Responses request and a `matching_batches` record when preparing an assessment. `applyMatchingLine` in `:200–273` accepts `BatchLine` and `Batch`, interprets batch errors, settles the cost, validates the assessment and publishes the rating. At the same time, this function is already shared: single execution (`store.ts:482`) and group execution (`lib/matching/groups.ts:444`) use it.

A future local executor needs the same assessment and publication rules, but it does not need `custom_id`, OpenAI files or upload states. Forcing the Batch format on it would enlarge the interface it must know.

**Recommendation:** the matching task describes the saved input and its versions, the instructions and the schema. The Batch adapter translates them into its protocol. The shared publication accepts a normalised execution result and the request identifier, fetches the authoritative snapshot itself, and ensures one-time publication and currency.

**What to keep:** the existing shared rating publication and the evidence checks. Do not create two new publishers for OpenAI and Ollama. The archive, upload/create/poll and the uncertainty of batch creation stay in the Batch execution. Stage 3 may keep compatible facades and the current data schema; local execution is added in stage 6.

**Verification during implementation:** a repeated delivery does not create another revision; an old result does not become current; a partial group error keeps the valid results; invalid content does not remove data about paid usage. The existing tests `matching.integration`, `matching-groups.integration`, `matching-ratings.integration` and `matching-archive.integration` are the starting point. New publication tests should check behaviour through its interface, without fixing the private split of functions.

**Existing scope:** `oferty-pracy-334.4` and `oferty-pracy-334.7`.

## 4. Sync: one module for transactional requests

**Evidence:** `lib/sources/sync.ts:28–79`, `lib/sources/polish-sync.ts:56–106` and `lib/sources/jobspy-sync.ts:57–100` repeat the lock, the selection of the active run, saving the scope, creating the run, `boss.send` on the same transaction client and saving the job identifier.

This is a real shared responsibility: today a fix to atomicity must be considered in several places. At the same time there are important differences: SOLID checks the active run per scope and has a schedule, Polish/JobSpy per source; execution times and the way a partial result is detected differ.

**Recommendation:** consider an internal module `enqueueSourceRun` that hides the whole saving and delivery of work. Its input describes the source, the scope and an explicit deduplication/schedule policy. If it required a set of callbacks with SQL and a step order supplied by each consumer, it would not simplify anything — then the scope must be reduced to the truly shared protocol.

**Cost and limits:** do not unify the importers' completeness rules along the way, and do not change deduplication from the source level to the scope level. Fetching, limits and data interpretation stay with the specific sources. This is a candidate for assessment, outside the current AI plan.

**Further assessment:** `oferty-pracy-slu`, status for triage, not marked as ready for implementation.

**Verification during implementation:** no work in the queue means a rollback of the run; concurrent requests keep the existing deduplication; the SOLID schedule still works; tests of specific importers keep the distinction between complete and incomplete sync. Use the existing PostgreSQL/pg-boss integration tests, without a new layer of fake repositories.

## Research: keep the existing depth

`lib/companies/research.ts:56` exposes the research request, `:132` execution, `:198` recovery and `:252` reading. The consumer does not have to reserve the budget, create the attempt and send the request itself. This is already significant module depth, despite many details inside the file.

With a second executor it is worth applying the existing stage 4: pass in the executor instead of calling `runResearch` directly (`research.ts:164`). The companies module should still control reuse/refresh, report versions and evidence acceptance. Merely splitting the file into publicly available `request/fund/claim/settle/recover` would push the duty of knowing the order onto consumers.

## Scope of the check and limits

- The code, its consumers, the existing tests and the AI stage designs were checked; the recommendations are a static analysis.
- No services or paid calls were run. No application code, specifications or architecture decisions were changed.
- An attempt to run three test suites (`profile.test.ts`, `matching-batch.test.ts`, `company-research.test.ts`) did not reach execution: Corepack could not write its cache outside the sandbox, and a direct call confirmed that there is no local Vitest installation. There is no new PASS or FAIL result for application tests. Installing dependencies was not needed for this review.
- `jbcontext` semantic search required a login to JetBrains AI Platform; file reads and text search were used instead.
- Documents that describe the plan do not prove its implementation. The existing working changes were left for their author's further work.

Basis: the skill `mattpocock-skills:codebase-design` (`SKILL.md`, `DEEPENING.md`), `GLOSSARY.md`, the current code and test files, `docs/specs/pierwsza-wersja/architecture.md` and `docs/specs/lokalne-ai/`.
