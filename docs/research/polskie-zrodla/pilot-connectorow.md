# Pilot of the implemented connectors — 2026-11-03

The `bulldogjob` and `theprotocol` connectors were implemented independently of the JobSpy fork: Python/curl_cffi Chrome HTTP/2, a Next.js list and detail parser, TypeScript validation and normalisation, a shared revision write, a pg-boss queue, recovery of interrupted runs, API, CLI and a form in `/offers`. Imports are manual; technology and level are configurable. The existing dependencies of the worker image were used, with no new packages or table migrations.

## Trials through the real queue and database

| Source | Scope | Result | Pages | Requests | Ads saved in the run |
| --- | --- | --- | --- | --- | --- |
| Bulldogjob | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| theprotocol.it | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| Bulldogjob | PHP, senior, default limits | complete / exhausted | 1 | 10 | 9 |
| theprotocol.it | PHP, senior, default limits | complete / exhausted | 2 | 27 | 25 |
| theprotocol.it — refresh after the mapping fix | PHP, senior, default limits | complete / exhausted | 2 | 27 | 25 |

Identifiers of the full runs: Bulldogjob `21afc245-c947-4f1c-b8e9-1c122ef8c96a`; theprotocol first trial `168d5d68-dda1-4cb9-8ca4-715b10ed0e3c`, final `c8536783-63ba-4e05-9347-c8db090c611d`. They can be read via `polish:status`. Fetching again updates the same source ads; it does not create copies of them. Revisions preserve the earlier payloads. Currently 34 ads from both new sources are saved in total; there was no deduplication across portals.

The theprotocol PHP list contained 60 items. The senior level appeared in the 25 kept records, or did not allow compatibility to be ruled out unambiguously; 35 items with an explicitly different known level were skipped. The job title was not used as evidence of seniority. No bulk import of whole portals and no AI analysis were performed.

## Verification of real data

The statuses, counters and visibility of both sources in the API and the browser were confirmed; the Bulldogjob offer detail had the full description text. The theprotocol variants that were read used `currencyCode`/`kindCode` and the `home-office` mode; the mapping was fixed and a regression test added. After the refresh the API shows PLN, the period Hour/Month, B2B/UoP and remote work. Bulldogjob also preserves text salary ranges, e.g. 150–180 PLN/h.

`POST /api/sources/polish` was checked: a valid request 200 and execution in the queue, a foreign Origin 403, invalid criteria 422, a wrong Content-Type 415. The manual import form and both finished runs were observed in `/offers`.

## Automated checks

- `pnpm check`: lint, Nuxt and worker types, and 212 Vitest tests pass; 83 integration tests are disabled by default.
- A separate run with `RUN_INTEGRATION=1` for `polish-sync`, `offers`, `sources` and `jobspy`: 36 tests in 4 suites pass in isolated PostgreSQL schemas.
- A dedicated tester agent prepared 21 TypeScript tests of the parsers/subprocess, 15 offline Python tests and 8 integration tests of the new sources. The Python test is also run through a Vitest wrapper in the worker image.
- `pnpm build`: the production Nuxt build passes.

The tests cover identity and hosts, the raw payload, separate contracts, hourly and monthly salaries, required/optional technologies, missing and unknown criteria, limits, challenge, pagination and counter changes, keeping partial results, process isolation, request deduplication, revisions, recovery, and no automatic withdrawal of unseen offers.

## Limits

`complete` means that reading a specific scope finished with checked counters, not market coverage or an atomic snapshot. `marketComplete` remains false. The limits described in the README apply. Sources may change their format or refuse access again; then the result is incomplete/failed, and valid records stay preserved. No owner cookies, browser for fetching, proxies, solvers or AI keys were used.

## Extension: Just Join IT and No Fluff Jobs

A further stage from 2026-11-03 adds the two remaining sources to the same mechanism. The `/offers` panel is now called "Polskie serwisy — pobieranie ofert" (Polish services — fetching offers) and contains all four sources.

| Source | Scope | Result | Pages | Requests | Saved ads |
| --- | --- | --- | --- | --- | --- |
| Just Join IT | PHP, senior, limit 3 | partial / offer_limit | 1 | 4 | 3 |
| No Fluff Jobs — first pilot before the alias fix | PHP, senior, limit 3 | partial / offer_limit | 1 | 37 | 3 |
| Just Join IT — standard limits | PHP, senior | complete / exhausted | 1 | 50 | 49 |
| No Fluff Jobs — after the alias fix, standard limits | PHP, senior | complete / exhausted | 2 | 18 | 16 |

Final runs: Just Join IT `288e938a-dcdf-4a18-9abb-2235c72c1ab2`, NFJ `bc1a13b8-1724-4fce-8c43-69174dbdc593`. Reading through the API and `readOffers` confirmed 9 Bulldogjob, 25 theprotocol, 49 Just Join IT and 16 NFJ — 99 ads in total from these four sources. Offers were not merged across portals.

Just Join IT uses the JSON API `candidate-api/offers` with the parameters `skills`, `keywords`, `keywordType=skill` and the supported `experienceLevels`; [the filter confirmation](justjoinit-filtry.md) contains the frontend source and the PHP/Go trials. Identity is based on the list `guid` and the matching detail `id`; salaries with `currencySource=conversion` do not create extra contract variants in the view. The detail of a saved offer read through the local API had a 2594-character description, 10 technologies and the original range 16000–20000 PLN/Month B2B.

NFJ disables salary-match. In the trial the source returned 181 and 69 regional cards on two pages, despite `pageSize=20`. One entry may have several city/voivodeship addresses and Unicode in the ID. A matching list and detail `reference` is evidence of a shared publication; differing references cause the match to be rejected. Without that evidence we require the IDs to match case-insensitively. The normalised key and URL use the canonical `defaultUrl`, and raw keeps the source records. In the final run: 160 aliases, 74 cards with a different known level, 16 saved publications; 250 source cards in total. Zero rejected records and unexpected duplicates. Aliases do not cause further detail requests or an incomplete status.

Additional safeguards: a strict type for the cursor start (bool/float/string rejected); a change of NFJ totalPages or of the counter means an incomplete run; the number of regional cards is separate from the number of saved publications; original currencies and musts/nices are preserved; dates without a time zone are not guessed. None of the new paths uses the owner's cookies or AI.

Final checks after the extension: `pnpm check` — lint, types and 234 standard tests pass; the dedicated tester agent covered the sources with 36 offline Python cases and 11 integration tests of the four sources; 22 new TypeScript JSON/alias tests are part of the standard suite. The production Nuxt build and the formatting check passed.
