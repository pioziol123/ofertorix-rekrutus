# Stage 1: Shared configuration and budget — Solution design

Status: **technical review completed**, 2026-11-05. Stage 1 of nine, prepared for implementation of an equivalent extraction. Beads `oferty-pracy-334.2` holds the implementation status; preparation: `oferty-pracy-334.19`. The designed files below are not a statement about existing code or about tests that were run.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. These choices do not extend stage 1 with new local execution.

Normative scope of behaviour: [Requirements](requirements.md), E01-R01–E01-R04. State checked: the local directory as of 2026-11-05, including the existing changes; this is not only HEAD. Refresh this snapshot when coding starts.

## Approach and boundaries

The source of the extraction is [lib/profile/ai.ts](../../../../../lib/profile/ai.ts). As of the review, the target configuration.ts and budget.ts do not exist; the work-in-progress lib/ai/models/model.ts and openai.ts already exist.

| Designed file | Ownership and dependencies |
| --- | --- |
| lib/ai/configuration.ts | AiConfiguration and aiConfiguration; the existing strict Zod parsing and reading env on every call, without a cache. Uses the internal amount parser. Does not import budget.ts, profile or the OpenAI adapter. |
| lib/ai/budget.ts | chargeCeiling, budgetMonth and reserve. Imports AiConfiguration only as a type, plus the shared arithmetic. Does not create a database client or a queue. |
| lib/ai/money.ts | million, ceil, decimal and money, moved here and internal to lib/ai; one decimal parser shared by configuration validation and calculations. No dependency on configuration, the database or the domain. Domain consumers do not import these details. |

Switch all direct imports of the shared symbols, including type-only imports:

- lib/profile/ai.ts — uses configuration.ts and budget.ts, keeping the rest of the profile code and the started model integration.
- lib/matching/store.ts, lib/matching/batch.ts and **lib/matching/list.ts** — the last file shows the cost in the offer list and was left out of the original draft.
- lib/companies/research.ts and lib/companies/research-provider.ts.
- tests/profile.test.ts, tests/matching-batch.test.ts, tests/matching.integration.test.ts, tests/matching-groups.integration.test.ts, tests/company-research.integration.test.ts and tests/company-research.fixtures.ts.

As of the review, matching/groups.ts uses funding through matching/store.ts; it has no import of its own of the shared symbols. The group regression covers it, without forcing a new dependency. The imports of executeAi, resumeAi and readAiProposal stay in profile, also in the tests and the worker. Before the change, repeat the search for consumers in case the directory has changed. The shared modules do not import domain modules; configuration and budget do not depend on each other cyclically.

## Decision E01-D01 — Move the existing functions without a new abstraction

Leaving the shared functions in profile keeps the other modules dependent on profile. We extract the existing behaviour, without a new operation system, repositories or a provider interface. The internal money.ts prevents duplicating the parser between configuration and calculations; it does not create a new interface for the domain. Changes to the rules for zero local cost belong to stage 5.

Integration points in the current directory: [lib/profile/ai.ts](../../../../../lib/profile/ai.ts), [lib/matching/store.ts](../../../../../lib/matching/store.ts), [lib/companies/research-provider.ts](../../../../../lib/companies/research-provider.ts). They show where the change happens, not an obligation to move all of their responsibilities.

## Contracts and invariants of the stage

Keep the public signatures: aiConfiguration(variable = 'AI_PROFILE_PRICING_JSON'): AiConfiguration | null, chargeCeiling(config,input,output): string, budgetMonth(now?:Date): string, reserve(client:PoolClient,config:AiConfiguration,now?:Date,extraCost='0'): Promise<{month:string,cost:string,enough:boolean}>. The import modules change, not the arguments or the meaning of the results.

AiConfiguration keeps model, version, inputUsdPerMillion, outputUsdPerMillion, usdPln, fxVersion, maxInputTokens and maxOutputTokens. Reading still requires OPENAI_API_KEY and the named *_PRICING_JSON variable. Empty/invalid JSON, unknown fields, wrong types and invalid amounts give null. Price amounts and the exchange rate must be positive; maxInputTokens stays a positive integer up to 2 000 000, maxOutputTokens up to 6 000. We do not introduce Ollama configuration or new env here. Constraints specific to matchingConfiguration and researchConfiguration stay with their existing owners.

Amounts are decimal strings and bigint in millionths. Keep the existing parser (1–6 digits of the integer part, optionally 1–6 digits of the fraction), the two round-up steps and the result with six decimal places. Do not widen the input formats or change the rounding during the move. chargeCeiling rejects negative, fractional and unsafe integer token usage, but allows zero usage.

**reserve does not write the reservation by itself.** In a transaction started by the caller, it creates the month with the existing 100 PLN limit when needed, locks the month row FOR UPDATE and checks availability based on ai_attempts: actual_pln for settled, reserved_pln for the other states. The cost includes chargeCeiling for the recorded token caps and extraCost, and it is returned also when enough=false.

In the same transaction, the caller writes ai_attempts and requests the work using the same SQL client. The lock lasts until the caller's commit/rollback. reserve does not run BEGIN/COMMIT/ROLLBACK, does not release the client, does not send work and does not make HTTP calls. Do not change the funding order or the all-or-none savepoint of groups. The month is determined in Europe/Warsaw and persisted by the caller; settlement keeps the attempt's month instead of determining it again. SQL and the data schema stay unchanged.

The switch is local and atomic within the change: the final state does not leave the shared symbols as re-exports from profile. Do not create a general barrel export that combines the shared budget with model adapters or the domain.

## Migration and rollout

No migrations or new env, no change to OpenAI payloads, attempt states, retry policy, archive or publication. Reverting the extraction alone does not require a data change; any revert must keep the independent existing adapter changes. Current queued/waiting_budget attempts use the same recorded configurations. The stage is part of one shared deployment of the epic, not a separate release.

## Verification

The checks below are conditions for finishing the implementation, not a result produced by this review. HTTP checks use fakes, with no paid calls. PostgreSQL tests have their own isolated schemas and require RUN_INTEGRATION=1; without this flag, skipped tests are not proof that the criteria are met.

| Criterion | What verification must show |
| --- | --- |
| E01-AC01 | A read matrix for all three *_PRICING_JSON: valid configuration, missing key/env, empty/invalid JSON, foreign field, wrong type, zero or invalid price/exchange rate, token limits. Reading after a further env change does not return a cache of the previous one. Regression of the additional researchConfiguration constraints in tests/company-research.test.ts. The import check also covers the offer list and fixtures. |
| E01-AC02 | Keep the amount and time zone assertions from tests/profile.test.ts; check zero usage, rounding of an incomplete millionth, and rejection of fractions, negative values and values above MAX_SAFE_INTEGER. Cost and searchFee/researchCeiling stay consistent with tests/company-research.test.ts. Test the public functions, without separately testing simple delegations. |
| E01-AC03 | tests/profile.integration.test.ts: concurrent imports and rollback when the queue returns null; tests/matching-groups.integration.test.ts: funding the whole group or no item; tests/matching.integration.test.ts and tests/company-research.integration.test.ts: shared budget and the preserved unknown reserve. Add a check of settlement across the month boundary if such an assertion is missing. |
| E01-AC04 | Regressions in tests/profile.integration.test.ts, tests/matching.integration.test.ts, tests/matching-groups.integration.test.ts, tests/company-research.integration.test.ts; list costs in tests/matching-list.integration.test.ts and transport/archive in tests/matching-batch.test.ts and tests/matching-archive.integration.test.ts. No new profile/assessment/report revision caused by the extraction itself. |

Put the missing configuration matrix and arithmetic cases in the shared AI tests, e.g. tests/ai-configuration.test.ts and tests/ai-budget.test.ts. Existing amount tests can be moved from profile instead of being duplicated. The suggested names of new tests are an implementation arrangement, not a new domain contract.

Implementation quality conditions, per the [README](../../../../../README.md): `pnpm check`, `pnpm build`, then the needed integrations with RUN_INTEGRATION=1; the profile HTTP tests require a fresh build. The project also provides these commands through docker compose run --rm tools. Do not enable parallel execution of integration files: PostgreSQL advisory locks are global to the database, which vitest.config.ts takes into account.

The project's standard path on a prepared Compose environment (the commands are run during implementation, not as part of the documentation review):

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm build
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
```

Before editing code, record the baseline check results for the existing directory. If the unfinished adapter already causes a failure, distinguish it from a regression of the extraction, keep the evidence and assign the fix to the proper scope of stage 2. Do not silently fix the adapter in stage 1, and do not describe a failing check as a success. Report an environment blocker and the unexecuted scope in Beads.

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Review result and start conditions

O-L4 for this stage was done on 2026-11-05: the contracts were compared with lib/profile/ai.ts, its consumers and the existing tests. The shared parser, the missing import in the offer list, the obligations of the reserve caller and the observable acceptance criteria were clarified. Product behaviour and the stage scope were not changed.

There is no open material decision blocking the implementation of stage 1. The local runtime gates T01–T05 are not its dependency. The current execution status stays in Beads; this review does not close the implementation task and does not start coding.
