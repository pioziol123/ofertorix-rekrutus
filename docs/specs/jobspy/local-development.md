# Local work on the JobSpy fork

Date: 2026-11-02. Repository: https://github.com/pioziol123/JobSpy, original: https://github.com/speedyapply/JobSpy.

Confirmed base: `68b88d6909a2342ad75fbb945c4204a3a7ed6665` (2026-10-27), package `python-jobspy` 1.4.1. The local copy in `.local/JobSpy` is a separate Git repository, ignored by the application repo. `origin` points to the fork, `upstream` to the original. We review application and fork changes separately. It is not yet a runtime dependency of the application.

Branch of the first change: `codex/indeed-salary-provenance`. After the owner's explicit consent, commit `0f2540e0919f4506bec15fe9ae5a17b1246565d6` was published. Current fork version: `1.4.1+oferty.1`. Status: `git -C .local/JobSpy status --short`. The fork's main branch was not changed.

Environment: Python 3.13, uv, `.venv` inside the fork. `uv.lock` pins the test environment's dependencies; the upstream `poetry.lock` stays unchanged. The uv cache lives outside the repo, e.g. `/tmp/oferty-jobspy-uv`.

```sh
git clone https://github.com/pioziol123/JobSpy.git .local/JobSpy
git -C .local/JobSpy checkout codex/indeed-salary-provenance
git -C .local/JobSpy remote add upstream https://github.com/speedyapply/JobSpy.git
UV_CACHE_DIR=/tmp/oferty-jobspy-uv uv sync --project .local/JobSpy --python 3.13 --all-extras
cd .local/JobSpy
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/ruff check jobspy tests
.venv/bin/mypy
```

For an exact reproduction, use the commit from the [package manifest](../../../integrations/jobspy/manifest.json). The application repo contains the wheel and an export of the pinned dependencies; the worker does not need the local copy `.local/JobSpy`. We do not add the whole copy or its environment to the application repo.

## Integration in the application

The worker image contains the interpreter `/opt/jobspy/bin/python` and the verified package. Web stays without Python. JobSpy is not covered by an automatic schedule; the source is disabled by default.

- Status: `docker compose exec worker pnpm jobspy:status`; the page "Synchronizacje" shows its syncs.
- Future manual request: `docker compose exec worker pnpm jobspy:sync --wait`, only after access is settled and after explicit activation in the configuration. When disabled, the command ends without starting Python and without a request in the queue.
- A configuration change requires recreating the containers that read the flag. Activation has not been set in `.env`.
- Integration tests (`RUN_INTEGRATION=1`) run the files one after another: PostgreSQL advisory locks are shared across the database, despite the separate schemas for test data. Ordinary unit tests stay parallel.

A synthetic transport test of the full path Node → installed Python → JSON → Zod was run in the container, without access to Indeed and without saving offers to the user's database. The live trial remains in Beads `oferty-pracy-y81.5`, the HTML scraper in `oferty-pracy-y81.8` as the last stage.

## Access to Indeed

No scraping attempts were made. [Indeed's terms, D.21](https://www.indeed.com/legal) restrict automated access without written consent, except for specific indexing that complies with robots.txt. Permission for the scope used by JobSpy has not been confirmed. We test the code on synthetic samples; the regular importer stays inactive.

The official [API access guide](https://docs.indeed.com/getstarted/integrate-and-call-apis) leads to the [partner programme](https://partners.indeed.com/). We need to ask for consent to search and to store offers locally for a personal project; merely creating an application/OAuth does not confirm the right to every resource. The owner has been informed of this dependency. No application was sent on their behalf.

## Access update — 2026-11-02

The owner confirmed obtaining consent from LinkedIn and Indeed with a limit of one query/s. The description of missing consent above is historical. In the application we count all requests and retries, keep a 2 s gap, and serialise runner runs on the shared documents volume. LinkedIn is activated for a manual pilot. Indeed HTML remains a separate task; GraphQL stays disabled. Running the library directly outside the runner does not use the application's lock.
