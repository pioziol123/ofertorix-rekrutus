# Himalayas — manual source pilot

2026-11-03. Continuation of the approved recommendation from the [source review](../../../../research/jobspy-nowe-zrodla.md). Beads: `oferty-pracy-y81.16`. This is an additional application source, independent of the JobSpy library.

- **R-H1:** Manual fetch with `q=PHP`, `country=PL`, `seniority=Senior`, sorting recent. The results are candidates from the search engine, not a confirmed match; PHP/senior unknowns stay visible. We are not extending the shared role qualification for now.
- **R-H2:** Offers go into the existing list and details with the Himalayas source and an unchanged `applicationLink`. The stable identity is `guid`. A repeated fetch keeps the history and does not create another ad for the same identifier.
- **R-H3:** Keep the raw record, the full description and the geographic/time restrictions. `pubDate` is an update, not a publication date. Missing amounts and units stay unknowns; do not guess gross/net, B2B or salary origin.
- **R-H4:** Pages are fetched one after another, at least one second after the previous read finished, with a timeout and a limit of 5 pages. Do not retry 403/429 or redirects; expose the reason for ending. Keep valid results after an error on a later page. Duplicates, invalid records, a changing counter or an incomplete description mean an incomplete read, not a valid zero.
- **R-H5:** Disappearing from search never closes an ad. Keep the expiry date; a separate 200/410/404 check and an automatic schedule stay outside the pilot. The import does not run AI.

Acceptance: offline tests of R-H1–5 and from a separate tester, a pilot of the public API with the number of saved candidates and an assessment of the limitations, a check of the list/source/link, lint and typecheck. A missing response from the source must not delete existing data. The verification does not prove full market coverage or correct qualification.

Operator contract: [API](https://himalayas.app/api), [reference](https://himalayas.app/docs/remote-jobs-api). Required: a visible source and an unchanged application link, with no further publishing of the database in other aggregators.
