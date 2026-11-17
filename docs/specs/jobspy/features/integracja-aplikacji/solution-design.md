# JobSpy integration with the application — solution design

Status: implemented and verified offline, 2026-11-02. Covers [R-I01–R-I08](requirements.md). Paths are relative to the application repo, except for the named fork copy. Live stays disabled. The contracts below describe the implemented approach; the check results are given at the end.

## Boundaries and distribution

The Node worker starts the installed Python process without a shell. The script `scripts/jobspy-runner.py` reads a single JSON input from stdin, validates `IndeedRequest` and writes `RunResult` as one JSON. On error it returns a fixed code/message, without the payload or traceback. Web does not run this script.

The verified fork wheel with the local version `1.4.1+oferty.1`, its SHA-256, and requirements with hashes taken from `uv.lock` go into `integrations/jobspy/`. This is a distribution of the dependency, not a second editable copy of its code. The canonical code stays in the separate GitHub fork. The manifest names the base, the contract version and the fork commit. The `worker` image extends the existing Node image with Python/venv and installs the hashed dependencies and the local wheel without resolving dependencies again. `.local` is excluded from the Docker context.

## Process and contract

`lib/sources/jobspy.ts`: start parameters: search_term=Senior PHP, country_indeed=poland, location=Poland, limit=50, the other fields at their defaults, and the HTTP policy of contract 1. The fingerprint covers the source name, the adapter version and the query. Changing the parameters creates a new scope; it does not assume market completeness.

`JOBSPY_ENABLED` is false by default. Only the value `true` allows manual enqueue and execution. No automatic schedule. `JOBSPY_PYTHON` points to a specific interpreter in the image, and `JOBSPY_RUNNER_PATH` to the script. We pass no arguments from a shell and no path controlled by a user request. Timeout of the whole process: 120s; output: 8MiB for stdout/stderr combined. When exceeded, we terminate the process group and wait for it to end. The environment is built from an allowlist, without inheriting secrets. Stderr is only counted, not logged or stored.

Zod validation checks schema_version=1, source=indeed, explicit constants upstream_revision and fork_revision matching the manifest, dates with a time zone offset, explicit stop_reason and warnings codes, the types of counters/status, and that query is identical to the scope parameters. We validate records separately; id must be a stable Indeed identifier, and the URL must lead to Indeed over HTTP(S). Bad records and duplicates increase diagnostics and partiality. A failed envelope with records is not treated as a successful read. The source JSON does not reach the error text.

## Queue and persistence

The new `lib/sources/jobspy-sync.ts` uses the existing source_scopes/runs/ads/revisions/run_seen tables and a separate queue `source-indeed-jobspy`. State and locks apply to the whole Indeed source, not just the fingerprint; a single active run is protected by an advisory lock at enqueue, a separate execution lock and a repeated status check. Delivery of a finished run does nothing.

Shared offer saving and the transaction are extracted from `sync.ts` into `lib/sources/store.ts`; the SOLID paging and expiry logic stays in the old importer. Its recovery is limited to scopes with source=solid-jobs, so that it does not take over Indeed runs. JobSpy has its own recovery.

The migration adds a nullable `diagnostics jsonb` to source_sync_runs. JobSpy saves the contract metadata without the jobs list, together with the number of rejections/duplicates from the TS adapter. Status complete means a completed query with no known gaps; limited/partial maps to partial and keeps the exact state in diagnostics. Failed stays failed. We never perform availability updates for unseen Indeed ads.

The normalised payload adapts the record to the current reader: jobOfferKey, title, company, description, locations, salary, validFrom, experienceLevel. It keeps the full JobSpy record in `sourceRecord` and explicit qualification unknowns. It does not add the fetch date to the hashed content, so that a mere repeated read does not generate a revision. Source=indeed, external_id=canonical id without the `in-` prefix. We do not automatically merge records with SOLID.Jobs.

Salary gets an additional optional field origin. Absence of this field keeps the existing SOLID behaviour. portal_estimate/unknown is an unknown for the financial filter; the label stays with the amount. The JobSpy contract type is not mapped to B2B/UoP. is_remote=false does not confirm an office: hybrid work is possible. Seniority and technologies are not guessed from the query; the view marks criteria that need checking.

## Operation and verification

A separate CLI `jobspy:sync [--wait]` and `jobspy:status [run UUID]`; status shows disabled without starting the process. The read-only API `/api/sources/jobspy` shows enabled and the last result; the offer list signals this source's state separately. The worker registers the queue and recovery, but does not request anything by itself.

The tester received the finished code and sole responsibility for the new tests/fixtures. Process tests use synthetic programs; integration tests substitute the envelope and use an isolated Postgres. The suite covers R-I01–I08 and SOLID-only regressions. Live stays disabled; `.env` was not changed to activate it.

Results: 173 application tests including integrations PASS; 40 fork tests PASS, also from the package in the worker; lint, typecheck, Nuxt build and the worker image PASS. The diagnostics migration applied; worker healthy; status and offer APIs HTTP200 with enabled=false, scheduled=false. The test of the full Node→Python→JSON boundary was run on a substituted transport. No live attempts or Indeed imports into user data were made.

Clarification: the date parser accepts an explicit time zone offset (instances of the same time), not only the Z notation. The fork emits UTC. This does not change date comparison. We run the integration test files one after another, because their PostgreSQL schemas isolate data but not advisory locks.
