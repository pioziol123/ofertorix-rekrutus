# JobSpy — assessment of the library and its fit for the project

Read on: **2026-11-02**. Examined: [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy), files of the `main` branch; the `pyproject.toml` that was read declares **1.4.1**. The SHA of this set of files was not confirmed: the GitHub tree and history pages returned older, mutually inconsistent views compared with the raw files. This analysis must not be equated with a specific PyPI release or a historical commit. [Package metadata](https://github.com/speedyapply/JobSpy/blob/main/pyproject.toml).

This is an analysis of the README and code, without installation, running scrapers or attempts to access portals. "Supports" means the presence of an implementation/declaration, not fetching effectiveness confirmed today. The report is research material, not a decision to add a source.

## Assessment

**Conclusion:** JobSpy can shorten an experiment with additional LinkedIn and Indeed ads, but it needs its own adapter, quality control and handling of incomplete results. It does not replace the existing SOLID.Jobs importer. The biggest problems for the current PHP Senior scope are text search instead of catalogue filters, no guarantee of completeness, and the differences between the Polish employment model and the library's schema. The reasons and the limits of this assessment follow below.

## What it provides

JobSpy is a local Python library for fetching ads from many portals and normalising them into a Pandas table. It is not an offer database run by an operator, nor a ready-made application for managing recruitment. The README also describes a CLI and an MCP server and warns about source blocks. [README](https://github.com/speedyapply/JobSpy#readme).

The package requires Python ≥3.10; it depends on `requests`, BeautifulSoup, Pandas, Pydantic, `curl_cffi` and `markdownify`. It has the `jobspy` and `mcp-jobspy` commands. This is an additional runtime besides our TypeScript/Node. [pyproject.toml](https://github.com/speedyapply/JobSpy/blob/main/pyproject.toml).

### Sources and Poland

| Source | State declared / visible in the code | Meaning for this project |
| --- | --- | --- |
| LinkedIn | Global search through `location`. | A candidate for additional ads available from Poland; the location does not prove the right to work from Poland. |
| Indeed | The list of supported countries includes `Poland`. | The most direct candidate for an experiment on the Polish market. |
| Glassdoor | Poland is not marked as supported in the README and does not appear in the domain map. | Do not assume support for `country_indeed="poland"` for this source. |
| ZipRecruiter | USA/Canada. | Little usefulness for the Poland scope. |
| Bayt / Naukri / BDJobs / HelloWork | Middle Eastern markets, India, Bangladesh and France respectively. | The presence of a source does not mean coverage of the Polish market. |
| Google Jobs | The implementation still exists, but the README says the source is unavailable. | Do not plan it as a working source. |

The geography is declared by the [README](https://github.com/speedyapply/JobSpy#supported-countries-for-job-searching); the absence of Poland is confirmed by the [Glassdoor map](https://github.com/speedyapply/JobSpy/blob/main/jobspy/glassdoor/constant.py). The library contains no adapters for SOLID.Jobs, Just Join IT, No Fluff Jobs, Bulldogjob or theprotocol.it — it does not automatically extend our coverage of these portals. [Adapter map](https://github.com/speedyapply/JobSpy/blob/main/jobspy/__init__.py).

## Architecture and network

`scrape_jobs()` validates arguments through Pydantic, creates one adapter per portal and runs the adapters in parallel through `ThreadPoolExecutor`. It then flattens the ads into a DataFrame and sorts by source and date. **It does not merge the same offer across portals.** The `results_wanted` parameter applies to each source separately. It attaches `attrs["errors"]` and `attrs["warnings"]` from the adapters to the table. It adds no persistent storage, history or scheduler. [Orchestrator](https://github.com/speedyapply/JobSpy/blob/main/jobspy/__init__.py).

An important difference from the description "default is all": the default list of the library function includes all `Site` values **except Google**. The CLI has yet another default set: Indeed, LinkedIn, ZipRecruiter, Glassdoor. For integration, the sources must be given explicitly. [Input model](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py), [CLI default sources](https://github.com/speedyapply/JobSpy/blob/main/jobspy/records.py).

### LinkedIn

The adapter fetches the HTML of the anonymous endpoint `jobs-guest/jobs/api/seeMoreJobPostings/search`, without an account or OAuth. It sends the phrase, location, distance, time filter, easy apply and optional company identifiers. **The current code ignores `is_remote` and `job_type`, recording a warning**. It deduplicates identifiers within one run. The 3–7 second pauses apply to successive search pages; they are not a general limiter for every request. Page errors stop the run with the results so far. [LinkedIn adapter](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py).

`fetch_description=True` adds a GET of the page of each ad. Only the details provide, among others, the description, seniority and type of work. A details error can leave the ad without these fields, with only a log entry. Parsing relies on specific HTML classes and English criterion names. **Conclusion:** a change to the page or its language can reduce completeness without losing the whole record. [Details code](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py).

The constants set 10 cards per page and a start limit of 1000. The salary parser expects a characteristic format; the description heuristic looks for dollars, not Polish PLN salary ranges. [LinkedIn constants](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/constant.py).

### Indeed

The adapter sends a GraphQL POST to `https://apis.indeed.com/graphql`, pages with a cursor, deduplicates ad keys and fetches descriptions together with the results. It supports country/location, time, job type, remote and easy apply; remote excludes the hybrid attribute. A network or page validation error ends fetching with a partial result. [Indeed adapter](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/__init__.py).

The code has a key stored in the repo in the `indeed-api-key` header, and headers imitating the Indeed iOS app. The query fetches up to 100 entries and sorts by relevance. **Conclusion:** this is a dependency on the portal app's interface and constants; the presence of GraphQL is not evidence of an official, stable API contract for our application. [Query and headers](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/constant.py).

### Google

The remaining adapter parses the `google.com/search` page with `udm=8`, then an internal callback and nested result structures. `google_search_term` overrides the built phrase. The code limits the count to 900 and deduplicates URLs. **Conclusion:** the presence of code and an enum value does not confirm that it works; the negative statement in the README matters for choosing a source. [Google adapter](https://github.com/speedyapply/JobSpy/blob/main/jobspy/google/__init__.py).

### Proxies, logging and retries

The shared layer rotates the given proxies on requests; `localhost` means a connection without a proxy. The default timeout is 15 s; the User-Agent and the CA file can be overridden. For some adapters there is a `curl_cffi` session with Chrome impersonation; LinkedIn and Indeed use `requests`. No retry/backoff or respect for `Retry-After` was found in the shared layer. The logging levels are errors / warnings / info. [HTTP layer and logs](https://github.com/speedyapply/JobSpy/blob/main/jobspy/util.py).

**Conclusion about the data flow:** a local process sends queries to the selected portals. Using an external proxy adds another service to this flow; JobSpy neither provides nor pays for proxies. There is no need to send the CV, the professional profile or the application history. The terms of proxy providers were not examined separately.

## Data schema and the PHP Senior filter

The model includes an identifier/source, source and target URLs, title, company, location, date, description, job type, remote, seniority, salary with currency and period, and additional information about the company/skills. Most fields are optional. The serializer turns the location into text, and lists such as `skills` and `job_type` into comma-separated text. This is not a lossless transport of an object domain model. [JobPost and serializer](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py).

There are no separate input filters for technologies, seniority, salary, working language, geographic eligibility or Polish UoP/B2B (employment contract/B2B contract). `job_type="contract"` does not confirm B2B. The text query `Senior PHP` must be treated as a search for candidates, not an equivalent of the SOLID.Jobs Developer/PHP/Senior filters. A missing criterion remains an unknown. [ScraperInput](https://github.com/speedyapply/JobSpy/blob/main/jobspy/model.py).

**A significant salary pitfall:** Indeed chooses the employer's salary and, when it is missing, may use the portal's own estimate. The function returns only the amounts/currency/period without marking this difference. Conclusion: not every amount may be treated as a salary range given by the employer; the adapter must be fixed or proof of origin must be kept. [Indeed salary extraction](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/util.py). Automatic annualisation must also not be used as a comparable Polish gross/net salary.

## Completeness, quality and maintenance

`errors`/`warnings` in `attrs` are useful, but **they are not evidence of a complete source sync**. Adapters can skip individual faulty ads or fail to fetch details, using an ordinary `log.warning`, outside the `warnings` list. With an empty next page, LinkedIn allows both the end of results and throttling. Our own importer must keep this uncertainty; the absence of an ad does not prove its expiry. [LinkedIn](https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/__init__.py), [Indeed](https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/__init__.py).

The CLI returns code 0 also after a response with no offers and when at least some of the sources respond. Code 1 means total failure with an empty set. The exit code alone is not enough to assess each source. The default stdout is selected JSONL fields; a full export also does not carry the `DataFrame.attrs` metadata. [CLI](https://github.com/speedyapply/JobSpy/blob/main/jobspy/cli.py), [serialisation/export](https://github.com/speedyapply/JobSpy/blob/main/jobspy/records.py).

The confirmed CI workflow builds and installs packages on Python 3.10–3.14, checks import/CLI/MCP startup, and runs Ruff and strict mypy. This workflow has no parser tests on fixtures and no portal contract tests. A separate, comprehensive functional test suite was not confirmed. CI was not run and its current result was not assessed. [CI](https://github.com/speedyapply/JobSpy/blob/main/.github/workflows/ci.yml).

**Assessment:** typing, validation and diagnostics help with integration, but give no guarantee that the scrapers withstand portal changes. The `main` version should not be updated automatically in production. This reading did not establish the release cadence, maintainer response time or any support guarantee.

## Licence and access to data

The code is under MIT: it allows using and modifying the library, keeping the author and licence notice in copies/substantial portions. It is provided without warranty. [LICENSE](https://github.com/speedyapply/JobSpy/blob/main/LICENSE).

**Limit of the findings:** the library's licence is not consent from the portal operators to systematic fetching, storing or republishing of ads. No separate analysis of the LinkedIn/Indeed/Google terms of service was done here. The technical possibility of an anonymous request or of proxy rotation does not settle the terms of permitted use. This report gives no legal assessment and no confirmation of rights to the data.

## Possible integration with the current application — proposal

The current project has a separate worker, pg-boss, PostgreSQL and versioned `source_ads`/`source_ad_revisions` and run statuses. It keeps an explicit PHP Senior scope in SOLID.Jobs. These boundaries remain appropriate also for an experiment with JobSpy. [Fetching design](../specs/pierwsza-wersja/features/pobieranie/solution-design.md), [architecture](../specs/pierwsza-wersja/architecture.md).

Proposed variant, requiring a separate implementation decision:

1. The Node worker dispatches a controlled Python process or a local container with a pinned version. A separate job for one portal and scope; explicit `site_name`, a result limit and a timeout for the whole process. Nuxt remains the user interface.
2. A small library wrapper returns a JSON envelope: `schemaVersion`, source, parameters, JobSpy version, execution dates, ads and **separate errors/warnings and missing details**. Do not base the protocol only on the CLI/stdout or the exit code.
3. A TypeScript adapter validates the envelope and maps `source + external_id`, and stores revisions and observations idempotently. Mark the JobSpy result as a normalised payload, not the portal's original response. Keep the origin of amounts and of qualification rules.
4. Do not treat a limited relevance-sorted search as a complete sync. Define a separate semantics of "finished reading a fixed query" without automatically marking unseen entries as unavailable. Keep errors and partial results in the existing run model.
5. Before admitting the source: check the access terms, prepare parser and transport fixtures, settle retries/limits and run a small authorised trial for Poland/PHP Senior. Measure missing descriptions, salary estimates, duplicates and the actual additional offers compared with SOLID.Jobs.

**Research recommendation:** if we add this tool to the plan, start with one isolated Indeed Poland experiment; assess LinkedIn next. Keep the current working SOLID.Jobs import and do not promise full market coverage based only on JobSpy's list of portals.
