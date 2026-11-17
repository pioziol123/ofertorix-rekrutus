# Stage 2: Profile independent of the OpenAI protocol — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Beads: `oferty-pracy-334.3`, preparation `334.20`. This is the target design, not a test result. Basis: [Requirements](requirements.md), [LA-02/03](../../requirements.md), [plan](../../README.md). The stage requires stage 1 to be finished.

## Baseline state and boundaries

Reviewed: the work-in-progress [profile/ai.ts](../../../../../lib/profile/ai.ts), [model.ts](../../../../../lib/ai/models/model.ts), [openai.ts](../../../../../lib/ai/models/openai.ts) and the profile version from HEAD. The existing adapter returns the whole Responses result as text, always declares completed, loses the retry semantics and converts the Zod schema again despite the JSON Schema type. Profile creates a concrete adapter, sets requestStarted only after the response and makes responseId depend on usage. This is a partial implementation to be corrected in this task; do not remove other changes.

Profile owns the instructions, factSchema, JSON.parse and checkProposal. The adapter owns HTTP, Responses normalisation and the OpenAI transport policy. Writing the attempt, retry and the proposal stay in profile. Tools, Batch and sessions do not belong to StructuredModel.

## E02-D01 — Single-model contract

Target interface in `lib/ai/models/model.ts`:

```ts
type ModelRequest = {
  model: string
  instructions: string
  input: string
  output: { name: string; schema: Record<string, unknown> }
}
type ModelResult = {
  outcome: 'completed' | 'refused' | 'incomplete'
  text: string | null
  usage: { inputTokens: number | null; outputTokens: number | null }
  responseId: string | null
}
type StructuredModel = {
  generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResult>
}
```

All request fields are required; input/instructions/name are non-empty. The domain converts Zod to draft-7 JSON Schema and removes `$schema` once. The adapter receives a ready JSON Schema, never Zod. completed has exactly one non-empty final assistant content; reasoning is not content. A refusal gives refused, a status other than completed gives incomplete; both have text=null. Zero or several contents with status completed is a format error. Each usage counter independently: a safe non-negative integer or null. We keep responseId also without usage. Validation of quotes and JSON belongs to profile.

`OpenAiAdapter` receives through its constructor a fetcher, a key resolver and the recorded options of the paid call. `maxOutputTokens`, reasoning, store, tools, serviceTier are not parameters of the neutral interface. An adapter factory in `lib/ai/models/` picks the implementation from the recorded configuration. The worker's entry point assembles the dependencies; the internal profile execution function takes a StructuredModel. Keep the public entry point `executeAi(pool,boss,id,fetcher)` as a facade for the current consumers/tests; do not require HTTP in domain tests.

The OpenAI payload is identical to the baseline profile: `/v1/responses`, model, store=false, tools=[], service_tier=default, max_output_tokens from the snapshot, reasoning low, the existing instructions/input_text and strict json_schema `profile_proposal`. The paid 90 s timeout stays an option of this adapter; an external signal is combined with it. Do not carry this deadline over to Ollama.

## E02-D02 — Errors and retry compatibility

The typed adapter error has `code: configuration|network|http|format|aborted`, `requestSent:boolean`, `responseReceived:boolean`, `httpStatus:number|null`, `retryAfterMs:number|null`, `responseId:string|null` and normalised usage. No raw body/CV/key in the message. Set `requestSent=true` before calling fetch; it means the request may have been sent, not proof that it was accepted. Do not infer HTTP from the exception text. A body parsing error after an HTTP response does not become a network error before the response. Keep the available metadata also on a format error.

The coordinator keeps the HEAD policy of the paid profile: at most two attempts per generation; retry for HTTP 429/5xx and for an uncertain requestSent without responseReceived. Default delay 1000 ms. Retry-After: a number of seconds or an HTTP date; an invalid value or >60000 ms disables retry, otherwise a minimum of 1000 ms. Invalid JSON, refusal, incomplete and quote validation do not trigger an automatic correction. The existing wrapper regression is not a new product policy.

An unknown cost keeps the reservation. Settlement requires both counters to be within the limits of the paid snapshot. Do not compute tokens from the text and do not zero the cost on a validator error. Writing the attempt and enqueueing the paid retry stay atomic. The local manual retry policy is created only in stage 5.

## Change and compatibility

No migrations or env changes. Old queued configurations still use OpenAI. Split `readAiProposal` into private provider normalisation and public validation of the proposal text; switch the tests instead of leaving the domain dependent on Responses. Do not export the OpenAI parser from profile as a second contract. Proposal history and approval stay unchanged.

## Verification and completion

| Criterion | Evidence required in the implementation |
| --- | --- |
| E02-AC01 | An HTTP contract on a fake compares the full payload with HEAD; a domain test injects a StructuredModel, without the network. |
| E02-AC02 | The current quote cases in `tests/profile.test.ts` and proposal/acceptance/revision conflict in `tests/profile.integration.test.ts`. |
| E02-AC03 | A matrix of completed/refused/incomplete, 0/2 contents, bad JSON, HTTP parsing error and network error, each usage counter missing separately and the ID preserved; messages without secrets. |
| E02-AC04 | 429/500/401, Retry-After seconds/date/invalid/>60 s, loss of the response before/after headers, double delivery, no double proposal/cost; recovery regressions in the profile tests. |

The adapter test can go in `tests/ai-models.test.ts`. Keep the existing cases, move them to the proper interface instead of duplicating the parser. `pnpm check`, build and integrations with RUN_INTEGRATION=1 per the [hand-off](../../przekazanie-lokalnemu-modelowi.md). Workflow implement-with-tester. There is no open product decision for this stage; updating the existing code is the implementer's obligation.
