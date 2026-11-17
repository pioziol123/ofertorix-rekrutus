# Indeed Poland — state of HTML verification

2026-11-02, scope Senior PHP, Poland. Consent and limit previously confirmed by the owner.

## Live observation

One GET request was made to `https://pl.indeed.com/jobs?q=Senior+PHP&l=Polska`, timeout 20 s, redirects disabled. Result: HTTP **403**, a page titled "Blocked - Indeed.com", Cloudflare/CAPTCHA block markers. No retries, logging in, CAPTCHA or infrastructure changes were made. No offers from Indeed were saved. The full response is not a fixture and not part of the repository.

This is a preliminary attempt to access HTML, not a successful pilot of the new adapter nor a confirmation that the selectors are correct against current successful portal responses. A further end-to-end pilot remains task `oferty-pracy-y81.5`; currently `JOBSPY_ENABLED=false`.

## Implementation and limitations

A separate function `collect_indeed_html` uses the DOM and JSON-LD, the existing contract, the HTTP limiter and the shared runner lock. It does not execute JS and does not use GraphQL. Package version: `1.4.1+oferty.4`. The next pilot should use the package in the worker and the ordinary queue; only after a successful read should it assess additional offers, the senior PHP qualification and data gaps.

Offline tests use only synthetic HTML and a substituted transport, with the real limit logic. A separate tester checked the parser, salary origin, pagination, partial results, blocks, consent pages and 429. The results of the final checks were recorded in the Beads task. Passing these tests does not remove the access block.

## Final checks

The tester added 23 HTML tests and a regression test for adapter selection in the runner. Full fork suite: 77 tests; runner: 5 tests. They also cover keeping cards after faulty pagination and removing stale amounts after a faulty salary in the details. Application checks: 67 JobSpy tests, typecheck and lint. The wheel was compared byte by byte with 40 modules of the local code, and the presence of the licence was checked. The changes stay local, with no commit/push.

## Transport experiment with jobsniffer — 2026-11-03

In the running worker we checked `curl_cffi 0.17.0`, `impersonate="chrome"`, without an environment proxy, automatic redirects or retries. One GET of the Senior PHP/Poland search, timeout 20 s, was made under the runner's shared `serialized_import` lock, with a gap of at least 1 s after taking the lock. Result: **HTTP 403**, block markers present, no `mosaic-provider-jobcards` and no `data-jk`. No detail requests or GraphQL fallback were made and no offers were saved. Only diagnostic metadata was saved; the response did not enter the repository.

Changing the TLS fingerprint did not resolve the block in this environment. The production transport and the package were not changed; the source stays disabled. Experiment `oferty-pracy-y81.15` is finished, but a successful adapter pilot and criterion AC7 in `oferty-pracy-y81.8` are still not met.
