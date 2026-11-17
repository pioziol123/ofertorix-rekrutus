# Himalayas — pilot solution

2026-11-03. Covers [R-H1–5](requirements.md). The parameters, limits and statuses below define the implementation scope; this is not a deployment of a schedule nor an extension of the JobSpy contract.

`lib/sources/himalayas.ts` handles the public JSON without a key and without Python. Search uses pages from 1, 20 records each; it does not use the browse cursor. We validate the envelope, the page position and the counter, and individual records separately. `guid` and `applicationLink` must be HTTPS on himalayas.app, without login/password and without an unusual port. We keep the application link exactly as in the API. We do not read employers' or offers' HTML pages.

Normalisation uses the existing `Offer` shape and `saveOffers`, without impersonating the JobSpy adapter. Raw record in `sourceRecord`; `validFrom=null`, `sourceUpdatedAt` from pubDate, `validTo` from expiryDate. Salaries with the actual period (the unsupported fortnightly stays raw, normalised period null), origin unknown. The country list is preserved; no restrictions means worldwide only with an explicit empty array. The PHP and senior match is left to qualification, even if the portal's filter accepted Senior.

`lib/sources/himalayas-sync.ts` is the manual executor of the pilot, run by `scripts/himalayas-sync.ts`, without a queue and without automatic retries. A separate PostgreSQL session lock serialises manual runs. We create the existing scope and a run with status running. Each page is saved in a transaction. An interrupted previous run is marked failed/partial only under the lock. Status complete means the pagination of the specific query finished, not the full market. A limit, a pagination change, rejected records, duplicates, a missing description or an error after records were saved give partial. No valid page plus an error gives failed. We never mark unseen ads as unavailable.

Requests have a 20 s timeout, redirect error and no retry. In particular, 429 ends the run with the Retry-After metadata, without an earlier retry. At most 5 pages/100 candidates and 120 s of network time per run. The database lock and one second before the first read ensure a gap between successive processes. A database error must not expose the raw response or the connection data.

The list uses the existing `projectOffer`, with an added explicit Himalayas label and qualification unknowns. The visible source link points to the unchanged applicationLink. We do not add the source to the JobSpy catalogue.

Verification: an independent tester for the adapter, HTTP errors and pagination, projection and saving in an isolated Postgres schema. A pilot on the running database, a report of the status and number of records, without automatic AI analysis. After the pilot, a separate task for the queue, freshness control and a possible schedule.
