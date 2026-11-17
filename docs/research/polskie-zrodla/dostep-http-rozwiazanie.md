# Working read of Bulldogjob and theprotocol — 2026-11-03

## Result

**Both portals, `bulldogjob.pl` and `theprotocol.it`, were read successfully from the worker container.** The `curl_cffi 0.17.0` already in the project, a Chrome or Safari profile and HTTP/2 were enough. No browser, owner cookies/tokens, proxies or external solvers were used. This is a successful diagnosis and a sample of the read protocol; no connectors were implemented in the application and no full import into the database was made.

In total 29 HTTP requests in three sequential series, gaps of at least 2 s, timeout 20 s, without redirects or automatic retries. Each trial had a fresh session, `trust_env=False`. The scripts keep only response summaries and the field structure; the first one temporarily saves the public Next.js state inside the container so that later trials can pick existing IDs and the buildId. The results contain no cookies. Times in the results are UTC.

## What decides the result in this sample

For both protected domains:

| Transport | HTTP | Result |
| --- | --- | --- |
| requests, default headers | 1.1 | 403, `cf-mitigated: challenge` |
| requests with Chrome headers — earlier series | 1.1 | 403, challenge |
| curl_cffi without a browser profile | 2 | 403, challenge |
| curl_cffi, Chrome profile | 2 | 200, `__NEXT_DATA__` data |
| curl_cffi, Safari profile | 2 | 200, `__NEXT_DATA__` data |
| curl_cffi, Chrome profile, forced HTTP/1.1 | 1.1 | 403, challenge |
| curl_cffi, Chrome profile, HTTP/2, repeat in a fresh session | 2 | 200, `__NEXT_DATA__` data |

The result points to the importance of the combination of the connection profile and HTTP/2. No specific TLS/HTTP2 signal, header order or other protection rule was isolated. A browser profile changes more than one parameter. The trials were not randomised; they do not prove durability or operation from another VPS/IP. In the raw results `http_version: 3` means the curl enum **HTTP/2**, and `2` means HTTP/1.1 — do not interpret the number 3 as HTTP/3.

The minimal configuration checked in the controls:

```python
from curl_cffi import requests
from curl_cffi.const import CurlHttpVersion

with requests.Session(impersonate="chrome", trust_env=False) as session:
    response = session.get(
        "https://theprotocol.it/praca",
        http_version=CurlHttpVersion.V2_0,
        timeout=20,
        allow_redirects=False,
    )
```

In the connector the response must be verified before parsing: status, no `cf-mitigated: challenge`, presence of `__NEXT_DATA__`, the shape of the list/detail. A challenge means an access error and an incomplete run, never an empty list or expired offers. Requests must still pass through the existing frequency and budget control.

## Data validation

### Bulldogjob .pl

- First page: 50 ads, `totalCount=1046`.
- `/companies/jobs/s/page,2`: 50 distinct IDs, none shared with the first page.
- `/companies/jobs/s/page,21`: 46 distinct IDs. Consistent with the 1046 counter in this sample, but without going through pages 3–20 full coverage was not confirmed.
- `/companies/jobs/s/skills,PHP/experienceLevel,senior`: 9 ads, `slugState` reflected.
- `/companies/jobs/s/skills,Go`: 36 ads. Technologies and levels must remain adapter parameters.
- Detail of an ID taken from the list: 200, matching ID, state published, dates, 1784 characters of requirements, JSON-LD JobPosting. `offer` in this particular offer is empty; do not take this as the absence of the whole description or assume a mandatory field.
- Second detail (Devire): 200, `offer` 148 characters, `requirements` 1786; `details` and `recruitmentProcess` null. An empty or null fragment must be treated separately from a fetch error.

### Bulldogjob .com is not an equivalent replacement for .pl

In the same run .com had `totalCount=1584`, .pl 1046. On the first pages of 50 items each there were 31 shared IDs, and 19 that appeared only on each of the compared pages. This is not a measurement of full coverage of both sets, but it does not allow assuming they are equivalent. .com had an English interface, a different buildId, and responded with 200 also without HTTP/2. For the Polish scope, use the working .pl.

### theprotocol.it

- List: 50 ads in `offersResponse.offers`.
- `/praca?pageNumber=2`: 50 distinct IDs, none shared with the first page.
- `/praca?pageNumber=83`: 25 distinct IDs, `page.count=83`, `offersCount=4125` in this trial. Without going through the intermediate pages, a complete sync was not confirmed.
- `/filtry/go;t`: 27 ads, `expectedTechnologies` confirmed in the filter. The scope is configurable.
- A detail chosen from the first page: matching ID, seven text sections, technologies, `publicationDetails`, JSON-LD JobPosting.
- The detail also contains the list's `offersResponse` — do not confuse it with the actual `pageProps.offer` when parsing.

## An additional Next.js JSON variant

A trial of `/_next/data/{buildId}/companies/jobs.json` on Bulldogjob .pl gave a 404 HTML. The equivalent `/_next/data/{buildId}/praca.json` on theprotocol gave a 404 JSON. The variants were derived from the buildId actually returned on the page; no available contract for this channel was confirmed. The working read remains HTML → `__NEXT_DATA__`. There is no need to make the connector depend on these failed addresses or to keep looking for alternatives just to remove the current 403, because the HTML read already works.

## Material and reproduction

[dostep-http-proby](dostep-http-proby/) contains three scripts and three JSONL files. Run the scripts in order in the same container:

```sh
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/transport-probe.py
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/access-validation.py
docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/dostep-http-proby/nextdata-probe.py
```

`access-validation.py` uses the samples in `/tmp` saved by the first script. The last-page numbers are values of this trial; a production connector should derive them from the current counter. Running again means new requests, not an offline test. Verification of the local artefacts: parsing of the three scripts, all 30 JSONL records (29 responses + the domain comparison), a check of statuses and ID consistency.

Next implementation stage: a shared bounded curl_cffi layer, list/detail parsers with contract validation, pagination and tests of incomplete runs. Based on the current result, no dependencies on a browser or the owner's session are needed.
