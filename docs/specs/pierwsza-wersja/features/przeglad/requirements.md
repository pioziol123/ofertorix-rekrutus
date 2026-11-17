# Browsing offers and companies — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **current list slice implemented; the rest is a draft**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-20, R-21 and their ACs. Related: [offers](../oferty/requirements.md), [companies-research](../firmy-research/requirements.md), [matching](../dopasowanie/requirements.md), [recruitments](../rekrutacje/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

## Current stage after the importer — 2026-10-31

The owner's confirmed order: setup → fetching → list. Now a table of source ads and a panel of current details, without rating, research, companies and recruitments. The full R-20/R-21 below remain the target scope, not a statement that all modules are implemented.

ACs of the current slice:

- The list presents the title, the company from the source, technologies, the salary range with currency/period/contract, location/mode and availability; missing data shows "Brak danych" ("No data").
- Opening an offer shows the current description, required and optional technologies, conditions, the source link, the read/publication/expiry dates and the history of change dates. Past content is not displayed. We do not yet create logical offer links or a company profile.
- Search by title/company/technology, and filters: technology any/all/excluded (required/optional/all), location, work mode, contract, working hours, seniority, availability and offers without a salary range. Sort: newest/oldest detection, publication, title and company, with id on a tie. Pagination of 20 entries. Explicit condition filters select known matching values; a missing field does not match the indicated value. This does not change the import rule that keeps unknowns. The pay exception is described below. Changing the filters returns to page 1.
- The pay minimum checks the upper bound of at least one variant (partial coverage has a message), only when a currency and period are given, optionally a contract. We do not convert gross/net, currencies or periods. An unknown upper bound stays uncertain and visible when including unknown pay is turned on (on by default).
- The filters, page, sort and selected offer are in the URL. Going back and refreshing keep the context. No results, an error and loading have clear states; an empty result does not clear the filters.
- The owner's decision of 2026-10-31: no login; UI and API available locally through loopback. The view also works on a small screen; the source description does not execute HTML/scripts.

### R-20 — offer and company views

The offer table with a details panel (A) and the company view (C) are the UI direction. Offer details cover conditions, sources/discrepancies, assessment, the own decision, recruitment, research and history. The company profile shows its information, reports, general and per-offer technologies and related offers.

**AC-20:** going offer → company → another offer keeps the right links. The list also allows browsing rejected, expired and archived offers; archiving is separate from availability at the source and from the recruitment stage. Unknowns and stale assessments are visible. An offer whose match is based on one of the conflicting variants has a discrepancy marker on the list; the details show the variants, their sources and the basis for considering the requirement met. A stage board B is not required. The prototype is directional material, not a complete set of production screens.

### R-21 — filtering and sorting

Available dimensions: technologies (any/all/excluded, required/optional), salary range with currency/period/basis, location and availability from Poland, contract, hours, seniority, mode and office days, specialisation, language, time zones/overlapping hours/on-call duty, company/project type/industry, publication/first detection/availability, rating/components/completeness, decision, stage, research state, company, source and own tags. The list can be sorted at least by rating, completeness and the date of first detection.

**AC-21:** for control offers, filter combinations and the any/all/excluded rules work; optional requirements are distinguishable. UoP gross is not compared with B2B net, nor amounts of different periods/currencies, without an explanation. The owner can turn offers without a salary range on/off in the view; this is not a default rejection rule during import. When qualifying pay we also show partial coverage of the expected minimum in line with [R-13](../dopasowanie/requirements.md#r-13--rating-and-completeness), without suggesting the amount is guaranteed. The exact semantics of manually set range filters remain for technical review; the qualification decision does not mean arbitrary conversion of currencies/bases.

## Open questions

Related: O-02. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.

### Pay filter correction — 2026-11-01

The pay filter is explicitly optional. Turning the switch off skips the minimum, currency, period and the unknown salary range setting, even if the form kept the previous values. The other filters can be applied without a currency and period. When the minimum comparison is turned on, currency and period are still required. Active pay conditions from the URL restore the switch to on.
