# JobSpy package for the worker

Canonical code: [JobSpy fork](https://github.com/pioziol123/JobSpy/tree/codex/indeed-salary-provenance). The base version, the state of local changes and the checksums are in [manifest.json](manifest.json). The wheel is a ready-made dependency, not a place to edit the library code. It contains the original project's MIT licence.

`requirements.txt` is an export of the local release's `uv.lock`, without the dev groups and the optional MCP, with pinned versions and hashes for the supported platforms/Pythons. Docker installs the dependencies with `--require-hashes --only-binary=:all:`, checks `wheel.sha256`, then installs the wheel without resolving the dependencies again. Version `1.4.1+oferty.4` contains local changes on top of `baseRevision`; `localChanges: true` means they have not been published yet.

When updating, change the code in the separate repo, verify it with the tester, give the fork the next version and build the package. Put the new wheel, the dependency export and the manifest in this directory; keep only the version in use. After an authorised publication, fill in the exact commit and confirm that the package files match it. Check the licence, the checksums, the tests and the worker image build. Do not update automatically from the moving main branch.

Entry into the application: [Python runner](../../scripts/jobspy-runner.py), [process and validation](../../modules/sources/infrastructure/adapters/jobspy/runner.ts), [connector](../../modules/sources/infrastructure/adapters/jobspy/connector.ts), [request and queue](../../modules/sources/README.md#requesting-a-sync). Scope and acceptance: [requirements](../../docs/specs/jobspy/features/integracja-aplikacji/requirements.md).

Running the source stays disabled (`JOBSPY_ENABLED=false`). The Indeed HTML adapter is connected to the runner; a trial of the Indeed Poland list returned HTTP 403, so the source stays disabled until a successful pilot.

The other adapters use contract 2, Indeed keeps contract 1.

- `JOBSPY_SOURCES=bayt` enables the manual Bayt import.
- LinkedIn additionally requires `JOBSPY_LINKEDIN_ACCESS_CONFIRMED=true`, set only after the portal's consent has been obtained.
- Glassdoor, ZipRecruiter, Naukri, BDJobs and HelloWork can be activated in JOBSPY_SOURCES for remote offers from their markets. We assess working from Poland separately; the record's country does not exclude an offer. Google Jobs is unavailable.
- Running: `docker compose exec worker pnpm jobspy:sync --source bayt --wait`.
- Catalogue and latest runs: `docker compose exec worker pnpm jobspy:status`; a specific run: `pnpm jobspy:status bayt <UUID>`.
- Each adapter has a separate queue, lock, scope and history. There is no schedule.
- Limit of a single attempt: 10 HTTP requests, 90 seconds, at most 2 attempts per request; the process has a hard limit of 120 seconds. Bayt does not widen the location after a 404 response.

## Consent and the shared limit

On 2026-11-02 the owner confirmed LinkedIn's and Indeed's consent to scraping at up to 1 query/s. Conservatively, this covers all HTTP, details and retries. The runner requires `DOCUMENTS_DIR` on the shared volume and serialises runs with the `.jobspy-http.lock` file; do not delete it while running. Within a run a 2 s gap is kept, and 1 s before a new run. Without access to the lock, collection is not possible. LinkedIn: manual import active; [pilot](../../docs/specs/jobspy/features/kontrola-zadan/pilot-linkedin.md). Indeed: HTML adapter implemented, live trial blocked by HTTP 403; GraphQL stays disabled. Using the library directly outside the runner does not use the application's lock.
