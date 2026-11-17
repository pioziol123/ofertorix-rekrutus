# Indeed run contract — solution design

Design of 2026-11-02; [R-K01–R-K06](requirements.md). Code relative to `.local/JobSpy`. The new `jobspy.integration.collect_indeed` takes an `IndeedRequest` model (`extra=forbid`) and returns a `RunResult` model. It does not use Pandas; the existing `scrape_jobs` is kept.

## Semantics

The Indeed adapter keeps the number of skipped records and the stop reason: `exhausted`, `result_limit`, `no_progress`, `page_error`. An empty page with a next cursor is uncertain, not completed. The change concerns only reporting; it does not reconstruct the whole market. Errors give fixed codes, not the content of exceptions or GraphQL responses.

`RunResult`: `schema_version=1`, `source=indeed`, `upstream_revision` (base SHA), `fork_revision` (version of the change contract), `started_at`/`finished_at` (UTC), `query` (an explicit allowlist of input fields), `status`, `stop_reason`, `skipped_jobs`, `missing_descriptions`, `warnings`, `jobs`. `market_complete` is always false. For `status=completed`, the end applies only to the selected query.

Statuses: `failed` for page_error without records, `partial` for page_error with records or known skips, `limited` for result_limit/no_progress, `completed` for exhausted without skips. A missing description downgrades the status to partial but does not turn exhausted into an error. `stop_reason` keeps the original reason for ending; status describes the quality of the result. An undescribed exception gives `unexpected_error` without details. The output is not a basis for expiring offers.

The input explicitly allows setting the phrase, location, country (Poland by default), limit (1–100), publication time, remote and job_type. Other parameters are rejected. The full profile, proxies and headers are not part of this contract. Empty phrases are rejected. Request control will be added in a separate feature before live use.

We serialise records from the `JobPost` model fields, bypassing its flattening serializer, through a Pydantic JSON adapter. `salary_source` keeps its old semantics. Each record gets `site=indeed` and `missing_fields`, currently covering a missing description. All other model fields keep their names and values.

Offline tests verify the R-K01–K06 rules on a substituted transport and the new public entry point. We do not implement global changes to the other adapters or the CLI. The version constants and the current contract are maintained by `FORK.md`/the integration module.
