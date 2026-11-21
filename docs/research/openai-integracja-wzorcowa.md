# OpenAI integration: the model flow for single answers, batches and agent work, compared with ours

Sources as of: **2026-11-21**. Code on `main` at commit `f0a030e`. The owner asked how the AI module _should_ integrate with OpenAI for its three ways of calling it, according to OpenAI's documentation and public practice, and how our flow compares. Findings describe what was true when gathered. This document changes no specification, code or task.

## 1. Question, scope and method

**The three services, as the code defines them** (verified in code):

| Name in the code | What it is at OpenAI | Where |
| --- | --- | --- |
| "response" / single mode | One `POST /v1/responses` call with a strict JSON schema, no tools | [openai.ts](../../modules/ai/infrastructure/adapters/openai.ts) |
| "batch" | The Batch API: a JSONL file of `/v1/responses` requests, a batch with a 24 h window, polling, result files | [openai-batch.ts](../../modules/ai/infrastructure/adapters/openai-batch.ts) |
| "agent" | Not the OpenAI Agents SDK. Two fixed `POST /v1/responses` calls: a search with the built-in `web_search` tool, then a schema-bound synthesis without tools | [openai-agent.ts](../../modules/ai/infrastructure/adapters/openai-agent.ts) |

**SDK versions in the repo.** None. `package.json` has no `openai` and no `@openai/agents` dependency; all three adapters call the REST API with Node's `fetch` (Node `>=24.15.0 <25`), and `zod` 4.3.6 validates responses. For reference, the current SDKs are `openai` 7.62.0 and `@openai/agents` 0.22.0 (both read from the `main`/`master` branch of their repositories, not from npm).

**Vocabulary.** The implemented code speaks of _executions_ and _attempts_; the specification of epic `oferty-pracy-sq2` and the glossary speak of _assignments_ and _operations_. Section 3 uses the code's words for the code and the glossary's words for the specification. Sections 4 and 5 describe consequences in the glossary's words.

**How sources were read.** Official pages were fetched on 2026-11-21 (`platform.openai.com/docs` now redirects to `developers.openai.com/api/docs`). SDK facts come from the source files of `openai/openai-node` and `openai/openai-agents-js`. Markers used below:

- no marker: read live on an official page or in SDK source that day;
- **[community]**: a public discussion, not an OpenAI statement; "(opened)" means the thread was read, "(snippet)" means only the search summary was seen;
- **[inference]**: my conclusion from documented facts;
- **[unverified]**: could not be confirmed live.

Earlier research this builds on and does not repeat: [ai-uslugi-weryfikacja.md](ai-uslugi-weryfikacja.md) (terms of service, citations) and [ai-research-budzet.md](ai-research-budzet.md) (cost of research).

## 2. The model integration

### 2.1 Single answer (Responses API)

**What OpenAI recommends**

- **Use Responses, not Chat Completions**, for new work ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
- **State.** Responses are stored by default for at least 30 days; `store: false` disables it ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses), [data controls](https://developers.openai.com/api/docs/guides/your-data)). A one-request-one-result call needs no stored state.
- **Read the status before the content.** `status` is one of `completed`, `failed`, `in_progress`, `cancelled`, `queued`, `incomplete`. `incomplete_details.reason` is `max_output_tokens`, `content_filter` or two newer values. A `200` reply can carry `status: "failed"` with an `error.code` ([openai-node types](https://raw.githubusercontent.com/openai/openai-node/master/src/resources/responses/responses.ts)).
- **Read the text the way the SDK does.** The `output` array may hold reasoning items and several message items in a model-dependent order. The SDK's `output_text` skips items that are not messages and joins every `output_text` part; refusals are separate `refusal` parts ([ResponsesParser.ts](https://raw.githubusercontent.com/openai/openai-node/master/src/lib/ResponsesParser.ts), [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)).
- **Structured outputs.** `text.format` with `type: "json_schema"` and `strict: true` constrains a completed, non-refused answer to the schema. The application "still needs to handle refusals, incomplete responses, and API errors" and to validate business rules ([structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)). The strict subset requires every field and `additionalProperties: false`.
- **Reasoning models and the output cap.** Reasoning tokens are billed as output tokens and count against `max_output_tokens`. When the cap is hit the response is `incomplete`, and this "might occur before any visible output tokens are produced": input and reasoning are paid for and there is no answer. OpenAI recommends "reserving at least 25,000 tokens for reasoning and outputs when you start experimenting", then tuning ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).
- **Service tier.** `default` is standard price and speed. `flex` is priced at Batch rates but is being wound down and is not offered on the newest models ([flex guide](https://developers.openai.com/api/docs/guides/flex-processing)).
- **Background mode.** `background: true` returns an identifier at once; the caller polls `GET /v1/responses/{id}` or receives a webhook. It works with `store: false` (data is kept for about 10 minutes after completion). Completion windows `2h` and `8h` are priced 30% and 40% below Standard, share the Batch rate-limit pool and are in public beta on the GPT-6 family, `gpt-6-luna` included ([background guide](https://developers.openai.com/api/docs/guides/background), [pricing](https://developers.openai.com/api/docs/pricing)).
- **Prompt caching** is on by default. Keep the stable part of the prompt first. On GPT-5.6 and later, input tokens are billed at one of three rates: uncached, cached read (0.1×) or cache write (1.25× for the default 30-minute lifetime). Usage reports `input_tokens_details.cached_tokens` and `cache_write_tokens` ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

**What the community adds [community]**

- Reasoning-only `incomplete` responses with an empty text at low caps are reported repeatedly and treated as expected behaviour ([thread 1373609](https://community.openai.com/t/responses-api-empty-output-text-no-message-item-when-status-incomplete-due-to-max-output-tokens-reasoning-only-output/1373609), opened; [openai-python #2546](https://github.com/openai/openai-python/issues/2546), snippet).
- Strict structured outputs sometimes emit endless newlines until the token cap; an OpenAI support account acknowledged it without a timeline ([thread 1376747](https://community.openai.com/t/structured-outputs-un-minified/1376747), opened). Each such failure costs up to the whole output cap, and a retry may repeat it.
- With Node's `fetch`, long non-streamed reasoning calls can fail on undici's own 300-second timeouts; OpenAI engineering confirmed the mechanism ([thread 1371083](https://community.openai.com/t/200-ok-from-v1-responses-but-body-times-out-und-err-body-timeout/1371083), opened).
- Background requests stuck in `queued` or `in_progress` are reported ([thread 1364478](https://community.openai.com/t/background-mode-requests-stuck-in-queued-forever-responses-api/1364478), snippet). A poller needs its own deadline.

### 2.2 Batch API

**What OpenAI recommends** ([batch guide](https://developers.openai.com/api/docs/guides/batch), [batch reference](https://developers.openai.com/api/reference/resources/batches), [files reference](https://developers.openai.com/api/reference/resources/files/methods/create))

- **When.** For independent requests that can be submitted together and can wait: 50% below Standard, a separate rate-limit pool, a 24 h completion window (the only value), "often more quickly".
- **Limits.** 50,000 requests and 200 MB per file; one model and one endpoint per file; a unique `custom_id` per line; a per-model limit of queued input tokens set per organisation.
- **Statuses.** `validating`, `failed` (the input file failed validation), `in_progress`, `finalizing`, `completed`, `expired`, `cancelling` (up to 10 minutes), `cancelled`.
- **Results.** Successful lines go to the output file, failed ones to the error file. Line order "may not match" the input; map by `custom_id`. On expiry and on cancellation, finished requests are available and charged; unfinished ones appear in the error file with the code `batch_expired`.
- **Files.** Input files with purpose `batch` and output files expire after 30 days by default; both lifetimes can be shortened (`expires_after`, `output_expires_after`). The Batch API is not eligible for zero data retention ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Usage.** The batch object now has a `usage` field with token totals.
- **Webhooks.** Events `batch.completed`, `batch.failed`, `batch.expired`, `batch.cancelled` exist and carry only the batch identifier. Deliveries are signed (Standard Webhooks), retried for up to 72 hours and may be duplicated ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)). The batch guide itself does not mention webhooks and recommends no polling interval.
- **Idempotency.** No de-duplication is documented for creating a batch. `GET /v1/batches` lists batches with their `input_file_id` and `metadata` but has no filter. **[inference]** After a create call with an unknown outcome, an orphan batch can be found by paging the list and matching the `input_file_id`.

**What the community adds [community]** (OpenAI forum only; all opened unless noted)

- **Stuck and slow batches are the most repeated complaint, 2024–2026.** Batches that normally take 5–15 minutes sat for 12 hours or expired half-done ([thread 1375809](https://community.openai.com/t/batch-api-degraded-since-march-4-stuck-at-0-progress-expiring-after-partial-completion/1375809)). A batch stayed in `finalizing` for more than 24 hours until staff shipped a fix ([thread 1366062](https://community.openai.com/t/batch-stuck-in-finalizing-status-for-over-24-hours/1366062)). So a batch can outlive its 24 h window.
- **Counts cannot be trusted alone.** A batch reported all requests completed while its error file held lines with `status_code: 0` and `error: null` ([thread 1364654](https://community.openai.com/t/batch-api-shows-2000-completed-0-failed-but-some-requests-return-status-code-0/1364654)). A line is failed when `error` is set _or_ the status code is not 200 _or_ the `custom_id` is in neither file.
- **Billing.** Staff: billing is "based on token usage from completed requests"; a request that appears only in the error file without usage "shouldn't be billed" ([thread 1385608](https://community.openai.com/t/batch-api-billing-for-failed-requests-504-timeout/1385608)). Server-side reprocessing that billed batches with zero results was reported and refunded ([thread 1379159](https://community.openai.com/t/batch-api-charged-212-for-gpt-5-4-pro-with-zero-completed-results-billing-bug/1379159)).
- **Web search is refused in Batch** with `web_search_unsupported` (2025 reports; current status unknown) ([thread 1361886](https://community.openai.com/t/batch-api-is-web-search-supported-for-v1-responses-getting-web-search-unsupported-on-every-line/1361886)).

### 2.3 Agent work

**What OpenAI recommends**

- **Workflow before agent.** An agent is a system where the model controls the workflow; where a deterministic flow works, "a deterministic solution may suffice", and one agent should be exhausted before splitting into several ([A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)). Anthropic's widely cited article draws the same line: a fixed sequence of model calls with a programmatic check between them is a _prompt-chaining workflow_, and the advice is to use "the simplest solution possible" and direct API calls before a framework ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).
- **The Responses API already loops.** With built-in tools the model can call several tools "within the span of one API request" ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)). `max_tool_calls` caps the built-in calls of one request; `tool_choice: "required"` forces a tool ([openai-node types](https://raw.githubusercontent.com/openai/openai-node/master/src/resources/responses/responses.ts)).
- **Web search** ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)): citations arrive as `url_citation` annotations; `include: ["web_search_call.action.sources"]` returns every page consulted; citations shown to a person must be "prominent, clickable links". Reasoning models search agentically (`open_page`, `find_in_page`). For long research the guide uses a reasoning model with high effort and `background: true`; its long-run example disables client retries. Price: $10 per 1,000 calls plus the search content tokens at the model's rates ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Deep research models are gone.** `o3-deep-research` and `o4-mini-deep-research` were shut down on 2026-07-23; the pattern above replaces them ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Safety for agents that read the web** ([safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)): keep untrusted text out of developer messages and pass it as user input; put structured outputs between steps to remove free-form channels.
- **Agents SDK** ([running agents](https://openai.github.io/openai-agents-js/guides/running-agents/), [tracing](https://openai.github.io/openai-agents-js/guides/tracing/), [models](https://raw.githubusercontent.com/openai/openai-agents-js/main/docs/src/content/docs/guides/models.mdx)): for applications that own the loop, tools, state and approvals. `maxTurns` defaults to 10. Retries are opt-in, and a request that "may already have been accepted" is not replayed without an explicit override. Tracing is on by default in Node and uploads model and tool payloads to OpenAI regardless of `store: false`; it must be disabled separately.

**What the community adds [community]**

- **One call with web search _and_ a JSON schema loses citations**: annotations come back empty, sometimes with truncated JSON; unresolved, no staff answer ([thread 1312488](https://community.openai.com/t/web-search-on-responses-api-breaks-inline-citations-when-passed-a-pydantic-data-model-as-text-format/1312488), [thread 1365140](https://community.openai.com/t/structured-output-breaks-annotation/1365140), both opened). **[inference]** This is the practical reason for gathering first and synthesising second.
- **Search inflates input tokens** on reasoning models: a 5,000-token prompt became 243,551 input tokens after 13 searches ([thread 1317167](https://community.openai.com/t/massive-input-token-inflation-50x-with-o3-web-search/1317167), opened). One request can also bill more searches than expected ([thread 1236954](https://community.openai.com/t/heads-up-web-search-tool-billing-can-be-higher-than-you-expect-here-s-why/1236954), opened).
- **Cited URLs can be dead or invented** ([thread 1371940](https://community.openai.com/t/hallucinated-http-links-in-responses-api/1371940), opened; others as snippets).
- **Low caps fail with search**: `incomplete` even at 8,000 output tokens with web search ([thread 1359180](https://community.openai.com/t/gpt-5-mini-returns-incomplete-response-when-using-web-search-preview-due-to-max-output-tokens-limit/1359180), snippet).

### 2.4 Cross-cutting concerns

| Concern | Model |
| --- | --- |
| **Errors and retries** | Retry `429` rate limits, `500` and `503`; follow `Retry-After` as a minimum, otherwise exponential backoff with jitter; cap attempts and total time. Failed requests count toward the per-minute limit ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)). Do not retry billing `429`s (`credit_balance_exhausted`, `project_spend_limit_exceeded` and similar): "Retrying billing, spend, or quota errors won't restore API access" ([error codes](https://developers.openai.com/api/docs/guides/error-codes)). The official SDK retries twice on connection errors, 408, 409, 429 and 5xx, and uses the server's wait only when it is under 60 seconds ([client.ts](https://raw.githubusercontent.com/openai/openai-node/master/src/client.ts)). |
| **Idempotency, duplicate charges** | No `Idempotency-Key` is documented for `/v1/responses` or `/v1/batches`, and the SDK sends none (its idempotency header name is never set in [client.ts](https://raw.githubusercontent.com/openai/openai-node/master/src/client.ts)). No official statement says whether a request abandoned by the client is still completed or billed. **[inference]** The only protections are on the caller's side: do not resend what may have been accepted, or use background mode so the first reply is an identifier that can be polled. **[community]** Nobody in a 2026 thread could name a de-duplication mechanism ([thread 1399903](https://community.openai.com/t/how-are-you-handling-idempotency-with-ai-api-requests/1399903), opened). |
| **Rate limits** | Per-model requests and tokens per minute by usage tier; Batch and discounted background requests use a separate pool ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)). |
| **Timeouts** | SDK default 10 minutes per attempt; long reasoning or research belongs in background mode ([background guide](https://developers.openai.com/api/docs/guides/background)). |
| **Structured outputs and validation** | Strict schema, then check status, refusal and truncation before parsing, then validate business rules (section 2.1). |
| **Cost and usage** | Compute from `usage` including cached reads, cache writes and reasoning tokens; price depends on context length for some models (`gpt-6-luna` doubles its input rate above 272K input tokens) ([pricing](https://developers.openai.com/api/docs/pricing)). The organisation Usage and Costs endpoints allow reconciliation ([usage reference](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage)). Hard spend limits per project now exist and fail requests with `429`; enforcement "is not instantaneous" ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)). |
| **Observability** | "OpenAI recommends logging request IDs in production deployments." The caller may send its own `X-Client-Request-Id`, which support can look up after a timeout ([API overview](https://developers.openai.com/api/reference/overview)). |
| **Security, keys** | A project service account, a key in the environment or a secret manager, separate projects for staging and production with their own limits ([production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)). `safety_identifier` identifies end users for abuse detection ([safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)). |
| **Data retention** | Abuse-monitoring logs up to 30 days; API data is not used for training by default; `store: false` avoids application state ([data controls](https://developers.openai.com/api/docs/guides/your-data)). |
| **Model pinning** | Behaviour "between snapshots is subject to change"; pin versions and run evals. GA models get at least 6 months' notice before shutdown ([API overview](https://developers.openai.com/api/reference/overview), [deprecations](https://developers.openai.com/api/docs/deprecations)). |
| **Testing** | Test requests synchronously before batching them ([cookbook, archived](https://developers.openai.com/cookbook/examples/batch_processing)); evals before changing a model ([practical guide](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)). |

### 2.5 Decision rule: which service when

| The work | Use | Why |
| --- | --- | --- |
| One answer, wanted within seconds to a couple of minutes | Synchronous Responses call | Simplest; full price |
| One answer that may run longer than the connection can be trusted, or whose result nobody waits for | Responses in background mode, polled | The first reply is an identifier, so a lost connection loses nothing; `2h`/`8h` windows give 30%/40% off (beta) |
| Many independent answers, all known up front, none needed today | Batch API | 50% off; costs a file cycle, polling and partial-result handling, and can take up to a day or more |
| Gathering from the web, then a structured result | Two Responses calls: search with `web_search`, then schema-bound synthesis without tools | Keeps citations, keeps web text away from tools; this is a workflow, not an agent |
| Work where the model must choose among several of _our own_ tools over many turns, with approvals | Agents SDK | Only then does the SDK's loop, guardrails and state pay for itself |

## 3. Our current flow

### 3.1 As implemented

**Single answer** ([openai.ts](../../modules/ai/infrastructure/adapters/openai.ts))

- Body (`openai.ts:66-95`): `store: false`, `tools: []`, `service_tier: "default"`, `max_output_tokens` from the price list (6,000, `model-catalog.ts:68`), `reasoning.effort` (`low` for all three settings keys, `client-settings.ts:10-12`), `instructions`, one user message, strict `json_schema`.
- Sent once with a 90-second limit (`openai.ts:144-146`), no SDK, no streaming.
- Reading (`openai.ts:19-52`): any status other than `completed` is `incomplete`; a `refusal` part is `refused`; exactly one non-empty `output_text` part is required, otherwise the execution fails as `no_content`. Usage is `input_tokens` and `output_tokens` only.
- Errors: a connection error or the time limit is "may have been sent", transient (`openai.ts:149-157`). A non-2xx reply keeps only the status and `Retry-After`; 429 and 5xx are transient when the wait is at most 60 s (`openai.ts:54-61`, `158-170`). The error body is not read or archived.
- Retry (`run-execution.ts:36`, `492-512`): one more attempt, as a new execution, after the suggested wait (default 1 s). The first attempt's cost stays unknown and reserved.
- The result is checked against the response schema before delivery (`run-execution.ts:161-164`, `domain/response-schema.ts`).

**Batch** ([openai-batch.ts](../../modules/ai/infrastructure/adapters/openai-batch.ts), [run-batch.ts](../../modules/ai/run-batch.ts))

- Line (`openai-batch.ts:76-106`): the single body without `service_tier`; `custom_id` is the operation identifier.
- Own limits: 100 lines and 2 MB per file (`openai-batch.ts:109-110`), one model per file, unique identifiers (`204-211`).
- Upload with a 2-day expiry (`217-218`); create with `completion_window: "24h"`, output expiry 7 days and `metadata.operation_id` (`227-243`).
- Send (`461-509`): a 4xx refusal ends the items failed and not charged; any other create error ends them `uncertain` with the reservation kept (`unconfirmed`), and nothing looks the batch up.
- Poll: the periodic process, every 60 s after the previous pass (`periodic/pass.ts:47`, `run-batch.ts:244-253`). No webhook. No deadline of our own.
- Collect (`252-304`, `421-458`): on any terminal status reads the output and the error file, maps by `custom_id`, rejects unknown or duplicate identifiers. A missing line, an error line or a non-200 line ends the item failed with its cost unknown, except a failed batch without files and `batch_expired`, which are not charged.
- Every file and reply is archived before it is read; files are deleted at OpenAI afterwards, with retries (`617-634`).

**Agent** ([openai-agent.ts](../../modules/ai/infrastructure/adapters/openai-agent.ts))

- Step "search" (`347-353`): `web_search` with `search_context_size: "low"`, `tool_choice: "required"`, `max_tool_calls` 3 (`model-catalog.ts:96`), the requesting module's instruction, the target as input.
- Materials (`84-133`): each paragraph of the answer with the `url_citation` annotations inside it, safe URLs only, at most 40. Without any, the synthesis is not sent.
- Step "synthesis" (`360-375`): no tools, the result instruction, input `{target, evidence}`, strict schema.
- Each step: `store: false`, `service_tier: "default"`, `max_output_tokens` of half the cap, 3,000 (`285`), a 120-second limit (`288`), sent once, never retried; the step log is saved before sending and after the reply (`255-339`).
- Cost: summed tokens plus counted `web_search_call` items at $0.01 each (`model-catalog.ts:86-97`); an unmeasured step leaves the cost unknown.

**Shared**

- Price list fixed in code: `gpt-6-luna` at $0.10 input and $0.50 output per million for single and agent work with an input cap of 500,000 tokens; $0.10 and $0.375 for batch (`model-catalog.ts:53-98`). The reservation is the cost of the caps (`domain/cost.ts:70-76`); a usage above a cap leaves the cost unknown (`run-execution.ts:316-324`).
- Key: `OPENAI_API_KEY` from the environment. Model: the alias `gpt-6-luna`, no dated snapshot.
- Tests: every adapter takes a simulated `fetch`; request bodies are pinned by tests. Nothing calls the live API.

### 3.2 As specified where it differs (epic `oferty-pracy-sq2`, not built yet)

Source: [PRD](../specs/sq2-zlecenia-ai/PRD.md), [solution design](../specs/sq2-zlecenia-ai/solution-design.md).

- **Batch mode is dropped.** Each offer is assessed by its own assignment with an ordinary request, at about twice the cost, and returns in about a minute and a half (PRD, "What changes for the owner"). OpenAI's batch mode is put off (`oferty-pracy-sz5`, item 16). The batch adapter is removed by task T10 (solution design, line 153).
- **No retry inside an operation.** A rate limit or server error is an ordinary failure "with no wait and no second call inside the operation" (solution design, line 199); the retry is a new operation, up to 3 automatic ones per assignment. A delay between automatic retries is put off (`oferty-pracy-sz5`, item 10).
- **A broken connection after sending is uncertain**, not retried (line 201). The time limit becomes an ordinary, retryable failure with an unknown cost (line 200).
- **Maximum run times** of 120 s, 900 s and 1,800 s per service (line 152); the PRD states company research takes up to 15 minutes.
- **The exchange with the provider is always kept** (decision ZA-D08); the AI module no longer compares the result with the response format (line 154).
- The requests sent to OpenAI stay the same as today's (line 149). So every finding below about request bodies and response reading applies to both.

## 4. Comparison

"Impl." means the implemented code; "Spec." means the sq2 specification. Cost to close: S is under an hour, M is up to a day, L is more.

| # | Aspect | Model | Ours | Gap | What the owner would see | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | API choice, state | Responses, `store: false` when no state is needed | Same | None | — | — |
| 2 | Structured output | Strict schema, check status and refusal before parsing, validate | Same, plus own schema check (Impl.); the module's check is dropped, the requesting module still validates (Spec.) | None | — | — |
| 3 | Output cap on a reasoning model | Reserve generous room (25,000 to start), tune from `reasoning_tokens` | 6,000 for a single answer, 3,000 per agent step; `reasoning_tokens` not read (Impl. and Spec.) | Tight caps, no measurement | An AI assessment or company research ends without a result as `incomplete`, its cost is charged, and a retry can fail the same way | S to measure and raise; raises the potential cost slightly |
| 4 | Reading the text | Join all `output_text` parts of message items | Exactly one part required | Stricter than the SDK | A complete, paid answer is discarded as "no content" | S |
| 5 | Failure detail | `status: failed` carries `error.code`; `incomplete` carries a reason; HTTP errors carry a code | All non-completed statuses become `incomplete`; the HTTP error body is dropped | Cause lost | The panel shows "http" or "incomplete" and nobody can tell a rate limit from an exhausted OpenAI balance or a schema the API refused | S |
| 6 | Request identifiers | Log `x-request-id`; send `X-Client-Request-Id` | Neither; only the response identifier of a successful reply | No handle for a lost request | An uncertain operation cannot be looked up or raised with OpenAI support; the money stays held with no way to settle it | S |
| 7 | Retry policy (Impl.) | Follow `Retry-After`, backoff, cap attempts, do not retry billing errors | One retry after `Retry-After` when ≤ 60 s; billing 429s are retried like rate limits | Small | One wasted second attempt when the OpenAI account is out of credit | S |
| 8 | Retry policy (Spec.) | Same | Up to 3 automatic operations with no wait | Retries arrive inside the same rate-limit window | A short OpenAI hiccup uses all three automatic operations within seconds and the assignment lands in "needs attention" | S–M; the owner put the delay off deliberately |
| 9 | Resending after a lost connection | No idempotency exists; do not replay what may have been accepted, or use background mode | Impl.: one retry, first cost kept unknown. Spec.: uncertain, no retry | Spec. matches the model; Impl. may pay twice but never under-counts | Impl.: at worst one assessment paid twice, with the first held as unknown | — |
| 10 | Cost from usage | Price cached reads, cache writes and context length | Flat input and output rate; cache fields ignored; input cap 500,000 although the rate doubles above 272,000 | Under-count possible in two cases: cache writes (1.25×) and long context (2×) | The monthly budget shows less than OpenAI bills; the budget stops being a true ceiling. Amounts are fractions of a grosz per operation today | S: make the price list a true ceiling |
| 11 | Agent shape | Fixed gather-then-synthesise workflow; no SDK needed | Same | None | — | — |
| 12 | Agent safety | Untrusted text as input, structured output between steps, no tools on web text | Same | None | — | — |
| 13 | Agent run time | Long research in background mode | Two synchronous calls, 120 s each | Fits only short research | Company research ends uncertain when a search runs longer than 2 minutes, with its cost held (Impl.), or fails and is retried from the first step (Spec.) | M if it happens; measure first |
| 14 | Search cost counting | $0.01 per call plus content tokens; calls can exceed expectations | Counts `web_search_call` items, capped by `max_tool_calls` 3; above the cap the cost is unknown | Whether `open_page` and `find_in_page` items are billed as calls is not documented | Possible over- or under-count of a few grosze per research | S to compare with one invoice line |
| 15 | Batch: partial results, mapping, expiry | Read both files, map by `custom_id`, treat expired and cancelled as partial | Same | None | — | — |
| 16 | Batch: unconfirmed creation | Look the batch up by its input file | Ends uncertain; nothing looks it up | Recoverable case treated as lost | A whole group of assessments is held as uncertain until the owner checks by hand | M; moot once Spec. removes batch |
| 17 | Batch: stuck beyond 24 h | Keep an own deadline | None | Relies on OpenAI ending the batch | Assessments stay "running" with their money held for as long as OpenAI's incident lasts | S–M; moot once Spec. removes batch |
| 18 | Batch: failed lines | Not billed when the line has no usage (staff statement) | Cost unknown, reservation kept | Over-cautious | Budget held for work that was not charged | S; moot once Spec. removes batch |
| 19 | Completion signal | Polling is fine; webhooks optional | Polling every minute | None | — | — |
| 20 | Files at OpenAI | Expire or delete | Short expiry and deletion | Better than the model | — | — |
| 21 | Key and spend backstop | Project key, hard spend limit per project | One key in the environment; no evidence of a project limit (outside the repo) | Unknown | If our budget arithmetic is wrong, nothing at OpenAI stops the spend | S; a dashboard setting, no code |
| 22 | Model pinning | Pin snapshots, watch shutdown dates | Alias `gpt-6-luna`; a dead branch for `gpt-4.1-mini`, which shuts down 2027-01-14 | Whether GPT-6 snapshots exist is unverified | Assessments may shift in tone when OpenAI updates the alias | S to check `GET /v1/models` |
| 23 | Cheaper waiting work (Spec.) | Batch 50% off; background `8h` 40% off; Flex being retired | Spec. pays full price per assessment | A discount is left unused | Each assessment costs about twice the batch price | M; see open question 1 |

## 5. Conclusions

Ranking context: the owner is heading for a first usable version, wants to move fast and defers edge cases unless they come nearly free. The sq2 specification replaces the implemented coordination, so anything that task T10 removes is not worth fixing in the old code.

### (a) Real risks worth acting on now

1. **Measure the output cap before trusting it (row 3).** For a reasoning model, 6,000 output tokens (3,000 per agent step) is well below what OpenAI suggests starting with, and the failure it causes is paid for and repeats on retry. First read `output_tokens_details.reasoning_tokens` and the share of `incomplete` ends from the kept exchanges; then raise the caps if the margin is thin. Raising the output cap to 16,000 adds about 0.025 PLN to a potential cost that the input cap already sets at 0.25 PLN. **Interpretation:** I did not find evidence in the repository that this failure has occurred; the risk follows from the documented behaviour and the community reports.
2. **Make the price list a true ceiling (row 10).** The module's rule is that an actual cost is never under-stated (glossary: Actual cost, Uncertain operation). Two documented price variants break it: cache writes at 1.25× the input rate, and the doubled rates above 272,000 input tokens while the input cap is 500,000. The cheap fix is in the price list alone: either rate the input at the highest rate that the cap allows, or lower the single-answer input cap to 272,000 and use the cache-write rate ($0.125). The second option also lowers the potential cost of an assessment. Agent work needs the long-context rate, because search content accumulates in the input. **To verify first:** one real response's `usage.input_tokens_details`, to confirm that cache writes occur on our requests without opting in.
3. **Keep the provider's error and request identifiers (rows 5 and 6).** Today the reason for an HTTP failure is thrown away and an uncertain operation has no handle at OpenAI. Both matter more under sq2, where the owner decides in the panel whether to retry: "http" does not tell them whether a retry can help. Reading the error body's `code`, logging `x-request-id` and sending the operation identifier as `X-Client-Request-Id` are small changes inside the executor and fit decision ZA-D08 (the exchange is always kept).

### (b) Cheap improvements

4. **Join all `output_text` parts** as the SDK does (row 4).
5. **Treat billing 429s as non-retryable** once the error code is read (rows 7 and 8): the glossary already has "non-retryable failure" for this.
6. **Set a hard monthly spend limit on the OpenAI project** (row 21), slightly above the application's budget. It needs no code and backstops every accounting gap in this document.
7. **Check whether `gpt-6-luna` has dated snapshots** and remove the `gpt-4.1-mini` branch of the agent, which no settings key uses (row 22).
8. **Carry `Retry-After` into the next automatic operation** (row 8), if it fits the queue's send-after option at no design cost. The owner put a retry delay off (`oferty-pracy-sz5`, item 10); no reason is recorded there, so this is a suggestion to revisit, not a contradiction of a reasoned decision.

### (c) Recommended by the model, not worth it here

- **OpenAI Agents SDK.** Our "agent" is a two-step workflow, which is what OpenAI's and Anthropic's guidance recommend for this shape of work, and the community reports explain why one combined call is worse. The SDK would add a loop we do not need and tracing that uploads payloads to OpenAI by default.
- **The `openai` SDK.** Its main gifts are retries and typed parsing. Its automatic retries conflict with the module's rule that a paid request is sent once. Raw `fetch` with pinned request bodies is adequate.
- **Webhooks.** They need a public, signed endpoint; the application runs locally or on one VPS and polls once a minute. OpenAI's batch guide does not even suggest them.
- **Fixing the batch adapter's gaps (rows 16–18).** They are real, and the community confirms batches get stuck and creation fails oddly, but sq2 removes batch mode. If batch mode returns from `oferty-pracy-sz5`, rows 16 and 17 belong in its requirements.
- **Background mode for agent work (row 13)**, until a research is seen to exceed its two-minute steps. If it does, background mode with polling is the documented answer and also removes the lost-connection uncertainty.
- **Streaming, `prompt_cache_key`, `safety_identifier`, rate-limit header tracking, guardrail layers, evals, separate staging project, Usage API reconciliation.** They serve many users, high traffic or a team. One owner with a 100 PLN monthly budget gets nothing from them now; comparing the panel's monthly total with OpenAI's dashboard by eye covers reconciliation.
- **Flex processing.** It is being retired.

## 6. Open questions and what could not be verified

1. **Is the discounted background window a better replacement for batch than full price?** sq2 gives up 50% to avoid the batch cycle. A background request with the `8h` window costs 40% less than Standard, needs no files and no partial-result handling, only create and poll, but it is a public beta and assessments would return within hours, not minutes. This is a product question for the owner (speed against cost), not a finding.
2. Whether cache writes are billed on our requests without opting in. The prompt caching guide says caching is on by default and describes implicit breakpoints, but does not name `gpt-6-luna`.
3. Whether the long-context rate applies to the whole request once the input passes 272,000 tokens. The pricing page lists the two rates; the rule for a request that crosses the line was not read.
4. Whether a request abandoned by a client time limit is still completed and billed. No official statement exists.
5. Whether `web_search_call` items with the actions `open_page` and `find_in_page` are billed as calls.
6. Whether `text.format` with a JSON schema is officially supported together with `web_search` in one call. The documentation is silent; only community reports exist.
7. Whether dated snapshots exist for the GPT-6 family.
8. Current behaviour when the Batch queued-token limit is exceeded, and whether `web_search` is still refused in Batch. Both are known from community reports of 2025 only.
9. Whether an OpenAI project spend limit is set for this installation; that lives outside the repository.
10. How often `incomplete` ends and near-cap usage have occurred so far. The data is in the installation's database, which this investigation did not read.
11. Community evidence comes almost only from the OpenAI developer forum. GitHub issues were sampled; Hacker News, Reddit and Stack Overflow yielded nothing citable. Threads marked "(snippet)" were not opened.
12. The published npm versions of the two SDKs (read from the repositories' main branches).
13. The Usage and Responses reference pages were read only in part because of their size; field facts were taken from the SDK's types.

## 7. Sources

All accessed 2026-11-21.

**OpenAI documentation**

- Migrate to the Responses API — https://developers.openai.com/api/docs/guides/migrate-to-responses
- Structured outputs — https://developers.openai.com/api/docs/guides/structured-outputs
- Reasoning — https://developers.openai.com/api/docs/guides/reasoning
- Background mode — https://developers.openai.com/api/docs/guides/background
- Flex processing — https://developers.openai.com/api/docs/guides/flex-processing
- Prompt caching — https://developers.openai.com/api/docs/guides/prompt-caching
- Batch — https://developers.openai.com/api/docs/guides/batch
- Batch reference — https://developers.openai.com/api/reference/resources/batches
- Files, create — https://developers.openai.com/api/reference/resources/files/methods/create
- Webhooks — https://developers.openai.com/api/docs/guides/webhooks
- Web search — https://developers.openai.com/api/docs/guides/tools-web-search
- Agents — https://developers.openai.com/api/docs/guides/agents
- Safety in building agents — https://developers.openai.com/api/docs/guides/agent-builder-safety
- Error codes — https://developers.openai.com/api/docs/guides/error-codes
- Rate limits — https://developers.openai.com/api/docs/guides/rate-limits
- Spend limits — https://developers.openai.com/api/docs/guides/spend-limits
- Production best practices — https://developers.openai.com/api/docs/guides/production-best-practices
- Safety best practices — https://developers.openai.com/api/docs/guides/safety-best-practices
- Data controls — https://developers.openai.com/api/docs/guides/your-data
- Latency optimization — https://developers.openai.com/api/docs/guides/latency-optimization
- Cost optimization — https://developers.openai.com/api/docs/guides/cost-optimization
- API overview (request identifiers, backward compatibility) — https://developers.openai.com/api/reference/overview
- Usage (admin) reference — https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage
- Deprecations — https://developers.openai.com/api/docs/deprecations
- Pricing — https://developers.openai.com/api/docs/pricing
- Batch API FAQ — https://help.openai.com/en/articles/9197833-batch-api-faq
- Cookbook, batch processing (archived) — https://developers.openai.com/cookbook/examples/batch_processing
- A practical guide to building agents — https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/

**SDK source**

- openai-node README — https://raw.githubusercontent.com/openai/openai-node/master/README.md
- openai-node client — https://raw.githubusercontent.com/openai/openai-node/master/src/client.ts
- openai-node Responses types — https://raw.githubusercontent.com/openai/openai-node/master/src/resources/responses/responses.ts
- openai-node ResponsesParser — https://raw.githubusercontent.com/openai/openai-node/master/src/lib/ResponsesParser.ts
- openai-node webhook signature — https://github.com/openai/openai-node/blob/master/src/lib/webhook-signature.ts
- openai-agents-js repository and guides — https://github.com/openai/openai-agents-js , https://openai.github.io/openai-agents-js/guides/running-agents/ , https://openai.github.io/openai-agents-js/guides/tracing/ , https://raw.githubusercontent.com/openai/openai-agents-js/main/docs/src/content/docs/guides/models.mdx

**Secondary**

- Anthropic, Building effective agents — https://www.anthropic.com/engineering/building-effective-agents

**Community (OpenAI developer forum unless noted)**

- Empty output when incomplete on reasoning models — https://community.openai.com/t/responses-api-empty-output-text-no-message-item-when-status-incomplete-due-to-max-output-tokens-reasoning-only-output/1373609
- openai-python issue 2546 (snippet) — https://github.com/openai/openai-python/issues/2546
- Structured outputs newline loop — https://community.openai.com/t/structured-outputs-un-minified/1376747
- Body timeout with Node fetch — https://community.openai.com/t/200-ok-from-v1-responses-but-body-times-out-und-err-body-timeout/1371083
- Background requests stuck (snippet) — https://community.openai.com/t/background-mode-requests-stuck-in-queued-forever-responses-api/1364478
- Idempotency discussion — https://community.openai.com/t/how-are-you-handling-idempotency-with-ai-api-requests/1399903
- Batch degraded, partial expiry — https://community.openai.com/t/batch-api-degraded-since-march-4-stuck-at-0-progress-expiring-after-partial-completion/1375809
- Batch stuck in finalizing — https://community.openai.com/t/batch-stuck-in-finalizing-status-for-over-24-hours/1366062
- Batch counts and status code 0 — https://community.openai.com/t/batch-api-shows-2000-completed-0-failed-but-some-requests-return-status-code-0/1364654
- Batch billing for failed requests — https://community.openai.com/t/batch-api-billing-for-failed-requests-504-timeout/1385608
- Batch charged with zero results — https://community.openai.com/t/batch-api-charged-212-for-gpt-5-4-pro-with-zero-completed-results-billing-bug/1379159
- Web search unsupported in Batch — https://community.openai.com/t/batch-api-is-web-search-supported-for-v1-responses-getting-web-search-unsupported-on-every-line/1361886
- Web search with a schema loses citations — https://community.openai.com/t/web-search-on-responses-api-breaks-inline-citations-when-passed-a-pydantic-data-model-as-text-format/1312488 , https://community.openai.com/t/structured-output-breaks-annotation/1365140
- Input token inflation with web search — https://community.openai.com/t/massive-input-token-inflation-50x-with-o3-web-search/1317167
- Web search billing higher than expected — https://community.openai.com/t/heads-up-web-search-tool-billing-can-be-higher-than-you-expect-here-s-why/1236954
- Hallucinated links — https://community.openai.com/t/hallucinated-http-links-in-responses-api/1371940
- Incomplete with web search at 8,000 tokens (snippet) — https://community.openai.com/t/gpt-5-mini-returns-incomplete-response-when-using-web-search-preview-due-to-max-output-tokens-limit/1359180
