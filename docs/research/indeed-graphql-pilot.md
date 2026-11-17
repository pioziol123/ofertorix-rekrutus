# Indeed GraphQL — access and adapter check

Date: 2026-11-03. Both attempts were run in the worker container under the shared `serialized_import` lock; each run waited at least one second after acquiring the lock. No redirects, retries, proxies or storing offers in the database.

1. Direct GraphQL POST: query PHP, Poland, response limit 5, Polish locale, local field selection. One request: HTTP 200, JSON, zero GraphQL errors, five results and five descriptions, time 0.24 s.
2. The existing `jobspy.integration.collect_indeed`: query Senior PHP, Poland, 5 processed ads requested, policy of at most one request and one attempt. Result `limited` / `result_limit`, one request, five processed ads, five URLs, zero missing descriptions, zero skipped records and warnings. All titles contained PHP and Senior; two also indicated the Regular level. This adapter asks the source for a page of up to 100 records and then limits the result to five.

Conclusion: GraphQL and the local adapter worked for this limited sample from the current environment; the HTTP 403 concerned the HTML examined earlier. Not shown: completeness of the Polish market, durability of access, correctness of all data, or the possibility of working from Poland for every offer. The query results are not a senior PHP qualification. The attempts did not enable Indeed in the application, did not change the runner pointing to HTML and did not run a storage pilot through the queue.
