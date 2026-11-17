# AI and persistent employer research — service verification

As of: **2026-10-31**, `oferty-pracy-v4t.10`. Scope: a personal local application, possibly a VPS later; storing claims, URLs and limited evidence excerpts for reuse. Official sources read fresh, without keys, paid trials or purchases. A supplement to the [earlier calculation](ai-research-budzet.md), not an audit of all source services.

## Result and recommendation

**Candidate for the first integration: OpenAI Responses API, `gpt-6-luna` and the standard `web_search`.** The documentation confirms the features and the low cost. The terms give a basis for keeping our own Output, but they do not transfer publishers' rights to freely copied texts. The recommendation covers persistent storage of our own write-up and citations; we store an evidence excerpt only when there is an established basis for that specific source. Otherwise `evidence_excerpt = null`, keeping the claim and the link. This is a proposed implementation scope, not an approved choice of provider.

An unconditional right to persistently collect excerpts from the whole internet was not confirmed. If an excerpt for every claim, regardless of the source, becomes a requirement, that condition remains unresolved; the choice of API alone does not remove it.

## What the OpenAI terms establish

The [Services Agreement](https://openai.com/policies/services-agreement/), in force from 1.01.2026, covers the API. Specific provisions:

- **§4.1:** the customer owns the Output as between it and OpenAI, to the extent permitted by law; OpenAI assigns any rights it has in the Output.
- **§3.3(b):** infringing third-party rights is prohibited. **§3.4:** additional Third-Party Services terms may apply.
- **§4.3:** the customer is responsible for the rights to the Input it submits and for the use and evaluation of the Output.

**Design interpretation:** our own synthesis can be treated as Output to be stored and reused, subject to the restrictions above. This is not a transfer of third-party rights to quotes contained in the response. Storing in our own database must also not be equated with response retention on the provider's side.

The [Service Terms](https://openai.com/policies/service-terms/) that were read, updated 16.10.2026, have no separate web search section that establishes a database ban similar to Brave/Google. This is the result of reviewing the indicated text, **not proof of an unlimited licence by omission**. §1(a) requires use of the API in line with the documentation; it also contains exclusions from indemnification, among others concerning rights to Input and Third Party Offering content. Indemnification does not replace rights to the source.

## Citations, evidence and reuse

[OpenAI Docs: web search](https://developers.openai.com/api/docs/guides/tools-web-search) describes `url_citation` with a URL, a title and a link to the text, and a fuller list of visited sources through `include: ["web_search_call.action.sources"]`. When presenting results or the information they contain, citations must be visible and clickable. This also applies to the proposed view of stored research.

**Proposed flow:** we store the `claim`, its kind (fact/opinion/inference/unknown), the specific organisation and scope, the URL, the read date and the run identifier. The list of visited pages is not automatically evidence for every claim. We mark an excerpt from the model's response as a quote only after checking that it matches the source; a summary remains a write-up. We distinguish evidence from a search engine snippet from an excerpt of a page that was actually read.

For excerpts, I propose storing information about the basis for persisting them and their origin. I do not set a universal character limit here: neither short length nor the privacy of the application by itself establishes a licence. A service with consent/a licence for the given use can supply excerpts; where rights are not established, the link and our own synthesis remain, which requires the usual assessment of the material used. Fetching a page directly instead of a search result does not lift that service's terms.

## API compatibility and current cost of the candidate

The [GPT-6 Luna card](https://developers.openai.com/api/docs/models/gpt-6-luna) confirms the Responses API, web search and Structured Outputs. Standard prices per million tokens: **input 0.10 USD, output 0.50 USD**; the Free tier is not supported. Access on a specific account was not checked. The [API price list](https://developers.openai.com/api/docs/pricing) gives **10 USD/1000 web search calls**, plus search context tokens at the model rate. We do not assume a grant or cache/batch discounts.

[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) in Responses uses `text.format` with `type: "json_schema"`, `strict: true` and a supported subset of the schema. A valid schema does not guarantee correct facts. **Proposal:** the first stage gathers research and native citations; the second, without search, maps it to the claim schema. Keep the original citation links, handle refusal/interruption and validate source identifiers. Two stages are not a documented API requirement; they simplify control of evidence and of the cost of JSON repair.

Our own calculation at fresh prices, with the volumes and tokens from the previous report (covering all stages):

| Scenario | Input / output M | Search | USD | PLN with margin |
| --- | --- | --- | --- | --- |
| Small | 2.44 / 0.382 | 72 | 1.155 | **7.51** |
| Medium | 10.68 / 1.714 | 184 | 3.765 | **24.47** |

PLN assumes 5 PLN/USD plus an extra 30%, not a current rate or an invoice. The result fits within 100 PLN under these assumptions; it does not prove actual usage. The application needs a shared AI/search limit and a cap on the number of rounds. A prompt alone is not a hard cost block.

## Comparison: Brave and the earlier Google conflict

The [Brave Search API Terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service), updated 1.09.2026, **§3.2(i)** prohibit persistent storing/caching/databases of Search Results, also in part, except for transient storage needed for operation. The definition in **§1.10** covers all call results, and **§3.2(ii)** restricts derivative works. So we do not assume that AI rewording of a snippet circumvents the terms. §2 allows additional Order Forms.

The [Brave FAQ](https://brave.com/search/api/) allows storage with a plan that includes such rights. The [public price list](https://api-dashboard.search.brave.com/documentation/pricing) shows Search at 5 USD/1000 requests and 5 USD in monthly credits, but does not confirm that storage is granted in that variant. **Conclusion:** Brave remains a fallback once specific terms and a price are obtained; it is not currently a confirmed replacement for a persistent database. Publishers' rights would still be separate.

The [Gemini Additional Terms — Grounding with Google Search, Use Restrictions](https://ai.google.dev/gemini-api/terms#grounding-with-google-search) still restrict caching, analysis and link collection for other purposes. The chat history exception of up to two years serves viewing history, and the individual storage exception excludes automated collection and a database. This upholds the earlier exclusion of this mechanism from the planned employer database, without assessing Gemini's whole offering.

## What remains to be decided

To choose the candidate, a decision on the described conditional scope of excerpts is enough; an open-ended audit of the internet is not needed. A later, separately authorised trial should check account access, organisation recognition, quote accuracy, the cost of all rounds and retries, and quality on Polish offers. Without it, we confirm the documentary and arithmetic basis, not production quality. If mandatory excerpts become a requirement, the permitted sources and the basis for using them must be defined first.
