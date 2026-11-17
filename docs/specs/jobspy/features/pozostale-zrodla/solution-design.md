# Other JobSpy sources — solution design

Design of 2026-11-02, [R-S01–R-S06](requirements.md). The fork is based on 0f2540e, new package 1.4.1+oferty.2. The existing collect_indeed / schema1 stay compatible. We do not require a data migration.

## Fork

The new module `jobspy.multi_source` provides `SourceRequest` and `collect_source`: one explicit source per process. The registry maps all adapters except Indeed. The country is validated before calling scrape: Glassdoor according to its domain map, ZipRecruiter USA/Canada, Naukri India, BDJobs Bangladesh, HelloWork France; Google marked as unavailable according to the README. LinkedIn global and Bayt with an explicit location. For the application, the query is still Poland/Senior PHP.

Output schema2: like schema1 with an extended source, fork_revision=oferty-contract-2 and the codes `unsupported_scope`, `unsupported_source`, `blocked`, `adapter_error`, `unverified`. Query contains source and fetch_description. The full record keeps the ID prefix and site, and does not pass through the DataFrame. Salary origin outside Indeed is unknown by default. We do not move source or configuration into profile data.

The HTTP controller scope is local to the call (ContextVar). `create_session` decorates the request of the real session, keeping its headers and transport properties; the shared budget covers pages and details, regardless of requests/curl. No shell, proxies or automatic redirects. Bayt 404 ends the read before the location fallback. We keep the existing ControlledRequests compatible with the Indeed tests. The controller records a safe reason for stopping and the number of attempts.

Existing adapter logs are captured within a single process and reduced to safe codes and counters; we do not print raw exceptions/URLs/payloads. Skips and missing descriptions give partial. No errors but no evidence of complete paging: limited/unverified (also with zero offers). We do not use this as evidence of expiry. The process still has a hard timeout and an output limit on the Node side.

## Application

`jobspy-catalog.ts` contains source identifiers, names, prefixes, URL hosts, Poland support and the limitation reason. `JOBSPY_SOURCES` is an explicit list of active sources other than Indeed; empty by default. The previous JOBSPY_ENABLED applies only to Indeed. Separate information `requires_access` for LinkedIn; we do not circumvent this by accidental use of the old flag.

The parameter/fingerprint/queue functions take source, keeping the existing Indeed defaults for API/test compatibility. executeJobspy matches the run to the queue's source; enqueue/recovery/locks/status work per source. The worker registers every queue, but without a schedule. The CLI takes --source; status without source shows the catalogue. The status API adds a sources list, keeping the old Indeed fields. The offer list shows the source and the statuses of all enabled adapters.

After the tests, the new package, the lock export and the manifest replace the distribution in use. Commit/push of the new changes requires separate explicit authorisation; publishing the previous package is not automatic consent to the next push. We check working state without confusing fixture tests with live ones. Geographically restricted sources stay connected with the code unsupported_scope; we do not change their country at random.

The application parser skips records with an explicit country other than Poland and counts `outsideScope`. A missing country (including the marks unknown/worldwide/remote) is kept as an unknown; it does not derive the possibility of working from Poland from the remote flag alone.

Update: the application's geographic block for the five sources and the rejection of foreign remote records are superseded by the [remote offers SD](../zdalne-zagraniczne/solution-design.md).
