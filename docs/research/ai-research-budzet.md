# AI and research within a limit of 100 PLN a month

Sources as of: **2026-10-30**. Research for `oferty-pracy-v4t.2`, based on official documentation. No paid calls, purchases or secrets were used. This is material for a decision. It is not a choice of provider and not an approved assessment contract. The reference point is the [product decisions](../product/ustalenia.md).

## Conclusion

**The described scenarios of small and medium offer inflow fit arithmetically within 100 PLN a month**, given the assumed tokens, prices and number of searches, and excluding unknown surcharges for storage rights. This is a conditional cost calculation, not yet a confirmation of production feasibility: account access, the cost of the required rights and the quality of results were not checked. It does not prove the quality of matching or the completeness of research. The unknowns include the quality of extraction from Polish ads, the number of retries, tool tokens and the rights to persist results. No search API is treated here as a full search of the internet or as a guarantee that the information found is true.

OpenAI with its own search, OpenAI with Brave, and Gemini with Brave are suitable for comparison. Google Search Grounding has restrictions that conflict with a persistent company research database. The Brave variants need confirmation of storage rights in a specific plan. No setup is chosen here.

## Three API setups

Prices in USD, standard text processing, without batch/cache discounts and provider taxes. Refresh before connecting the service.

| Setup | Model: USD / 1M input tokens → output | Search | Unknowns |
| --- | --- | --- | --- |
| A. OpenAI Responses API + `web_search` | `gpt-6-luna`: **0.10 → 0.50** | **10 / 1000 search calls**, plus context tokens at the model rate | Rights to persist results unverified; account limits, tokens and evidence quality |
| B. OpenAI Responses API + Brave Search | Same model and prices | **5 / 1000 requests**, published **5 USD credits/month**; context passed to the model paid separately | Two accounts, storage rights, own evidence mapping |
| C. Gemini Developer API + Brave Search | `gemini-3.1-flash-lite`: **0.25 → 1.50**, output includes thinking | Brave as in B | Storage rights, compatibility of schema and tools |

Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Brave Search API](https://brave.com/search/api/). A uses the standard `web_search`, not the preview. The fixed 8000-token block rate for GPT-4.1 mini must not be carried over to Luna.

**A — status of rights verification: it was not verified whether the OpenAI web search terms allow this flow to persistently store and reuse research claims, citation URLs and source excerpts. This is an open restriction, not a confirmed alternative free of storage restrictions; the documentation of the citation feature does not settle these rights.**

A provides URL citation annotations and a list of sources. The documentation distinguishes the paid `search` action from `open_page` and `find_in_page`, which are available to reasoning models. Citations in the interface must be visible and clickable. The Responses search context is limited to 128k tokens. [OpenAI: web search](https://developers.openai.com/api/docs/guides/tools-web-search).

B/C separate search from synthesis. Brave returns URLs and excerpts/content, and the application assigns the evidence. Search has a published limit of 50 queries/s; the separate Answers product has different prices and is not counted. The FAQ makes storing results conditional on a plan with storage rights; the opened page does not confirm the price of these rights here. This is a condition to clarify before a persistent cache, not a granted right to store. [Brave: plans and FAQ](https://brave.com/search/api/), [API terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service).

Pages can be read by the application or, in C, by URL Context. URL Context handles up to 20 given URLs per request, does not follow subpages automatically and does not handle paywalls or logins. The fetched content is paid model input. We do not assume an expensive JavaScript renderer or bypassing blocks; the rights of the pages remain a separate condition. [Google: URL Context](https://ai.google.dev/gemini-api/docs/url-context).

### Why not base the company database on Google Search Grounding

Technically, Grounding returns citations, queries and suggestions. For Gemini 3+ it includes 5000 queries/month at no extra charge, then 14 USD/1000, with a default limit of 1500/day/project. One response can generate many queries. [Google: Grounding](https://ai.google.dev/gemini-api/docs/google-search).

The terms restrict caching, analysis, automated link collection and building a database. The chat history exception does not give a general right to reuse company research. Requirements for displaying results and suggestions also apply. **Design conclusion: Grounding is not an approved backend for a persistent company database** until the compliance of the specific flow is resolved. This is an identified conflict of requirements, not a full legal opinion. [Google: Additional Terms, Grounding with Google Search](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).

## Flow and data contract — proposal

1. **Extraction:** map fields available in the API/RSS in code; use the model for the description. A field has a value or `null`, a source and an evidence excerpt. Separately: required/optional technologies, currency/period/basis of pay, and company roles.
2. **Triage:** the profile without CV contact details, the offer and explicit criteria. Result: an assessment of 0–100, components, justification, strengths, gaps and unknowns. A new profile/prompt creates a new assessment; the owner's decision stays separate.
3. **Basic research:** after qualification, a limited set of sources on the business, products, project, conditions and technologies. Share a company result only with correct identification, freshness and appropriate rights. Do not carry a client's technologies over to an intermediary, or another project over to the offer.
4. **Deep research:** on request, combine the offer, a known team/project, recruiter information and sources. Result: company/project, a technology map with scope, review priorities, practice questions and questions for the company, each justified by a requirement or evidence. The questions are proposals, not a known set from a real interview.

Proposed claim unit: `claim_id`, `text`, `kind` (`fact`/`opinion`/`inference`/`unknown`), `subject`, `scope`, `source_ids`, `evidence_excerpt`, `published_at?`, `retrieved_at`, `conflicts[]`. A source has a stable identifier, URL, title, read date and — where allowed — an excerpt or content hash. Distinguish a full page from a bare search engine snippet. Employee opinions remain opinions; the absence of results does not prove the absence of problems.

OpenAI and Gemini support structured output based on a subset of JSON Schema. **A schema guarantees neither truth nor completeness.** Handle refusal, interruption, semantic error and unknown. Google describes combined use of a schema with tools as preview; the alternative is separate stages for gathering evidence and for JSON, paying for both. The application checks that source identifiers exist, the assessment range, and that the excerpt matches the evidence. [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Google: Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output).

### Two rating options, undecided

- **Model-based:** AI proposes the components and the total; code controls the scale and explicit weights. Consistent with "AI proposes the assessment", needs calibration and may change between runs.
- **Deterministic sum of AI components:** the model proposes match levels with evidence, code computes the total from the weights. Makes it easier to reproduce and to change weights without another call. Normalisation and handling of unknowns need a decision. A purely rule-based rating replacing the AI recommendation would mean a change of requirements.

Data completeness stays separate. Weights, the automatic research threshold and summing with gaps are not decided.

## Monthly scenarios

**Assumption, not the NBP rate: effective 1 USD = 5.00 PLN**, meant to cover currency conversion and possible settlement surcharges. It is not a verified rate or a calculation of a specific invoice. A higher actual effective cost requires lowering the USD limit. The VPS stays outside the AI + search budget.

A month has 30 days. We count new/changed offers after deduplication. These are volume proposals, not a measured inflow from a portal.

| Package | Total input / output per unit | Search | Scope |
| --- | --- | --- | --- |
| Offer | 6000 / 1000 tokens | 0 | Extraction and triage together |
| Basic research of a new company | 20 000 / 2500 | 2 | Sources, synthesis and a possible separate JSON |
| Deep preparation | 60 000 / 8000 | 8 | All runs and additional sources |

Input includes all paid tool context, prompts, sources and responses passed again. Output includes paid reasoning. This is a hypothesis to measure, not a limit imposed by the provider; do not count the same tool tokens twice.

| Volume | Offers | Basic | Deep | Input / output | Search |
| --- | --- | --- | --- | --- | --- |
| Small | 10/day = 300/month | 20/month | 4/month | 2.44M / 0.382M | 72 |
| Medium | 50/day = 1500/month | 60/month | 8/month | 10.68M / 1.714M | 184 |

Formula: `USD = wejście_mln × cena_wejścia + wyjście_mln × cena_wyjścia + search` (input in millions × input price + output in millions × output price + search). The PLN figures below include an extra **30% scenario margin** for retries and tokens. This is not a guaranteed cost limit per request.

| Setup | Small: USD without margin | Small: PLN with 30% | Medium: USD without margin | Medium: PLN with 30% |
| --- | --- | --- | --- | --- |
| A | 0.435 + 0.720 = **1.155** | **7.51** | 1.925 + 1.840 = **3.765** | **24.47** |
| B, before credits | 0.435 + 0.360 = **0.795** | **5.17** | 1.925 + 0.920 = **2.845** | **18.49** |
| C, before credits | 1.183 + 0.360 = **1.543** | **10.03** | 5.241 + 0.920 = **6.161** | **40.05** |

Prices come from the price lists above; the rest is our own arithmetic. With the 5 USD of Brave credits actually available, search fits within the grant: B comes to **2.83 / 12.51 PLN**, C to **7.69 / 34.07 PLN**. Not counted: an unknown surcharge for storage rights, paid page fetching and other uses of the same account.

Sensitivity: medium A at four times the cost of the whole package is **97.89 PLN** with margin; medium C at three times the cost is **120.14 PLN**, over the limit. Re-assessing 1500 offers is a separate batch: conservatively 1.65 USD in B when repeating the whole offer package, about **10.73 PLN** with margin. Unconstrained research loops and long pages can exhaust the budget even with a small number of offers.

## Settlement and stopping — proposal

OpenAI reports `usage.input_tokens`, `output_tokens` and details; Gemini reports usage, including thinking. Conversation history consumes input again. Keep the metrics and the response identifier; field names depend on the chosen API/SDK. [OpenAI: usage example](https://developers.openai.com/api/docs/guides/structured-outputs), [Google: tokens](https://ai.google.dev/gemini-api/docs/tokens).

The operation log should link the offer/company to the stage, attempt, provider/model, price list version, input/cache/output/reasoning tokens, number of searches, USD/PLN cost, conversion rate and reservation. Keep credits separate from usage at list prices.

Proposed rules:

1. Before a request, atomically reserve the cost of the upper bound of input, output and tools, also for parallel tasks.
2. Limit source size, output and rounds; run tools in controlled portions. A prompt saying "at most 2 searches" does not by itself guarantee the limit.
3. After the response, settle usage and release the difference. A timeout after the request was accepted has an unknown cost: keep the reservation until clarified, do not record zero.
4. JSON repair, retry and fallback have a separate cost/reservation. Proposal: at most one automatic retry, then "needs checking". Do not repeat the whole research because of the final format.
5. When funds run out, pause the paid queue until the budget is increased/renewed; free fetching and database reads continue. The provider's dashboard does not replace the shared AI + search limit.

Reservation amounts and retry rules are not approved. The 30% margin from the table does not prove that an arbitrary request will not exceed its reservation.

## Subscriptions and the next decision

An app subscription is not automatically a balance for an arbitrary API organisation. Current OpenAI documentation describes a conditional API benefit for eligible Pro/Business users, requiring activation and linking an organisation, with expiring credits. We do not assume the owner's plan or activation; the calculation does not use these grants. [OpenAI: API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits).

Before choosing, an authorised measurement is needed later: a few dozen varied offers from Poland, several companies with ambiguous names and two interview preparations. Compare extraction errors, the owner's assessments, evidence coverage, unknowns and the total cost including retries. No such test was run here; feature documentation does not prove model quality.

Still to decide: the provider and plan rights, the model/API version, the research threshold, the rating method, the validity of company data, hard operation limits and the unknown cost after a timeout. A price list does not confirm availability on a specific account. For Luna, the model card provides no free tier; access and throughput depend on the organisation's tier. We do not assume a free account for recurring work. [OpenAI: model limits](https://developers.openai.com/api/docs/models/gpt-6-luna). The result is conditional feasibility, not an approved architecture.
