# Cloudflare: diagnosis and options for connectors

Documentation as of: 2026-11-03. Primary sources only; this research did not make new attempts to fetch the protected portals.

## What the current result confirms

The reported result of an earlier test: `bulldogjob.pl/companies/jobs` and `theprotocol.it/praca` responded with `403` and `cf-mitigated: challenge`, also after setting Chrome headers. `bulldogjob.com` responded with `200`, and for No Fluff Jobs a different User-Agent was enough. These are observations of single requests from the earlier test, not a guarantee of lasting availability or proof that the problem is solved in all connectors.

Cloudflare documents `cf-mitigated: challenge` as the identifier of a challenge page served instead of the expected response. Its content type is `text/html`, even when another resource was requested. The `403` status alone is not enough for such a precise diagnosis. Source: [Detect a Challenge Page response](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/).

**Conclusion:** a challenge response does not deliver source ads. It is no basis for treating them as expired; the sync run must be marked as incomplete.

## What may help and what its limits are

| Option | What it actually brings | Limitation |
|---|---|---|
| A correct User-Agent and consistent headers | May remove a simple cause of refusal. | In the two cases discussed they were not enough. Headers do not provide a browser environment or JavaScript execution. |
| `curl_cffi` / impersonation | The project reproduces browser TLS and HTTP/2 signatures; this is more than changing the User-Agent. | The authors explicitly make success depend on the protection configuration: TLS/HTTP2 is only part of the signals, alongside IP, frequency and JS fingerprints. There is no guarantee it works for these portals. |
| The user's ordinary browser | Cloudflare requires JavaScript and cookies to be enabled to pass the challenge. | Successfully opening the page by hand does not confirm that an unattended connector works. |
| Browser automation | Provides a JS engine and a page rendering environment. | Cloudflare does not support automated browsers or Selenium/Puppeteer/Playwright/Cypress for solving production challenges. It is not a reliable solution. |
| An exception agreed with the portal owner | The operator can disable the challenge for an agreed client, e.g. an allowed IP, through a suitable exception or a Skip rule. | Requires the operator's cooperation and matching the exception to the product that blocks the traffic. |

Table sources: [curl_cffi — capabilities](https://curl-cffi.readthedocs.io/en/latest/), [curl_cffi — FAQ on Cloudflare](https://curl-cffi.readthedocs.io/en/latest/faq.html), [Cloudflare — Resolve a Challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/), [Supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/), [Troubleshooting and exceptions](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/).

## The most predictable path

**Design recommendation:** for a source covered by a challenge, first establish with the portal an available API/feed, or consent and access terms for the connector. Technical access alone does not settle the terms of further use of the data. If the portal allows fetching, agree a suitable exception on the operator's side, instead of assuming that changing the library will ensure lasting availability.

Cloudflare states that only the site owner can change the configuration so that the challenge stops being presented. A Skip rule should precede the blocking rule and skip the relevant protection layer. Skip supports, among others, Managed Rules, rate limiting and Super Bot Fight Mode; **it cannot skip Bot Fight Mode**. Sources: [Resolve a Challenge](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/resolve-challenge/), [Configure a Skip rule](https://developers.cloudflare.com/waf/custom-rules/skip/), [Available skip options](https://developers.cloudflare.com/waf/custom-rules/skip/options/).

Until access is agreed: keep the previously fetched data, report the source block and do not interpret the absence of results as a complete sync. This is an error-handling recommendation for the project, not a method of removing the challenge.

## Have the other connectors already solved this?

The local package [JobSpy 1.4.1+oferty.4](../../../integrations/jobspy/python_jobspy-1.4.1+oferty.4-py3-none-any.whl) contains various access mechanisms (line numbers refer to files inside the wheel archive):

- `jobspy/util.py:77–84`: `TLSRotating` uses `curl_cffi` with `impersonate="chrome"`; Glassdoor (`jobspy/glassdoor/__init__.py:53`) and ZipRecruiter (`jobspy/ziprecruiter/__init__.py:39`) use it.
- LinkedIn uses `RequestsRotating(..., clear_cookies=True)` (`jobspy/linkedin/__init__.py:52`) and the `jobs-guest` endpoint (`:71`).
- Indeed points to `https://apis.indeed.com/graphql` (`jobspy/indeed/__init__.py:41`) and, when the control policy is enabled, uses `ControlledRequests` (`:61`).

This confirms TLS impersonation in some connectors and different endpoints in others. **It does not confirm a universal solution to the Cloudflare challenge.** A `200` result for another portal or domain does not prove it either. Confirming that a specific connector works requires a successful fetch of a real list and of ad details; the current test remains separate from a guarantee of lasting availability.

## Update: working curl_cffi transport

On 2026-11-03 reading Bulldogjob **.pl** and theprotocol from the container was confirmed via curl_cffi with a Chrome/Safari profile and HTTP/2, without the owner's cookies. The list, the second and last page, a filter and a detail returned 200 and application data. Plain requests, plain curl HTTP/2 and the Chrome profile forced to HTTP/1.1 still received a challenge. The earlier technical block was resolved in a diagnostic sample. [Results, limitations and reproducers](dostep-http-rozwiazanie.md). Connectors and full import have not been implemented yet.
