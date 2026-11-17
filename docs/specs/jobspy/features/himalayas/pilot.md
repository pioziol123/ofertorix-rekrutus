# Himalayas — pilot result

2026-11-03, Beads `oferty-pracy-y81.16`. Scope: [requirements](requirements.md), [solution](solution-design.md).

## Result of the real import

Run `90e05fc4-538a-4dc3-bf29-5fe08d0f54f5`: **complete**, 3 pages, 54 unique saved source ads and 54 first revisions. Parameters `q=PHP`, `country=PL`, `seniority=Senior`, `sort=recent`. Zero rejected records, duplicates and missing descriptions. At the time of the check, none of these ads had passed its expiry date. An earlier single exploratory read of the first page did not save offers. AI was not run.

Complete means the pagination of this query finished with a stable counter, not full market coverage. `marketComplete=false` remains in the diagnostics.

## Quality and limitations

**15 of 54 titles contain the standalone word PHP**. This is a simple quality count, not a qualification result. The first exploratory read showed, for example, a Senior UI & UX Designer whose description mentioned PHP in a section about other recruitments. So the search engine does not confirm the specialisation. All results keep the mark of unconfirmed PHP/senior qualification. Do not equate the 54 saved ads with 54 matched offers.

Full descriptions, country/time zone restrictions, raw data and the original `applicationLink` were preserved. `pubDate` is saved as the source update, and the publication field stays null. No automatic merging with other sources and no assessment of additionality relative to SOLID.Jobs was done. Verifying the actual role, the conditions for working from Poland and the similarity across portals remains for further qualification (`oferty-pracy-y81.10`).

## Application verification

The list API (HTTP 200) returns the new records with the Himalayas source, an unchanged link, qualification unknowns and a null publication date. The rendered list and the details of a sample Senior PHP Developer offer confirm the visible attribution, the "Otwórz w Himalayas" ("Open in Himalayas") button and the qualification warning. Himalayas HTML pages were not queried; the view check used the local application.

A separate tester prepared 18 adapter tests and 13 integration tests in an isolated PostgreSQL schema. The parent's final verification: **102/102 tests** (Himalayas, saving, offer projection and JobSpy), ESLint on the changed files, code formatting and a full `pnpm typecheck` passed. The tests check no retry after 403/429, invalid URLs, the size/time/page limits, partial saving, page rollback, no expiry of unseen records, idempotence, revisions and the block on parallel imports.

## Further use

Manual importer: `docker compose exec -T worker pnpm himalayas:sync`. There is no schedule and no automatic retry loop. The queue, the status in the UI and the 200/410/404 freshness check are tracked by `oferty-pracy-y81.17`. The changes stay local, with no commit/push.
