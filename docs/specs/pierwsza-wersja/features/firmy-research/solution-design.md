# Companies, research and interview preparation — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-15/AC-15, R-16/AC-16, R-17/AC-17, R-18/AC-18, R-19/AC-19.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Data ownership and contracts

| Entity / group | Relevant fields and invariants |
| --- | --- |
| Organization / Brand / Group / PartyLink | Separate entities and relations. The role `publisher/employer/client` on an ad/offer, with evidence. An unrecognised organisation is an explicit state, not a fictitious company. |
| ResearchReport | A typed target organisation/brand (Q11), stage `basic/deep`, version, result/claims, operation id, dates; a separate pointer to the completed current version for each stage. There is no TTL that triggers a request. |
| Claim / Evidence / TechnologyAssertion | Kind, content, organisation/project/offer, sources with URL/title/read date, optional publication date, provenance `page/search_snippet/manual/ad`. An optional quote together with the basis for persisting it. A technology has a scope and required/nice/unknown where it concerns an offer. |
| Preparation | Offer/application/project, the report and profile versions used, topics/priorities/questions/justifications. Separate from the company report and the rating. |

## Reports, identity and evidence

SD proposal: reports in two separate version streams, deduplication of automatic basic research by the typed target organisation/brand. Before a request, check the existing report and the active operation in one transaction. After completion, point to the new report atomically; a failed refresh does not remove the previous one. There is no research TTL scheduler.

Claims keep citations linked to specific content. A list of all visited URLs is information about the run, not an automatic justification of every fact. The UI shows clickable sources next to claims, their dates and the kind of evidence. A source fragment is optional; by default our own synthesis, the URL and metadata. Persist the publisher's content only with an established basis, in line with the service research. Do not turn an uncertain company identification into a confirmed legal profile.

**Confirmed Q11:** an unestablished employer/client does not block research of the available brand or agency; the report keeps that scope and the explicitly unestablished roles. SD proposal: the operation target is a typed reference to an organisation or a brand, without creating a fictitious company. The report, its versions and the reuse key point to exactly this target; we do not share a brand report as a confirmed report of a specific company. When the identity is clarified, we keep the earlier reports and their scope instead of silently changing their subject. The choice and mapping of the research target must be covered in the data model review.

## Interview preparation

SD proposal: PrepareApplication points to the offer/application, the project, the profile version and the basic/deep report versions. The Preparation result stores topic priorities, a technology map, practice questions and questions for the company, with justifications and links to evidence. A new preparation is not a silent refresh of the company research; wider gathering requires an explicit scope.

Manual additions use the shared mechanism for information with provenance. We do not introduce a separate process type for information from a recruiter. Identity and the publisher/employer/client roles are established from evidence; brand data keeps the uncertainty about the legal entity.


## Commands

Logical names, not frozen endpoints. Shared validation/version/response contract: [architecture](../../architecture.md#shared-command-contract).

| Command | Input and effect |
| --- | --- |
| ResearchCompany | A typed identifier of a known organisation or brand, basic/deep, reuse mode or explicit refresh; no silent repetition of a report. |
| PrepareApplication | Offer/application and the indicated report versions, an explicit scope of new gathering. |

## Integration with other features

[matching](../dopasowanie/requirements.md), [offers](../oferty/requirements.md), [operations](../operacje/requirements.md), [recruitments](../rekrutacje/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Two companies with the same name/domain, an agency and an unknown client, concurrent qualification, reuse after a long time and a refresh, a refresh error. Trace the sources of claims and the scope of technologies and the justifications of the preparation. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-03, O-05, O-06 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.

## Stage F1 being implemented — 2026-11-04

A refinement of the mechanism for AC-F1–F5; the report design above remains a draft of later stages. Currently `source_ads` and `source_ad_revisions.payload.company` store the ads and the publisher's name; there is no confirmed company identity.

- Migration 10 adds `companies` (UUID, name, kind organization/brand/unknown, nullable website, description, created_at), `company_ad_links` (ad_id, role publisher/employer/client, company_id, evidence, revision_id; PK ad_id+role), `company_link_history` and `company_commands` (commandId + fingerprint + result). There is no uniqueness by name or domain. No automatic identity backfill.
- Commands: create `{commandId,name,kind,website,description}`; link `{commandId,adId,role,expectedCompanyId,action:link|unlink,evidence}`. UUIDs validated, reason 1–2000 characters, strict input. expectedCompanyId null means no link; conflict 409, a non-existent profile/ad 404, invalid values 422. A link snapshots the current ad version as the source of the decision's context, not as automatic evidence of identity.
- Saving the command, the profile/link and the history is transactional; an advisory lock on the command and the ad serialises retries/changes. The response saved with the command ensures idempotency; an identical commandId with different content gives 409. Unlinking keeps the profile, the ad and the history.
- GET `/api/companies` returns a searchable paginated list (25), GET `/api/companies/:id` the profile, roles, current offers, technologies with evidence per offer, history; GET `/api/offers/:id/companies` the current roles and suggestions of a matching name. No GET creates data. POST goes through the Origin check and the content limit of the existing handlers. External links only http/https without credentials.
- `/companies` list; `/companies/:id` details; a component in the ad details creates/chooses profiles and explicitly links/unlinks roles. The shared navigation leads to companies. The distinction of optional technologies false/true/null is kept.
- Verification: isolated PostgreSQL (duplicate names, all roles, idempotency and conflicts, an ad change, technology sources, history), HTTP rejection of a disallowed Origin and bad input, rendering of the list and details, a UI review without saving fictitious profiles in the owner's database.

### F1 verification — done 2026-11-04

Migration 10 applied locally. `pnpm check`: 347 default tests PASS, types and lint without errors (two earlier attribute order warnings in the assessment editors). PG/HTTP suites: companies 10, offers 4, assessment list 7, assessment revisions 15, single assessments 14 and group assessments 12 PASS (62 tests). A separate tester added regressions for links and diagnostics. Production build PASS. The list, the form on an offer and the details were inspected; creating a company through the UI was done on a separate schema and a temporary server, then removed. No profiles or links were created in the owner's data. F1 does not mean that R-16–R-19, about automatic research and preparation, are implemented.

## Stage F2 being implemented — 2026-11-04

AC-F6–F9: a separate research module, a pg-boss queue, the shared ledger `ai_attempts` with `operation_type=research`. Migration 11 adds operations with a target snapshot, configuration and result, and idempotent commands. A unique target index for active states. An advisory lock on the target serialises reuse/refresh; the command keeps its result. The current report is the last completed operation, the previous ones stay available; no TTL. Recovery resumes only undelivered ones and those waiting for budget, and marks an interrupted attempt as unknown.

Provider: Responses API, `web_search` search and a separate structured-output synthesis. A separate price configuration `AI_RESEARCH_PRICING_JSON`, initially the agreed gpt-6-luna; in addition the adapter supports gpt-4.1-mini for comparison tests. At most three tool calls; search and synthesis each get half of the output limit. The reservation covers tokens and three fees of 0.01 USD. Luna settles the search context from usage, without adding the mini blocks. For mini we cautiously add fixed blocks of 8000 tokens even when usage already includes them; the UI describes the amount as a conservative cost, not an invoice. Lower input reservations: Luna 500000, mini 100000 tokens for two runs and at most three search calls. Missing reliable telemetry keeps the reservation. No automatic retry after a request has started. We do not use Batch: active gathering of sources is a separate operation from bulk offer assessments.

Search returns content with citation annotations. The synthesis receives only paragraphs with citations and their identifiers. The evidence for findings must point to existing identifiers and an exact paragraph fragment. A list of visited URLs is not evidence for a claim. The `page` marker only with open_page telemetry, otherwise `search_snippet`. We do not save full pages or the full search result; we save the synthesis, URLs/titles/dates and the evidence type. External texts and the company profile are treated as data, never instructions. The UI renders text through interpolation, without HTML.

GET/POST `/api/companies/:id/research`; POST `{commandId,refresh:boolean}`. GET is read-only, configuration and the cost limit; POST has the Origin check and the existing content limit. An invalid UUID 404, input 422, command conflict 409, missing configuration 422. UI in the profile: state, start/refresh, the current report, previous versions and errors.

Sources of the adapter contract: [OpenAI Web search](https://developers.openai.com/api/docs/guides/tools-web-search), [pricing](https://developers.openai.com/api/docs/pricing), checked 2026-11-04. Planned verification: the evidence parser and false URLs, idempotency/concurrency, the shared budget, interruption and no automatic retry, versions and keeping the old report, API Origin, UI and a full project check.

### F2 verification — done 2026-11-04

Migration 11 applied locally, the queue created. Tester: 11 unit and 8 PG/API PASS (mock provider); regression of the shared budget/profile/assessments/companies 71 PG/API PASS. `pnpm check`: 357 PASS, types and lint without errors (two earlier warnings). Build PASS. The report and sources were checked visually on a separate schema; the preview and the data were removed.

API trials on public OpenAI data, without a CV: mini rejected one report with an evidence error and completed the next; Luna completed two runs with HTTP 200. The total conservative cost of the completed trials was 0.262205 PLN. One diagnostic process was interrupted with exit 137 without telemetry; it stays unknown with a reservation of 0.415 PLN, recorded in the cost clarification task. No quality trials were run on the owner's specific employers, and no fictitious profiles were created in the public part of the local database. No sources remains an allowed "unknown" result; a connection trial does not prove the research is complete.

F2 means manual basic research is ready; automation after thresholds (`oferty-pracy-363`) and deep preparation (`oferty-pracy-a9b`) remain separate.
