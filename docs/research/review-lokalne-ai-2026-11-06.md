# Review of the local AI implementation — 2026-11-06

**Result: the changes are not ready to ship.** The implementation does not cover the whole epic, the local profile path does not work according to the contract, and it introduces regressions in OpenAI settlement.

Scope confirmed by the owner: all local changes, including untracked files, relative to `6086ce161d4b31d79abdbc463a2993c2febd1cbd`. `HEAD` points to the same commit; the list of new commits is empty. The comparison is `git diff 6086ce1 --` plus reading the files from `git ls-files --others --exclude-standard`. A three-dot diff between identical commits does not cover this scope. The epic's preparation documents are requirements for the implementation, not evidence that it was done.

The review was done along two independent axes, following the named code-review skill. The report does not merge their assessments. The application code and the existing tests were left unchanged. Review task: `oferty-pracy-334.22`.

## Standards

No separate, unambiguous violation of the documented coding standards was found beyond behaviour that belongs to the Spec axis. `CLAUDE.md` contains convention placeholders; the architecture document separates decisions from working proposals. No `CODING_STANDARDS.md` or `CONTRIBUTING.md` was found. Errors detected by tools are reported separately, as the skill requires.

- **ST1 — P2, possible Primitive Obsession; heuristic assessment.** `lib/ai/models/openai.ts:88`, `ollama.ts:122`, `lib/profile/ai.ts:410`: `error.message.includes('429') || error.message.includes('5')`, then `throw new Error('retryable')` and comparing message text. Diagnostic text acts as a control protocol and loses the HTTP status and `Retry-After`; any "5" can change the classification. A shared error type should carry the code, status and data needed for retry and settlement. Retry behaviour is assessed independently in S6.
- **ST2 — P3, possible Duplicated Code / Data Clumps; heuristic assessment.** `lib/ai/models/model.ts:12`, `openai.ts:7`, `ollama.ts:13`: the repeated block `model`, `instructions`, `input`, `schema`, `maxOutputTokens`, `reasoning`, `store`, `tools`, `serviceTier`. A contract change requires three changes despite the shared port. Extract one request type; keep provider settings with its configuration.

Sources of standards: `AGENTS.md`, `CLAUDE.md`, `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, `GLOSSARY.md`, the historical `docs/product/ustalenia.md` and the current architecture of the first version. Heuristics are not hard violations.

## Spec

Canonical source: [requirements LA-01–21](../specs/lokalne-ai/requirements.md), the stage pairs, the [runtime contracts](../specs/lokalne-ai/kontrakty-runtime.md) and the [panel](../specs/lokalne-ai/features/panel-zadan/requirements.md).

1. **S1 — P1: OpenAI is settled as free.** `lib/profile/ai.ts:426–435` unconditionally saves `settled` and cost `0`, also for a paid call and unknown usage. It releases the reservation, so the budget no longer limits real spending. LA-02: "The refactor preserves existing results, history and active OpenAI operations"; stage 2 SD: "An unknown cost keeps the reservation". The tests of existing settlement and unknown usage fail. Fix: `334.23`.
2. **S2 — P1: the local profile still requires OpenAI configuration.** `lib/profile/ai.ts:77,212,241` blocks the request without a key/price list, and `:165` reserves the paid budget. LA-04: "does not require an OpenAI key or price list"; LA-06: "An exhausted budget for paid services does not block purely local work". Fix: `334.24`.
3. **S3 — P1: a valid Ollama result does not pass the profile path.** `lib/ai/models/ollama.ts:89` returns the whole `{done,message,…}`. `lib/profile/ai.ts:402` passes it to a parser that requires OpenAI `status/output` (`:33–46`). E05-AC02 requires: "a valid proposal with quotations is created". Reproduced with HTTP fake → adapter → the actual profile parser. Fix: `334.25`.
4. **S4 — P1: the configuration of a waiting job is not immutable.** The provider is read from the current env in `lib/profile/ai.ts:359`, the model from the legacy price list (`:377`), the endpoint from the current `OLLAMA_HOST` (`ollama.ts:8`). The model settings, endpointRef/endpointVersion and runtimeParameters of the new configuration do not drive the request according to the snapshot. LA-03: "A change of the environment configuration does not redirect a waiting operation". Fix: `334.26`.
5. **S5 — P1: an invalid configuration triggers a fallback to the cloud.** `lib/ai/configuration.ts:35–37` returns `null` after an error; `lib/profile/ai.ts:364–369` then chooses OpenAI. E05-D01: "An empty string, null, unknown fields or an invalid combination mean an error without fallback". Moreover, the exact example from `.env.example` causes a Zod 4 error through the single-argument `z.record(z.any())` (`configuration.ts:11`). If a paid configuration exists, this can send data to OpenAI even though Ollama was chosen. Fix: `334.27`.
6. **S6 — P1: retry errors leave the job `running`.** `openai.ts:88–90` throws `retryable`, and `lib/profile/ai.ts:414–416` rethrows it before saving the result. `requestStarted`, set only after success (`:385`), does not keep the existing transport handling; `Retry-After` is lost. LA-02 preserves existing operations; the stage 2 SD requires retry on 429/5xx and correct settlement of an uncertain request. The existing transient retry test fails. Fix: `334.28`.
7. **S7 — P1: local runtime rules are missing.** `ollama.ts:62` introduces a 90 s deadline. `lib/profile/ai.ts:325,465` uses a profile lock that gets released, without a durable shared slot kept on unknown. LA-08 forbids "a fixed deadline for local work", and LA-11 requires: "unknown keeps the slot occupied until the end of the work is confirmed". This remains the work of the open stage `334.6`, not a completed implementation.
8. **S8 — P1: the whole epic was not delivered.** Assessments still use OpenAI (`lib/matching/store.ts:38`, `batch.ts:4`), and so does research (`lib/companies/research-provider.ts:159`). There is no OpenCode executor, no browser tools, no archive of local executions, and no panel API/UI. The refactors of earlier stages are also not complete; for example, configuration and budget still stay in the profile. LA-16: "Release acceptance covers all nine stages and PZ-01–08". The implementation tasks remain open; they were not duplicated with new tasks.
9. **S9 — P1: the adapters do not fulfil the declared schema and completion contract.** `openai.ts:22` and `ollama.ts:27` call `z.toJSONSchema` on a parameter declared as a ready JSON Schema; an attempt that follows the interface throws `TypeError` in both adapters. Stage 2 SD: "The adapter receives a ready JSON Schema, never Zod". `ollama.ts:52–57` sends the wrapper `type=json_schema/name/strict/schema` instead of the schema itself, and `:82–89` ignores `done_reason=length`. Stage 5 SD: "format from JSON Schema" and "completed requires completion and an acceptable done_reason". Reproduced with separate contract tests. Fix together with S3: `334.25`.

No separate, justified functionality outside the scope was found.

## Verification

The local image `oferty-pracy-tools` was used, but its old dependency set was first rebuilt with `pnpm install --frozen-lockfile`. Preliminary results on the old dependencies are not evidence of defects. The actual comparison uses Node 24.15.0, pnpm 10.34.9, an identical lockfile and a one-off PostgreSQL 18.6. Repository copies in the container: `/baseline` and `/app`. The test database has no volume and no host port. Neither the user's database nor real AI keys were used. HTTP servers were started only inside the container, and the test containers were removed afterwards.

| Check | `6086ce1` | Local state |
| --- | --- | --- |
| `pnpm lint` | PASS; 2 existing Vue warnings | FAIL; 19 errors and the same 2 warnings |
| `pnpm typecheck` | PASS | FAIL; JSON Schema contracts, Zod record, type imports and nullable usage |
| `pnpm build` | PASS | PASS |
| Unit and integration tests, `RUN_INTEGRATION=1` | 554 PASS; 28 files PASS | 543 PASS, 11 FAIL; plus an empty suite `test/ollama-adapter.test.ts` |
| Extra adapter contract trials | Not applicable — no new adapters | 7 FAIL, each reproduces a violation of the required contract |

Command for the comparison tests: `pnpm exec vitest run --exclude tests/setup.integration.test.ts --exclude tests/polish-python.test.ts`. Integrations were enabled with `RUN_INTEGRATION=1`; a test database, migrations, a built application and `WEB_BASE_URL` were provided. Two smoke tests that require a separate Compose worker and one Python/JobSpy adapter test were excluded. They are not reported as passed. The remaining 554 existing tests were run on both states.

The 11 regressions concern the profile: settlement of known usage, usage after a rejected proposal, keeping an unknown cost, and retry. The new `test/ollama-adapter.test.ts` only logs object construction and catches errors; Vitest reports `No test suite found`. It is not a test of adapter behaviour. Fix for the checks and tests: `334.29`.

The seven extra trials check: the env configuration example, rejection of an invalid configuration, JSON Schema in both adapters, a valid Ollama response in the profile parser, the format field and an incomplete response. HTTP calls were fakes. No real Ollama or OpenCode inference was run; the result is not a qualification of live services/T01–T05.

## Evidence and handover

Durable copies of the logs and extra trials are in the [evidence directory](review-lokalne-ai-2026-11-06/). The trials file has the `.txt` extension, so that keeping the report does not by itself add failing tests to the project's suite. The reproduction script is a record of the actual run; it requires preparing the container, the `/review` and `/results` mounts, the baseline archive and the test database as described above.

Fixes `oferty-pracy-334.23`–`334.29` were attached as acceptance blockers of `334.10`. The tasks of the original stages remain open. Graph checked with `bd dep cycles --json`: no cycles. The review does not close the implementation or the live gates. No commit, push or Dolt sync was done.

Standards: 2 heuristic notes, highest P2 — control errors encoded in text. Spec: 9 P1 problems, including unconditional zeroing of paid costs and an implicit fallback to OpenAI.
