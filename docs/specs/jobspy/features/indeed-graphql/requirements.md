# Indeed import via GraphQL — requirements

Status: scope for implementation, 2026-11-03. [PRD](../../PRD.md), [design](solution-design.md). The owner ordered the import enabled after a successful limited GraphQL trial. The earlier [HTML design](../scraper-html-indeed/requirements.md) remains a historical description of a separate adapter; its choice as the runner's transport is superseded for this scope.

- R-G01: a manual Indeed import fetches Polish offers for the Senior PHP query and saves valid ads with their source and descriptions. An end-to-end test confirms the saving and the visibility in the application.
- R-G02: the query does not confirm PHP or seniority qualification. Unknown information is not treated as unmet criteria; limited or partial results are marked as such. The absence of an ad does not cause it to expire.
- R-G03: the shared Indeed and LinkedIn limit covers every request, retries included, and is at most one request per second. Errors and blocks are not presented as a successful empty result.
- R-G04: the current sources and history stay available; changing the fetch method creates a separate fingerprint. No automatic schedule. Offline tests verify adapter selection, the contract, limits and errors; a limited live import confirms the integration with the queue and the database.
