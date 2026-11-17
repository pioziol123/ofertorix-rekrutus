# Indeed: alternative approaches after HTML 403

Date: 2026-11-03. A supplement to the [earlier fork review](jobspy-forki-indeed.md). Only reading public code, the GitHub API and a public JSON artefact; **zero requests to Indeed**, no running of downloaded code, no production changes and no proxy purchase.

## Practical conclusion

The best next experiment is **one controlled mobile GraphQL query for Poland with a limit of 5 results, without seniority/remote/date filters and without automatic retries**, recording the HTTP status and any GraphQL error. There is no basis to equate the locally proven HTML 403 with a failure of `apis.indeed.com/graphql`: the GraphQL error seen so far has no classified response here. If the Polish result is ambiguous, only then consider a separate control variant for USA/San Francisco matching the external test. The limit means starting **each physical request at least 1 s after the previous one**, redirects included; on 403/429, stop that run.

The strongest new evidence is **alpharomercoma/ts-jobspy**, a TypeScript derivative of python-jobspy, not another Python fork: a public automated test from **2026-11-02** reports Indeed `status: ok`, **5 ads, 5 descriptions**, 5 publication dates and 4 company names. This is evidence of the author's specific test for the USA on GitHub Actions, not of our IP, Poland or the completeness of the whole source. [Run](https://github.com/alpharomercoma/ts-jobspy/actions/runs/41478532464).

## What exactly was confirmed in ts-jobspy

The examined commit and the `head_sha` of the successful run: `529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a`.

- The endpoint remains `https://apis.indeed.com/graphql`; the client is Axios/Node, not a full browser. The query fetches the description in the same response, so it does not need `/viewjob` for each ad. [Implementation](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/src/indeed/index.ts).
- The headers have a specific mobile UA `Indeed App 193.1`, `indeed-app-info`, a shared key and `indeed-locale: en-US`; `indeed-co` is added separately. The author's comment says that changing to an arbitrary UA causes a 403. **The code confirms that these headers are sent; the comment is not by itself evidence that each of them is required.** [Constants and query](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/src/indeed/constant.ts).
- The README declares a test from a home IP on 2026-08-31; this is the author's declaration. Stronger, fresher evidence comes from the CI report that was read, with no proxy configuration in the workflow. It does not follow that every IP will work. [README](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/README.md), [workflow](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/.github/workflows/scrape-health.yml).

### Checking the green CI and the report

The script really calls the scraper with `searchTerm='software engineer'`, `location='San Francisco, CA'`, `resultsWanted=5`, `country='usa'`. The expectations file requires Indeed to work. The script fails on a regression, but also treats `partial` as a working state; **green CI alone does not prove full success**. So the artefact was read: the report contains `ok`, not `partial`, `received: 5`, `description: 5`, a time of 0.392 s and the date `2026-11-02T16:08:45.603Z`. It does not contain the raw offers, so it does not allow independently checking their relevance or freshness. [Script](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/scripts/scrape-health.mjs), [expectations](https://github.com/alpharomercoma/ts-jobspy/blob/529b9cd75b0fd0f41cbf2d0db9b4fc094e130d5a/scripts/scrape-health.expected.json).

Reproducing **the reading of the evidence, without contacting Indeed**: GitHub API `GET /repos/alpharomercoma/ts-jobspy/actions/runs/41478532464` returns the SHA above; `GET /repos/alpharomercoma/ts-jobspy/actions/runs/41478532464/artifacts` points to artefact `13157374511`, name `scrape-health-41478532464`, `expired=false`; its ZIP was downloaded through `/repos/alpharomercoma/ts-jobspy/actions/artifacts/13157374511/zip` and the JSON was read. The artefact is temporary, and the run link remains the entry point. The other four most recent runs read, from 2026-10-29–11-01, also show `success`, but their artefacts were not checked.

## Differences from the local GraphQL

Compared without running code: `.local/JobSpy/jobspy/indeed/{__init__,constant}.py`.

| Element | Local JobSpy | ts-jobspy | Meaning |
|---|---|---|---|
| Endpoint, key, app UA, app-info | Mobile GraphQL, Indeed App 193.1 | The same | This is not a new endpoint or the discovery of a missing UA |
| Country and language | `indeed-co: PL`, `indeed-locale: pl-PL` for Poland | `indeed-co` depends on the country; locale always en-US | A real variable for a separate test, with no evidence that the Polish locale is an error |
| Page size | 100 | Minimum of 100 and the requested count+offset | A 5-result diagnostic reduces the response |
| Query | `dateOnIndeed`, `sourceEmployerName`, `ugcStats`, Range/AtLeast/AtMost/Exactly ranges | An older, different selection, including `datePublished`, `attributes.label`, additional dossier fields | HTTP 200 with a schema error needs a different diagnosis than HTTP 403 |
| Transport | Requests for controlled GraphQL | Axios and Node TLS | A possible separate variable, no evidence of an advantage on our IP |
| Filters | Combined groups | One group by priority | The first attempt should have no filters, so as not to mix causes |

The actual `user_agent` parameter of the call should also be checked: the local session-creation function can override the constants. The mere presence of correct constants in the file does not prove they were sent in the earlier run. The recommendation does not assume that an override happened earlier.

## Browsers, cookies, proxies and alternative addresses

In the examined sample, **no verified Indeed implementation in a JobSpy fork was found** that adds a persisted browser session/cookie import and fresh, reproducible evidence of working. This is a limited search result, not a claim about all forks.

- Upstream [#125](https://github.com/speedyapply/JobSpy/issues/125) contains a user's statement that Selenium fetches more current ads, but more slowly; it shows no Selenium code and no fresh test for Poland. This is a lead, not a ready fix.
- Playwright hits in `elucidator8918/JobSpy` concerned other portals; reading `blongstaff30/JobSpy/jobspy/__init__.py` showed a Playwright export for semiconductor portals, while Indeed remains a separate class. The mere presence of a Playwright dependency in the repo is not an Indeed fix. [blongstaff code](https://github.com/blongstaff30/JobSpy/blob/04eb12074f865950f292f317c59c24e7b8ba4352/jobspy/__init__.py).
- `rohil01/JobSpy` has the already known mobile GraphQL as a fallback after HTML. Its docstring declares an earlier success from 2026-07-27 and warns that the shared key is not durable; this is not a different API or fresh evidence. [Code](https://github.com/rohil01/JobSpy/blob/fc3c3cd81f7eca513d249bf6cc5612e9a19cd480/src/jobsniffer/indeed/graphql.py).
- These searches found no specific Indeed RSS or `m.indeed.com` variant for JobSpy backed by code and a current result. `apis.indeed.com/graphql` **already is the mobile variant**, not an alternative that requires finding another domain. A historical question about the origin of the API: [#221](https://github.com/speedyapply/JobSpy/issues/221).
- Proxies are supported by the projects, but the successful ts-jobspy workflow that was read does not pass a proxy. There is no evidence here that one must start by buying a residential proxy. The README is the author's recommendation, not a controlled comparison on the same IP.

A full browser is only the second direction, if controlled GraphQL fails and a manual session has access to the HTML. One global gate would then be needed for navigation, scripts, resources, XHR, service workers and redirects. A second between navigations does not by itself ensure a limit of 1 physical request/s. Cookie import is a hypothesis for a separate experiment, not a solution confirmed by this study.

## Sample limits

The audit of the metadata of 117 forks from the earlier note was not repeated. The present study covers the Indeed code, constants, README, workflow, script and expectations of **one derivative, ts-jobspy**, the metadata of 5 runs and 1 actual artefact; in addition, the rohil01 GraphQL code and reading the blongstaff/firstmate hits. The first GitHub API attempt without network access failed; further public reads were made through authorised network access.

In the GitHub Search API, single pages were checked (max. 30 or 50 results), without enumerating all forks: upstream `indeed cookie` (5), `indeed playwright` (1), `indeed selenium` (1), `indeed rss` (0), `indeed mobile` (2), `indeed browser` (2). The results also include matches in comments and topics about other portals, so the numbers do not mean that many Indeed solutions. Code search with `fork:true`: `selenium path:jobspy/indeed` (0), `playwright path:jobspy/indeed` (0), `cookies path:jobspy/indeed` (0), `browser_cookie3 JobSpy` (0), `"m.indeed.com" JobSpy` (0), `cf_clearance JobSpy` (1, concerned hiring.cafe), `playwright filename:__init__.py JobSpy` (5, no Indeed confirmation), `"/rss" indeed JobSpy` (20, no verified variant in this sample). The global `indeed playwright filename:indeed.py fork:true` returned 38 files, of which only the metadata of the first 30 was read; they are not an audit of code or of JobSpy forks. In addition, three web queries limited to GitHub served for discovering sources, not as evidence of effectiveness.

GitHub Search depends on indexing and does not cover every branch, file or private repository. None of the described approaches was tested here locally against Indeed. The number of relevant senior PHP ads available from Poland was not established.

## Criterion for the next experiment

Record separately the HTTP status, content type, time, number of physical requests, GraphQL `errors`, presence of `data.jobSearch.results` and the number of results. HTTP 200 alone is not enough. Success with 5 ads will confirm the availability of the sample, not a complete source sync. If a block or error occurs, do not treat it as zero offers or as source ads having expired. Only an identified error type will justify trying one more variable: the older field selection, the en-US locale, Node transport or a browser session.
