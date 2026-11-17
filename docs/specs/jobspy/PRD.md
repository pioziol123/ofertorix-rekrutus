# JobSpy fork for the personal job offer system — PRD

Status: **accepted for implementation in stages**, 2026-11-02. The owner instructed us to implement following the existing flow and to raise doubts. The open conditions for running the sources remain open. Fork: [pioziol123/JobSpy](https://github.com/pioziol123/JobSpy). Progress: `bd show oferty-pracy-y81`.

## Context and sources

The owner wants to use their own fork of [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) to extend the offer sources in the personal system. This PRD develops the proposed changes discussed after the [repository analysis](../../research/jobspy.md). The analysis of 2026-11-02 covered the README and the code of the `main` branch, without attempts to fetch offers live; no specific SHA and no working state of the adapters was confirmed.

This is a separate initiative to develop integrations. It does not change the acceptance criteria of the [first version of the application](../pierwsza-wersja/PRD.md), which is based on SOLID.Jobs, and it does not require rebuilding the working importer. The order relative to other work on the application requires an owner's decision.

**Confirmed in conversation:** the system is personal and runs locally or on the owner's own VPS; the current search scope is senior-level PHP. After the PRD was prepared, the owner ordered it implemented in stages. Current order: Indeed last; before that, connecting the other adapters with the market and access limitations stated explicitly. This does not settle the open conditions of access to the sources.

## Problem and audience

The owner wants to obtain additional offers without writing all the scrapers themselves. JobSpy offers ready-made adapters, but their common output does not carry enough information about the quality and limitations of fetching. For example, a salary estimate may look like an employer's salary range, and a run with skipped records or without descriptions may look like it completed correctly. These are observations of the code described in the analysis, not results of production measurements.

Without this information the application could filter offers wrongly, suggest that the set is complete, or treat unobserved ads as expired. On the other hand, an overly extended fork makes it harder to take in adapter fixes from the JobSpy authors.

The direct audience of the changes is the fetch integration in our application and the person who maintains it. The end user of the data remains the single owner. We are not building a public aggregator or a service for other users.

## Expected outcomes

- The owner receives additional offers with a known source and visible data gaps.
- The owner can distinguish a salary given by the employer, one estimated by the portal, and one of undetermined origin.
- The owner understands whether reading a fixed query completed, was limited by a cap, was interrupted, or was done with gaps. Completing a query is not a promise of fetching the whole market or all of the portal's offers.
- The integration maintainer can determine why data is missing and safely resume fetching.
- Further JobSpy updates can be assessed before deployment, and a faulty version can be rolled back without losing offers already saved.

The evidence of usefulness will be a controlled import from Indeed Poland for the senior PHP scope, a review of the quality of the data obtained, and a comparison with the existing SOLID.Jobs set. The trial report should show additional offers, duplicates, scope accuracy, missing descriptions and salaries, the origin of amounts, and fetch errors. No minimum number of new offers, completeness percentage or time saving has been set. These measurements are meant to help decide whether to continue, not to serve as an unagreed promise.

## Scope of the proposed first version

### 1. Origin and meaning of the salary

The output makes it possible to tell an employer's amount from a portal's estimate and from an unknown origin. It keeps the currency, the period and the available context that justifies the classification. When the portal provides both values, the integration does not lose the information about their different nature.

Missing data about gross/net, VAT or contract type remains an unknown. The `contract` type is not automatically interpreted as B2B. A converted amount does not replace the source value. The first version does not promise correct extraction of arbitrary Polish salary ranges from the text of every portal.

### 2. Quality and outcome of fetching

The data passed to the application includes the read outcome for each selected source and query, the reason it ended, and known limitations. An empty correct read is distinguishable from a block, an error or an unrecognised response.

Skipped ads, failed detail fetches and filters the source did not apply are visible. A missing description does not lead to pretending the record is complete. If the exact number of skipped results is unknown, the output communicates this uncertainty.

The absence of an ad in a limited search is not evidence of expiry. The fork provides information about the run; decisions about the state of a saved offer stay with the application.

### 3. Data intended for integration

The application receives offers and run information in a documented, versioned JSON format. Data structures, missing values, source identifiers and offer URLs are preserved; lists are not reduced to comma-separated text only.

The output names the source, the search scope used, the fetch time and the fork version. It makes it possible to reconstruct where a saved record came from and why its data was considered incomplete. Data processed by JobSpy is not presented as the portal's original response. Diagnostics do not pollute the offer export.

The specific schema, the way of running and the mapping to the database will be defined before implementing the given feature.

### 4. Controlled fetching and retries

The source, the query scope and the work limits can be selected explicitly. Fetching has a bounded time and number of retries; it does not continue endlessly after a block or a change in page format. Recognised rate limits are respected, and the waiting or stopped state is passed to the application.

A transient error can be retried without manually rerunning the whole process. An error that requires a parser change does not trigger an unbounded series of identical requests. The detailed limit policy depends on the source and must be checked before that source is enabled. A repeated execution must not create duplicates of the same observation in the application; responsibility for saving stays with its importer.

### 5. Maintaining the fork

The changes mainly cover information lost by the current export, diagnostics and fetch control. We avoid rebuilding adapters in ways unrelated to these goals. Every version in use can be tied to a JobSpy base version and to the set of our changes.

Updates of the original project are assessed before deployment. Samples of portal responses make it possible to detect parser regressions without making requests during the usual checking of changes. The set also includes empty, erroneous and incomplete responses and both kinds of salary. Test materials contain no secrets and no unnecessary personal data. Tests on saved samples alone do not confirm that the portal currently works.

## Responsibility boundary

| JobSpy fork | Job offer application |
| --- | --- |
| Fetching and reading information from portals | Scheduling, plus ordering and presenting operations |
| Source identifiers and links | Durable storage, revisions and history |
| Field origin, gaps and source limitations | Senior PHP qualification and communicating unknowns |
| Query outcome, errors and request control | Merging duplicates across portals and offer state |
| Versioned export | Profile, matching, rating, research and recruitments |

The fork does not need a CV, a private profile or recruitment history. It receives only the parameters needed to search for offers. We do not make its logic depend on the owner's personal preferences.

## Typical flows

**New source.** The owner runs an import of a fixed scope from Indeed Poland. The application saves the source observations and checks the senior PHP qualification. A match of the search phrase alone does not confirm the technology or seniority; missing information stays explicit according to the application's rules.

**Estimate instead of a salary range.** The offer contains an amount estimated by the portal. That information reaches the application together with the amount. It is not presented as the employer's declaration, nor used unconditionally as confirmation that the financial minimum is met. The rules for filtering such values need a separate clarification on the application side.

**Partial read.** The portal blocks requests after part of the results has been fetched. The fetched records stay available, and the output shows the interrupted read and its reason. The application does not mark unseen ads as expired on that basis alone.

**Missing details.** The offer card is available, but fetching the description fails. The offer may be passed on with the gaps marked; the integration maintainer sees what can be retried. Full availability of the data is not communicated.

**JobSpy update.** The maintainer checks the effect of the new version on the export and parsers in use. In case of a regression, they stay on the previous version or return to it. The application's saved data stays available.

## Constraints and exclusions

- Indeed has been postponed to the end. The other adapters are connected separately; the current scope remains Senior PHP in Poland.
- We do not promise full coverage of the portal or the job market. Remote work and location do not equal a confirmed possibility of employing a person from Poland.
- We keep the information required by the JobSpy licence. The conditions of access to the portals need a separate check before a live trial and regular use; the repository analysis does not settle them.
- In this initiative we do not add paid services or buy proxies. A need for such spending requires a separate owner's decision; the existing AI budget is not default consent to these costs.
- Out of scope: automatic applying, logging in to portal accounts, CAPTCHA handling, public publishing of offers, and adding Polish portals absent from the original project.
- We do not develop MCP, a user panel or a database of its own inside the fork. We do not move assessment, research or recruitment management into it.
- We do not rewrite the library in TypeScript. The choice of process boundary and distribution method remains a technical decision.

## Proposed stages

1. **Feasibility confirmation:** choosing a specific base version, checking access to Indeed Poland, deciding how to maintain the fork, and a controlled trial. The result may justify dropping the source before further work.
2. **First useful version of the fork:** Indeed with salary origin, run quality information, a versioned export and request control. Also verified on saved samples.
3. **Integration into the application and value assessment:** saving offers while keeping the existing history rules, and reviewing the additional results. The application adapter is integration work, not an extension of the fork's domain.
4. **Possibly LinkedIn:** a separate assessment of cost-effectiveness, access and data gaps; with no automatic commitment to extend to the other portals.

## Unknowns and conditions for further work

| Question | What it blocks / next step |
| --- | --- |
| Live access to Indeed as the first source | Implementation direction accepted 2026-11-02; enabling it still requires settling the access conditions. |
| Terms and actual availability of fetching | Enabling the source; check the terms and run a limited trial. |
| Account, location and base version of the fork | Creating the repository and reproducible releases; decide before it is created. |
| Acceptable rate, time and retries | Regular fetching; determine from the source's limits and the trial. |
| Sufficient quality and number of additional offers | Decision on further maintenance; assess the trial results, without a threshold invented in advance. |
| Effect of salary estimates on application filters | Including such amounts in the financial qualification; set a separate rule, keeping the origin in the fork. |

This document sets the accepted direction of work; it is not a complete implementation specification. One PRD corresponds to many requirements/solution-design pairs, e.g. for salary data, run quality, export and fetch control. We refine a chosen pair only before implementing the given feature.

The first chosen pair: [salary origin — requirements](features/pochodzenie-placy/requirements.md) and [solution-design](features/pochodzenie-placy/solution-design.md). Organisation of local work and the block on enabling the source: [local-development](local-development.md).

Further features being implemented: [run contract — requirements](features/kontrakt-przebiegu/requirements.md), [solution-design](features/kontrakt-przebiegu/solution-design.md) and [request control — requirements](features/kontrola-zadan/requirements.md), [solution-design](features/kontrola-zadan/solution-design.md).

Order decision of 2026-11-02: we implement the Indeed HTML scraper last. Before that we verify the package, publish the fork changes (commit/push approved separately and explicitly) and prepare [application integration — requirements](features/integracja-aplikacji/requirements.md), [solution-design](features/integracja-aplikacji/solution-design.md). The offline integration is independent of settling live access and stays disabled by default; the pilot and consent to the data scope are still open.

Extension ordered by the owner: [other sources — requirements](features/pozostale-zrodla/requirements.md), [solution-design](features/pozostale-zrodla/solution-design.md). The catalogue covers all adapters; a technical connection does not mean a confirmed live import.

Decision of 2026-11-02: we allow fully remote foreign offers; the portal's country does not exclude working from Poland. The [requirements](features/zdalne-zagraniczne/requirements.md) and [SD](features/zdalne-zagraniczne/solution-design.md) replace the previous country block in this respect.

Update of 2026-11-02: the owner confirmed LinkedIn's and Indeed's consent to scraping at up to one query/s. [Request control](features/kontrola-zadan/requirements.md#confirmed-consent-and-limit--2026-11-02) covers all HTTP attempts together. LinkedIn moves to a manual pilot; Indeed HTML stays last, and the existing GraphQL adapter is disabled. Earlier mentions of no consent are historical.

Last stage being implemented: [Indeed HTML scraper — requirements](features/scraper-html-indeed/requirements.md), [SD](features/scraper-html-indeed/solution-design.md). A separate HTML function keeps the contract and does not replace the public GraphQL adapter in the library; the application selects HTML. Trial of 2026-11-02: HTTP 403, the source stays disabled.
