# Other JobSpy sources — requirements

Selected for implementation 2026-11-02: the owner instructed us to connect the other integrations from the fork; Indeed stays last. Basis: the [PRD](../../PRD.md), extending the scope to adapters other than Indeed. We do not change the Poland / PHP / senior search to other countries.

- **R-S01:** the catalogue covers all fork adapters: LinkedIn, Bayt, Glassdoor, ZipRecruiter, Naukri, BDJobs, HelloWork, Google and the postponed Indeed. Each has a name, support for the Poland scope, and information about connection, activation and the last run. The presence of an adapter is not presented as fetching offers.
- **R-S02:** the adapters have a shared input, a structured output, request/time limits, and validation of identity and of the URL of the correct source. We do not lose valid records after a detail error, and we do not derive a guarantee of market completeness from completing a query.
- **R-S03:** an unsupported country and a source declared unavailable end with an explicit status before the network. An adapter must not silently widen Poland to the whole world. The inability to run is visible in the status, not as a valid empty read.
- **R-S04:** each source has a separate queue, lock, scope and history. Recovery, identifiers and errors do not leak between portals. The rules of no automatic expiry after an ad is not observed and no automatic merging across portals remain.
- **R-S05:** the operator chooses the source for a manual run and for status; the interface shows the state of each source. Activation is explicit per source; Indeed is not activated by adding other adapters. No automatic schedule at this stage.
- **R-S06:** a live trial saves the true result and the number of kept offers, or a specific reason it was not run. The requirements do not order circumventing source restrictions or buying proxies. A source is not declared working on the basis of a synthetic test.

Acceptance: tests of each adapter's structured output, control of both requests/curl transports, country rejections, errors/limits, source mapping and PostgreSQL isolation. A controlled pilot for sources that are relevant and available for Poland; others get an explicit reason, not an invented number of offers. We record the details of limitations in the source registry and in the work result.

Update: for foreign remote offers, R-S03 is superseded by [R-R01–R-R05](../zdalne-zagraniczne/requirements.md). An unsupported query country still gives unsupported_scope, but the application can explicitly query a foreign market with the remote filter.
