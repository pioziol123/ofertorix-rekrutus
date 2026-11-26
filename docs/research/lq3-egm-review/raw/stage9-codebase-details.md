# Stage 9: codebase details review

Scope: `docs/specs/lq3-lista-aplikacji/solution-design.md` (SD) and `docs/research/lq3-egm-review/tickets-export.md` (tickets), checked against `main` (f0c258f). Standard: implementation-readiness. The Recruitments module, its tables, routes and pages are proposed, so their absence is not a finding. Only claims about current code and the Zero-Decision / file-boundary rules are judged.

Counts: Blocker 0, Major 3, Nit 6.

## Verified as accurate (no finding)
- Shared transaction: `lib/db.ts` `transaction()` joins a running one; `db()` gives the executor (SD "Operations and contracts").
- Migrations: node-pg-migrate 9.0.0, raw SQL `.cjs`, forward-only `down` that throws, `text` + `CHECK` enums, UUID `PRIMARY KEY` without a default (ids made with `randomUUID` in app code, e.g. `modules/companies/request-research.ts:80`), `timestamptz`.
- Companies precedent for a stored command result: `company_commands` (`migrations/1770000000010_companies.cjs`); error classes `CompanyConflict` / `CompanyNotFound` in `modules/companies/errors.ts`; 409/404 mapping in `server/utils/companies.ts`; 422 for invalid input in `apiHandler` (`server/utils/http.ts`).
- 10 000-ad limit exists (`modules/sources/read-source-ads.ts:16`, `modules/offers/README.md:19`); `readCurrentAds(ids)` already takes IDs and skips unknown ones, so "Offers by IDs" can build on it.
- Module list in `tests/module-boundaries.test.ts:7-14` is explicit (six modules); `docs/architecture/moduly.md` is the module map; `lib/time` exists (nq3.6 merged) and the "Polish time" section exists in `docs/architecture/moduly-i-zasady-kodu.md`.
- `salaryLabel` is in `app/pages/offers.vue:254`, so the "moves into the Offers view entry" claim has a real source.
- Ticket facts: epic lq3 with children .1/.2/.3; .2 and .3 depend on `oferty-pracy-nq3.1`, which is IN_PROGRESS (`bd show`), and its page, paging element and multi-choice element are not in `main` (no "Synchronizacje" in `app/`). The SD's Risks section says so correctly.

## Findings

### 🟡 Major 1: no file boundary, no Create/Modify/Delete list, no route paths
- Where: SD as a whole (lines 3, 30-70, 86); tickets .1-.3 (SD is their only design link).
- Discrepancy: the SD says "names of tables, routes and fields are illustrative". It gives no list of repository paths to create, modify or delete, and no HTTP route paths or methods for the six Recruitments operations, Start application, Offers by IDs, the details read or the note save. Existing code shows what is touched: `app/pages/offers.vue` (1041 lines; list and details drawer in one page), `app/components/AppHeader.vue`, `modules/offers/{index,view,list-offers,offer-view,read-offers}.ts`, `modules/offers/domain/{filters,filter-form,filter-offers}.ts`, `server/api/offers/*`, `server/utils/*` (a new handler like `server/utils/companies.ts`), `tests/module-boundaries.test.ts`, `docs/architecture/moduly.md`, `modules/offers/README.md`, `plugins/` (only if a module plugin is needed), a migration number after `1770000000037`.
- Rationale: the readiness standard requires exact paths with create/modify/delete for a write allowlist, and zero implementer decisions on API paths. Report once; individual proposed files are not flagged.

### 🟡 Major 2: the stage filter cannot pass through the existing filter pipeline, and the SD names none of the places that must change
- Where: SD lines 59, 68 (stage filter "read from the query key `stage`, repeated or comma-separated"); code: `modules/offers/domain/filters.ts` (`parseFilters` helper `get` throws `Invalid <key>` for any non-string value, so a repeated `stage` key, which arrives as an array from `getQuery`, ends in 400 at `server/api/offers/index.get.ts`), `modules/offers/domain/filter-form.ts:2-3` (`offerFilterQuery(form: Record<string,string|number>) : Record<string,string>` cannot carry several values), `app/pages/offers.vue:16-37` (fixed `keys` list; `restore()` copies only `typeof === 'string'` query values, lines 50-56).
- Discrepancy: the SD describes only the new `stages` field on `Filters` and the filter step in `filterOffers`. Today a `stage` key would be dropped by the form (not in `keys`), could not hold two values, and a repeated key is rejected by the parser. The SD points to the nq3.1 page for the multi-choice element and the key format, but that code is not in `main`, so the implementer has no reference. The nq3 SD (`docs/specs/nq3-panel-synchronizacji/solution-design.md:134`) documents the format only as text.
- Rationale: T3-AC04 (address with two stages and an unknown one shows two selected without error) cannot pass without changes to these three places, and how the form carries a multi-value key is a design choice left to the implementer.

### 🟡 Major 3: shared paging and multi-choice elements and "existing tests" are cited as current, but do not exist in `main`
- Where: SD lines 24-25 (D8, D9), 91 ("the existing sync history paging tests stay green"), requirements T2-AC07 (copied into ticket .2 as "nq3 T1-AC07 nadal przechodzi").
- Discrepancy: `app/` has no sync page, paging element or multi-choice element; `tests/` has no sync-history paging test (`grep -i "paging|stronic" tests/*.ts` finds nothing). Only the Risks section admits the dependency; D8, D9 and the T2 verification state them as facts. The SD also gives no component names, props or file location for the shared element, though D8 makes lq3.2 responsible for turning nq3.1's paging into a shared one.
- Rationale: ticket .2 and .3 are marked `ready-for-agent` while their prerequisite is still in progress. If nq3.1 lands its paging inside the page rather than as a component, the implementer of .2 must decide the extraction design. The SD should state who extracts the element and its interface, or mark the test claim as "to exist after nq3.1".

### 🟢 Nit 1: the offer details are the drawer inside the offer-list page, not a separate "Offer details" page
- Where: SD lines 65-66, 68; code: `app/pages/offers.vue:63-80` (drawer opened by `?offer=<id>`, data from `GET /api/offers/[id]`, `readOffer`), 850+ (`<aside class="detail-panel">`).
- Discrepancy: the SD says "Offer details read the application details by offer ID" without saying whether `readOffer`'s route grows an application field or the drawer makes a second fetch. Moja lista also uses `offer` as its open-details key (SD line 66), so the two pages share a key name with different targets (drawer of an offer vs drawer of an application).
- Rationale: placement is left open; low risk but needed for the zero-decision rule.

### 🟢 Nit 2: `AppHeader` has a closed `current` union and each page passes it
- Where: SD line 70 ("each page's header gets the link Moja lista"); code: `app/components/AppHeader.vue:8` (`'offers' | 'companies' | 'profile' | 'ai'`), used by 6 pages.
- Discrepancy: one shared component, not "each page's header". The new link needs a new `current` value and the new page(s) must pass it. nq3.1 edits the same component for its "Synchronizacje" link, so the two tasks conflict on the same lines; the SD does not say who merges.

### 🟢 Nit 3: salary in "Offers by IDs" is a list, and the label helper depends on a second helper
- Where: SD lines 58, 61; code: `modules/sources/source-ad.ts` (`salaries: Salary[]`), `app/pages/offers.vue:245-259` (`salaryLabel(s)` uses `periodLabel`; `v-for` over `offer.salaries`, lines 737, 917).
- Discrepancy: the SD says "salary" and "the salary label" (singular). An offer has zero or more salary variants; the label function is per variant and calls `periodLabel`, which must move with it. T2-R09 asks for "the same text" in the drawer.

### 🟢 Nit 4: "handler of the module as the Companies module does"
- Where: SD line 53; code: `server/utils/companies.ts` (outside `modules/`; the module itself only exports the error classes through `modules/companies/index.ts`).
- Discrepancy: the handler belongs to the server layer, not to the module. The SD should say "a handler in `server/utils/` mapping the module's error classes".

### 🟢 Nit 5: documents that will go stale are not in the rollout list
- Where: SD line 86 lists the module map row, the module README and the boundaries test; code: `modules/offers/README.md` ("Dependencies", "Public operations", "Implementation state" list no Recruitments read and no stage on the list item), `docs/architecture/README.md` (C4 of the current code), `GLOSSARY.md:118-122` (says another attempt after an ended one "may be a new application"; spec A-R01 says an offer has at most one application, never deleted, and `offer_id UNIQUE` enforces it). No Recruitments/Rekrutacje term exists in the glossary or `moduly.md` yet.

### 🟢 Nit 6: "(Observed in the Offers module)" attributes the limit to the wrong place
- Where: SD line 28; code: the limit and the error are in `modules/sources/read-source-ads.ts:16-35` (`catalogueLimit`, "Offer catalog exceeds current reader limit"); the Offers README (line 19) only repeats it. The fact is true; the source of the observation is the Sources read.
