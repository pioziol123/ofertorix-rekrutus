# Indeed request control — requirements

Selected 2026-11-02, [PRD](../../PRD.md). Scope: a new Indeed integration entry point, without changing the behaviour of the other sources.

- **R-H01:** the caller sets finite limits on the number of HTTP attempts, the run time, the time of a single request and retries, and a minimum gap. Invalid and unbounded values are rejected before the network.
- **R-H02:** every attempt, retries included, consumes the shared limit. After the limit or the time is reached, no further request starts. Saved results stay available with the limitation marked. Waiting does not deliberately extend the run beyond the budget.
- **R-H03:** only timeouts/connection errors and 429/500/502/503/504 responses are retried. Other errors, including 403, do not trigger automatic IP rotation or retry loops. The maximum number of attempts includes the first request.
- **R-H04:** a valid Retry-After (seconds or an HTTP date) is respected. If the wait does not fit in the remaining budget, the run ends with an explicit reason; we do not ignore the header. A missing or invalid header triggers a bounded backoff.
- **R-H05:** the output shows the number of attempts made and the reason for stopping. The transport does not add secrets or exception content to the output. Clock and transport tests make no real delays or connections.

The time limit is a cooperative control: requests get a timeout bounded by the remaining budget. Hard termination of the process when DNS/the system hangs will be the responsibility of the later application adapter. We do not promise such a guarantee at the level of a single library session.

## Confirmed consent and limit — 2026-11-02

The owner confirmed obtaining consent to scraping LinkedIn and Indeed with a limit of one query per second. This is the owner's declaration, without a copy of the terms in the repo. Conservatively, the limit covers all HTTP requests: search, result pages, details and retries, for both portals together.

- **R-H06:** the application serialises all JobSpy runs on one shared volume. Within a run it keeps a gap of at least 2 s; between runs at least 1 s, also after an error or after the previous process was killed. No access to the lock prevents connections.
- **R-H07:** LinkedIn can be activated manually after the confirmation is recorded. Consent to scraping Indeed unblocks the planned HTML adapter; it does not activate the current GraphQL one. The absence of a schedule stays unchanged.
