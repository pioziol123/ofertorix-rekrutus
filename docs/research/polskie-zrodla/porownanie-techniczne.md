# Polish portals — technical comparison of integration

As of: 2026-11-03. Samples in the browser, public code of other projects and selected single requests from the worker container were examined. Technology, specialisation and level filters are the owner's configuration, not a fixed property of the adapter. The data are observations, not documentation or a guarantee of the operator's contract.

| Source | Reading method | Pagination / detail | Result in the current environment |
| --- | --- | --- | --- |
| [Just Join IT](justjoinit.md) | JSON `GET /api/candidate-api/offers`; `data`, `meta`, required and optional skills, salary data. | Cursor `meta.next.cursor` → `from`; the detail `GET /api/candidate-api/offers/{slug}` has an HTML `body` and an ID. The sampled list `guid` matched the detail `id`. | List, second page and one detail: worker HTTP 200 JSON. Not confirmed whether the limit `totalItems=10000` means a hard threshold, nor full scope coverage. |
| [No Fluff Jobs](nofluffjobs.md) | Detail JSON `/api/posting/{slug}`; the Angular list page has an embedded `script#serverApp-state` with `postings`, `criteriaSearch`, `totalPages`. Public implementations use POST `/api/search/posting`. | After a click the view loads another 20 cards; the parameters and response of the second-page POST were not confirmed in the test. The detail has required/optional technologies, description, conditions and dates. | In the browser the list state and detail JSON are visible; the worker got HTTP 403 HTML for the detail GET and the list POST. |
| [Bulldogjob](bulldogjob.md) | `GET /companies/jobs`: `script#__NEXT_DATA__`, `props.pageProps.jobs`, `totalCount`, `slugState`; detail `props.pageProps.data.job`. | `/companies/jobs/s/page,2` observed, 50 items each; the detail has description, requirements, dates, status, salaries and technologies. The ID contains a number and a slug. | In the browser two pages, a filter and a detail were read; the worker got HTTP 403 HTML for the list. |
| [theprotocol.it](theprotocol.md) | `GET /praca`: `__NEXT_DATA__.props.pageProps.offersResponse`; detail `pageProps.offer` and JSON-LD `JobPosting`. | `?pageNumber=2` observed, 50 elements each; the list identifier matched the detail, which contains text sections, technologies and dates. Example filter `/filtry/go;t`. | The browser read the list, page 2, a filter and a detail; the worker got HTTP 403 HTML for the list. |

## Consequences for the architecture

1. The shared adapter interface should accept a set of criteria without hard-coding PHP, Go or seniority. A source may not support all combinations; distinguish a confirmed filter, one applied locally and one that cannot be assessed.
2. The ad identifier and URL, raw fields, source dates, and separately the observation moments and content versions must be preserved; the stability of identifiers and the semantics of dates need further trials. Do not automatically merge offers across portals based on an identical title.
3. Without an atomic snapshot, deduplicate identifiers and detect counter changes, looping pagination and missing pages. A 403, broken HTML/JSON, a skipped detail, a limit or an interruption is an incomplete run, not empty results or expiry.
4. Separate the technical ability to read the DOM in a browser from the ability to work on a server/VPS: in this trial three services refused a simple client in the worker. We do not know the causes or how lasting the result is. The detailed reports record the conditions and unknowns concerning permitted access.
5. The first candidate for a small adapter prototype is Just Join IT, because beyond the browser both the list and the next page, and a detail, were checked from the worker. Needed: fixtures for many data variants, tests of the cursor and currencies, investigation of the 10000 limit and filter semantics, and testing of errors/incompleteness. This is not a confirmation of durability, complete sync or the right to recurring import.

Not examined: all filter combinations, last pages, full schemas, withdrawn offers, frequency limits or availability from the future VPS. The trials are a technical sample, not proof of market coverage. The study did not save offers to the database or perform a bulk import.

## Supplement: comparison of headers from the container

Current trials from 2026-11-03: [matrix and conclusions](naglowki-http.md). NFJ HTML and API return 200 after changing only the User-Agent to Chrome, while the base client still gets 403. Bulldogjob .com currently returns 200 even to the base client; .pl and theprotocol still return 403 with `cf-mitigated: challenge`, also with a browser header set. The results supplement and partly replace the earlier 403 observation; they do not confirm durability or complete sync.

## Update: working curl_cffi transport

On 2026-11-03 reading Bulldogjob **.pl** and theprotocol from the container was confirmed via curl_cffi with a Chrome/Safari profile and HTTP/2, without the owner's cookies. The list, the second and last page, a filter and a detail returned 200 and application data. Plain requests, plain curl HTTP/2 and the Chrome profile forced to HTTP/1.1 still received a challenge. The earlier technical block was resolved in a diagnostic sample. [Results, limitations and reproducers](dostep-http-rozwiazanie.md). Connectors and full import have not been implemented yet.
