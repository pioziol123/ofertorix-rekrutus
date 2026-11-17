# Indeed request control — solution design

Design of 2026-11-02 for [R-H01–R-H05](requirements.md). A new module `jobspy/http_control.py` in the separate fork; the existing `RequestsRotating` remains the base, but the new integration does not accept proxies.

Pydantic `RequestPolicy` (`extra=forbid`): `max_requests` default 10 (1–100), `max_seconds` 90 (1–300), `timeout_seconds` 15 (>0, ≤30), `min_interval_seconds` 2 (1–60), `max_attempts` 2 (1–3). Time values must be finite. These are chosen conservative technical limits of the environment, not a confirmation of a rate accepted by Indeed.

`ControlledRequests` keeps a monotonic deadline and an attempt counter. It disables automatic redirects, so that the requests library does not make extra requests outside control. Each attempt reserves the counter before calling the transport; the timeout is the minimum of the setting and the remaining time. The minimum gap applies to the starts of attempts on pages and retries. Backoff is 1, 2 seconds, bounded by the budget and the minimum gap; a valid Retry-After takes precedence.

`RequestStopped` carries a fixed safe code: `request_limit`, `deadline`, `rate_limited`, `transport_error`. The adapter keeps the fetched offers and the code. The contract output has `request_count`; request_limit/deadline is limited, rate_limited/transport_error is failed without offers and partial with offers. Skipped offers and missing descriptions can additionally give partial. Any other HTTP error goes to the existing page_error, without exposing the payload.

`Indeed(policy=None)` keeps the existing transport for compatibility with the old `scrape_jobs`; `collect_indeed` passes the explicit `request.http`. After the read finishes, we close the session. This is not a global limiter across many processes; on first enablement the application will have to ensure one active run per source and a hard process timeout. The next integration stage stays inactive until access is settled.

Verification: a substituted monotonic and wall clock, a sleep that advances time, requests responses and exceptions, no network. Checks of the number of attempts, delays, Retry-After, no retry of 403, and the transition to a partial result. The contract and salary tests remain regression tests of the whole fork.

## Shared application lock — 2026-11-02

R-H06–R-H07: the runner uses `flock(LOCK_EX)` on `DOCUMENTS_DIR/.jobspy-http.lock`, on the shared Docker Compose volume. It holds the lock for the whole read and waits 1 s before starting. The file is not deleted, so as not to change the inode. The system also releases the lock after the process is killed; the new holder waits 1 s again. Within a run we keep the existing synchronous HTTP control with a 2 s gap, disabled redirects and bounded retries. The same rules apply to fetching LinkedIn details. Waiting for the lock counts towards the hard 120 s process limit; an overloaded import may end with an error instead of making additional requests.

Node passes only the `DOCUMENTS_DIR` path in addition to the existing minimal environment, without secrets. A missing directory/env or inability to open the lock causes a safe runner error before the network. This guarantee applies to the application runner on one shared volume, not to independent installations or direct use of the library. A new deployment on a separate host requires a shared limiter or disabling parallel import. Offline tests cover parallel processes, the gap between runs, release after a failure and a lock error; the existing HTTP tests cover gaps and retries.
