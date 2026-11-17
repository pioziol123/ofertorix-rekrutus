# Indeed import via GraphQL — solution design

[Requirements](requirements.md). Decisions for the stage of 2026-11-03: the runner uses the existing `jobspy.integration.collect_indeed`, which processed Polish offers correctly in the [pilot](../../../../research/indeed-graphql-pilot.md). HTML stays a separate unused adapter; no automatic fallback.

The runner keeps `serialized_import`, and the `ControlledRequests` adapter with rate limiting and explicitly controlled retries; the shared volume ensures serialisation of Indeed and LinkedIn. The Indeed scope adapter version goes up from 4 to 5, which gives a new fingerprint without migrating old observations. The other sources keep their versions and configuration. The RunResult v1 format and the validation rules stay unchanged.

The importer saves valid records and revisions idempotently. `limited` / `result_limit` maps to an incomplete run, and `market_complete=false` does not allow claiming full market coverage. A 403 error in the current adapter is a generic `page_error`, which still gives failed or partial, not an empty success; 429 has its own status `rate_limited`. Missing descriptions and rejected records affect completeness. We do not expire unseen ads.

Verification: tests of adapter selection, HTTP limits and response validation, integration tests of the queue and the database, then one manual import with a check of state and visibility. Enabling applies only to Indeed and adds no schedule. None of the trials proves lasting access to a non-public endpoint.

## Queue pilot — 2026-11-03

Manual run `1fb288dd-47d6-4933-9e2b-271e3caccf6f` made one request, completed the query (`exhausted`) and saved 31 ads and 31 revisions, with no rejected records and no missing descriptions. `market_complete=false`: the result is not a declaration of market completeness. The API and the detail view returned the saved ads. Of the 31 titles, 17 contained PHP, 23 Senior, and 13 both words; all have their unconfirmed criteria marked. The title does not settle whether the content matches. Selection remains the task `oferty-pracy-y81.10`.
