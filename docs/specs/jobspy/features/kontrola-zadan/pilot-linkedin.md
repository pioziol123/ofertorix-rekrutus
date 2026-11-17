# LinkedIn — pilot after consent was confirmed

Date: 2026-11-02. The owner confirmed consent to scraping LinkedIn and Indeed with a limit of one query/s. The confirmation comes from the owner; we do not keep the consent document in the repo.

## Scope and result

Manual import `Senior PHP`, Poland, descriptions enabled. No logging in, proxies, circumventing blocks or schedule. The shared runner serialises JobSpy runs; requests within a run are at least 2 s apart, and the boundary between runs is at least 1 s.

Run: `49b02ae0-2370-4ab7-bfe4-79ab6cadea20`.

- 10 source ads and 10 first revisions were saved.
- 10 HTTP attempts were made (the set limit), with no rejected or duplicated records in the run.
- 9 ads have a description, 1 description was not fetched.
- Status `partial`, reason `request_limit`, adapter warning. We do not communicate a complete fetch of the portal or a confirmed PHP/senior match for all results.
- The results are available in the application's list; qualification is still a separate task.

Indeed stays disabled: the existing adapter uses GraphQL, while the planned HTML scraper is task `oferty-pracy-y81.8`. The consent removes the block on access for scraping pages; it does not replace implementing and testing that adapter.

## Verification

67 application unit tests concerning JobSpy, 54 fork tests and 4 runner tests passed. The runner tests use real processes and the lock without network traffic: parallelism, a gap of at least 1 s, an exception, abrupt termination, keeping the inode, and no connections when the lock is unavailable. ESLint, TypeScript and the worker healthcheck passed. The tester prepared the tests but ended on a usage limit; the main agent reviewed them and ran them itself.

Limitation: the shared lock applies to processes that use the runner and the same volume. An independent installation on another host must have a shared limiter or must not fetch in parallel.
