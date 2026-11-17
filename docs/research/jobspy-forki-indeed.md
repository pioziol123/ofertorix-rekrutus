# JobSpy: forks, PRs and Indeed blocks

Research date: 2026-11-03. Research of public code and the GitHub API; downloaded code was not run and no attempts were made to fetch offers from Indeed. Local project state passed to the study: Indeed HTML returns 403 even with a Chrome User-Agent, and the GraphQL path does not work. This is context, not a new measurement in this study.

## Conclusion

The most concrete candidate for selective reuse is **cspenn/jobsniffer**: it really replaces `requests`/`tls_client` with a `curl_cffi` client with `impersonate="chrome"`, and it handles Indeed through search HTML, `/viewjob` details and a fallback GraphQL. Changing the TLS fingerprint is something different from merely swapping the User-Agent. The code confirms that the mechanism exists, but does not prove that it will break through the current 403 from our IP or that it works for Polish senior PHP offers. [Transport commit](https://github.com/cspenn/jobsniffer/commit/8f8b019c993cd5bf9538382bb7776644e9d0cdcf), [HTTP client in the examined state](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/http/curl_client.py), [Indeed flow](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/__init__.py).

In the described public sample, no fix was found with credible evidence that it removes the **current** 403 problem for Poland. This does not mean that no such fix exists anywhere.

## Scope and limitations of the review

- The first 100 forks by star count and the first 100 newest were read: 117 distinct repositories. This is metadata, not an audit of the whole code of 117 forks. Sources: [API stars](https://api.github.com/repos/speedyapply/JobSpy/forks?sort=stargazers&per_page=100), [API newest](https://api.github.com/repos/speedyapply/JobSpy/forks?sort=newest&per_page=100).
- The first 12 by stars and the 22 newest were selected; after removing duplicates: 32 forks. Reading `jobspy/indeed/__init__.py` succeeded for 25 forks and upstream. In 20 forks the file had exactly the same Git blob SHA as upstream (`c1783d399e156e239b0b7f3e7f3f82de3deefd04`). This is a comparison of one file; it does not rule out transport changes in other files.
- In the five other available files — `0Darkn/JobSpy`, `jerrison/JobSpy`, `ashishpatel26/jobspy`, `WideSu/JobSpy`, `dantekelly/JobSpy` — the endpoint remained `https://apis.indeed.com/graphql`; no mechanism resolving HTML 403 was found in the module itself. The other seven reads did not yield a file at that path, which does not mean there is no implementation.
- So the recursive trees of `cspenn/jobsniffer` and `rohil01/JobSpy` were also checked: both have `src/jobsniffer/indeed/{search,graphql,detail,parse}.py` and tests. The implementation and transport of **cspenn** were read in detail, not both whole repositories. [cspenn tree](https://github.com/cspenn/jobsniffer/tree/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer), [rohil tree](https://github.com/rohil01/JobSpy/tree/fc3c3cd81f7eca513d249bf6cc5612e9a19cd480/src/jobsniffer/indeed).
- Upstream queries returned 93 issues/PRs for `Indeed`, 21 for `403` and 5 for `cloudflare`; the sets overlap. Titles and relevant content were reviewed, not all comments on all issues. [Indeed](https://github.com/speedyapply/JobSpy/issues?q=Indeed), [403](https://github.com/speedyapply/JobSpy/issues?q=403), [Cloudflare](https://github.com/speedyapply/JobSpy/issues?q=cloudflare).

Dates and order are data returned by GitHub, not a separately established deployment history. Updates visible in the API are not evidence that the scraper currently works. Private forks and commercial scraper catalogues were not used.

## Candidates and quality of evidence

| Candidate | What it actually changes | Meaning for the local problem | Confidence |
|---|---|---|---|
| cspenn/jobsniffer, commit `8f8b019…` and examined state `0dafb16…` | `curl_cffi`, Chrome TLS fingerprint, a shared HTTP interface | Worth extracting as a transport experiment; it is a real difference compared with a Chrome UA in an ordinary client | High for the code content; no evidence of effectiveness with our IP |
| cspenn HTML search + detail | Parses `mosaic-provider-jobcards`, fetches the full content through `/viewjob`; a missing provider or an HTTP error means a block | The parser and separating a block from a true zero results are useful; the parser alone does not remove the 403 | High for the code |
| cspenn GraphQL fallback | After a block on the first HTML page, it falls back to the old GraphQL | Gives no way out if both local paths already fail | High for the flow; no fresh live evidence |
| upstream PR #306 | Limiter with `threading.Lock`, `time.monotonic`, a random interval, a separate instance per session | The idea can be reused, but not copied as a guarantee of all HTTP ≤1/s | High after reading the diff; PR open |
| upstream #403/#409 | Filters, salary, hours and passing the User-Agent | Correctness of data and configuration; no evidence of fixing the block | High for the scope of the commits |

Table sources: [search.py](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/search.py), [graphql.py](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/graphql.py), [PR #306, diff](https://github.com/speedyapply/JobSpy/pull/306/files), [commit #403](https://github.com/speedyapply/JobSpy/commit/ca1f50580032efabef42c152ee6ca48ae4dc2928), [commit #409](https://github.com/speedyapply/JobSpy/commit/655ec04663b798742704f1038262b631cd1988f2).

## What the fork promises and what the code confirms

The fork's `graphql.py` describes a historical check returning HTTP 200 and real offers, and warns that the shared access credentials are not guaranteed to work. The comment refers to a plan from 2026-07-27. This is the author's statement about an earlier attempt, not independent confirmation that it worked on 2026-11-03. The code still uses the same `apis.indeed.com/graphql` endpoint. [Source](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/graphql.py).

The HTML flow has a useful distinction: a response without `mosaic-provider-jobcards` or an HTTP error gives `blocked=True`, while a present provider with an empty list gives a true zero results. The GraphQL fallback follows a block on the first page. After a block on a later page, HTML collection ends and may return the results collected so far; for our model this must be explicitly marked as an **incomplete source sync**. Offer details fall back to the search snippet, which needs a separate marking of content completeness. [SearchPageResult](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/search.py), [page collection and building the offer](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/indeed/__init__.py).

In upstream issue #287, one user described Cloudflare and switching to the paid Apify API, and the maintainer later wrote that Indeed works for him, suggesting a network, proxy or IP problem. These are different observations, and there is no reproducible code fix there. The historical #74 also has a maintainer reply that his test works, with a question about IP quality. Such comments prove neither a universal failure nor a solution to ours. [#287 user](https://github.com/speedyapply/JobSpy/issues/287#issuecomment-3447091632), [#287 maintainer](https://github.com/speedyapply/JobSpy/issues/287#issuecomment-5906557112), [#74](https://github.com/speedyapply/JobSpy/issues/74#issuecomment-1844209037).

## The condition of all HTTP ≤1/s

Neither of the two candidates by itself provides the required hard limit:

- **cspenn**: the client has no global interval; `stamina` has a default `wait_initial=0.5`, at most three attempts and its own backoff. Each attempt must pass through a shared timing gate directly before `_session.request`. Automatic redirects must also be disabled and performed explicitly through the same gate; otherwise libcurl's internal requests remain out of control. This conclusion follows from where the retry is placed and from the single library call. [Code](https://github.com/cspenn/jobsniffer/blob/0dafb16e199f90b547aeae3fddf6d8f523d6e4c6/src/jobsniffer/http/curl_client.py).
- **PR #306**: the limiter belongs to each session and intercepts `RequestsRotating.request()`, while `HTTPAdapter(max_retries=...)` can retry requests below that level. `rate_delay_min=1` alone does not control the whole traffic of many sessions or all retries/redirects. Required: one shared gate, a minimum of 1 s between starts of actual requests, and control of every retry and redirect. [Diff and implementation](https://github.com/speedyapply/JobSpy/pull/306/files), [PR version](https://github.com/itsmeknt/JobSpy/blob/6eb437a3c39b2f12a686436b8df51c235c2a311e/jobspy/util.py).

If a full browser is used, the limit must also cover resources and the browser's automatic requests; a second between navigations alone does not meet the condition for all HTTP. So an HTTP client with explicit redirects is easier to account for. This is a design recommendation, not the result of a test against Indeed.

## Recommendation for Polish senior PHP offers

1. Do not replace the whole of JobSpy with a random fork. If implementing, extract an experimental `curl_cffi` transport based on the indicated commit, keeping the local parser and the shared traffic counter. Do not download or run the whole fork just because it has a newer date.
2. Before any network test, ensure a global ≤1/s for search, details, retries and redirects, and stopping on 403. A delay is not a guarantee of removing the block.
3. Only then assess separately: access to search for Poland/PHP, the content of source ads, seniority and the availability of work from Poland. The examined materials contain no confirmed result for this scope; a number of offers from the USA is not such evidence.
4. On a 403, treat the run as a failed or incomplete sync. Do not treat a block as zero ads or as their expiry. Do not automatically fall back to GraphQL repeatedly, since in the local context this fallback also fails.

Confidence of the recommendation: high that the indicated fork brings a concrete transport change; moderate that it deserves a limited experiment; undetermined for actual effectiveness against the current Indeed block at this location.
