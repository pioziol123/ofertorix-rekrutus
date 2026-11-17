# Browsing offers and companies — solution design

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **current list slice implemented; the other modules are a draft**, 2026-10-31. Rationale: [this feature's requirements](requirements.md) → [PRD](../../PRD.md). Coverage: R-20/AC-20, R-21/AC-21.

## Boundaries and decisions

The confirmed choices D-01–D-06 and the proposed D-07–D-08 are maintained in the [shared architecture](../../architecture.md). The other mechanisms in this file are **SD proposals**, not approved owner's decisions. Entity and command names describe the plan, not existing code. The shared semantics of null, versions and commands apply by reference, not by copy.

## Views and navigation

SD proposal: pages `/offers`, `/offers/:id`, `/companies`, `/companies/:id`, `/profile`, `/operations`. The details panel in the table can have the offer's URL and allow direct entry. On a smaller screen it turns into a details view. Nuxt UI provides the components, but we do not copy the mock-up's code as production code.

## Reading, filters and sorting

SD proposal: the lists use server queries with pagination, stable sorting and an extra id key on a tie. The filters and the offer selection are represented in the URL, so that going back from the details keeps the context. They do not save profile preferences or the import scope. Technology filters perform explicit any/all/excluded with a required/optional distinction; missing data is visible separately and has an agreed behaviour for the specific filter.

The table shows the rating, completeness, freshness and own decision separately. The company profile takes technologies with their scope, not a flat sum assigned to every position. Qualification against the pay minimum is set by the [matching SD](../dopasowanie/solution-design.md#pay-comparison); the UI does not hide it behind an unagreed conversion of currencies/net/gross.

Mutations in the panels call commands of the offers, recruitments and research modules. This module is not a second owner of those rules or a copy of their write models.


## Integration with other features

[offers](../oferty/requirements.md), [companies-research](../firmy-research/requirements.md), [matching](../dopasowanie/requirements.md), [recruitments](../rekrutacje/requirements.md). Execution status, reservations and retries are provided by the [operations contract](../operacje/solution-design.md); private access and durable launch are set by [launch](../uruchomienie/solution-design.md). These dependencies are contracts, not a list of the order of implementation tickets.

## Feature verification

Go offer → company → another offer and come back with filters. Check all R-21 dimensions, any/all/excluded, sorting with ties, rejected/expired/unknown and the separate rating/completeness/decision. Coverage includes all R/ACs listed at the start of the document. [Integration acceptance](../odbior/solution-design.md) checks how the modules work together; it does not replace their criteria. No product tests have been run yet.

## Open decisions and readiness

O-02 — [register and consequences](../../open-decisions.md). Before marking this pair as ready, settle the contracts that concern it and review conformance with the requirements. Creating the documents alone does not approve the proposals.

## Implementation of the current list slice — 2026-10-31

`/offers` with a URL query and a details panel, without login (the owner's latest decision). `/api/offers` returns paginated projections of the current source_ads/revisions, filter options and metadata of the last import. `/api/offers/:id` returns the current details and the revision dates, without old payloads. Data normalisation keeps null; the HTML description is converted to text (no v-html). The source link only https/http and rel noopener/noreferrer. The company is still the source's label.

The `lib/offers.ts` module is the shared contract for projection and filtering. With one person and one source it reads the projections from the database, filters and sorts stably on the server side, then paginates. It does not send the whole catalogue/payloads to the client. A safety limit of 10000 records requires later replacing the filtering with an SQL query before the volume grows. We do not add an ORM. Query parameters are validated; invalid values give 400. Details for a missing UUID give 404.

Access: no accounts and sessions, in line with the owner's decision of 2026-10-31. Compose still publishes only 127.0.0.1; on a VPS the SSH tunnel remains. The trial implementation of login was removed before the feature was handed over. Health and the domain API do not require a session.

Verification: a tester of the read/filtering module and real PostgreSQL; HTTP without login, a safe description and URL; a visual review of the table/panel on desktop and phone; regression of the importer/setup, lint/types/build. We do not consider R-20/R-21 parts that depend on future ratings, companies or processes as completed.

### Verification result of the current slice

2026-10-31: the full set of 54 tests passes (adapter/importer, projection/filters, PostgreSQL read in an isolated schema, HTTP without login, setup and worker); lint/typecheck and build are correct. The tester added the initial unit tests; after its work was interrupted by the service limit, the main agent added the discrepancy cases and the database/HTTP integration. In the browser the following were checked: 31 offers, opening the panel, refreshing while keeping the selection, and an empty result. In a narrow view the panel places the details above the table, and the table scrolls internally. A full automated browser E2E test suite is not part of this stage.

An unknown technology level is not marked as required: a separate section without a specified role. A source marked remote+hybrid at the same time shows both values with a discrepancy note and matches both filters. No login replaces the earlier session design; the historical session migration that was applied is kept, and a later migration removes the unused table.

### Form correction — 2026-11-01

The pay filter switch separates the kept draft of the fields from the active conditions. Turned-off fields are disabled and skipped by offerFilterQuery; hasSalaryFilter restores the state from the URL, ignoring the old default includeUnknownSalary=true without other pay conditions. Server-side validation of the minimum against currency/period remains. The regression covers unchanged other filters and the kept pay draft after turning it off.
