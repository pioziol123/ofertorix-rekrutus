# JobSpy fork review: decisions after research

Date: 2026-11-03. Task: `bd show oferty-pracy-y81.14`.

## Conclusion

A valuable **candidate for an Indeed trial** was found — `cspenn/jobsniffer`, which uses Chrome impersonation through curl_cffi and HTML data. No evidence was found that this approach works for Indeed Poland from our environment. The mere presence of code, parser tests or a successful attempt by the author does not guarantee removal of the 403.

For the other portals there are fixes for retries, request pacing, keeping partial results and the number of requests. None of the reviewed changes by itself guarantees a global limit of 1 HTTP/s covering details, retries and redirects. Keep our shared transport control; move selected ideas over instead of replacing everything with a fork.

## Recommended order of further work

1. A separate, limited trial of a Chrome/curl_cffi transport for Indeed, inspired by jobsniffer. Before the trial, disable automatic retries and redirects, or put every attempt under our limiter. A 403 result remains an access error, not an empty sync. Do not add a GraphQL fallback automatically just because the examined fork contains one.
2. The first additional APIs: Himalayas, then Jobicy and Remote OK. Measure actual Senior PHP matches, availability from Poland and the number of new ads compared with the current database. This is a proposal, not consent to implement all sources at once.
3. Freehire as a small experiment after verifying the documentation and the origin of the offers. Arbeitnow and selected companies through an ATS as further options.
4. Keep WTTJ/Wellfound and jobsbylevel lower: respectively, gaps in data and filters, dependence on anti-bot protection, and unmeasured coverage of the current profile. The jobsbylevel level describes the use of AI, not seniority.

SOLID.Jobs also appears in fork PRs, but **we already have our own integration**, so it is not a new source for the application. The reduction in the number of requests in Glassdoor and LinkedIn error reporting described in the report partly come from upstream; do not count them again as new features of our fork without comparing the local code.

## Detailed reports

- [Indeed: fork sample, transport and evidence](jobspy-forki-indeed.md).
- [Other portals: limits and additional adapters](jobspy-forki-inne-portale.md).
- [Additional sources: current operator documentation](jobspy-nowe-zrodla.md).

This is static research, without running fork code and without new attempts to fetch from LinkedIn/Indeed. Reading the public Remote OK response served to confirm the interface; it was not an import into the database. Production adapters and enabled sources were not changed. The reports point to a specific sample and pinned code versions; the whole fork network was not audited.
