# HTTP header comparison — 2026-11-03

33 single requests from the worker container, Python requests, without an environment proxy (`trust_env=False`), without redirects, connection timeout 8 s / read timeout 15 s, a gap of at least 2 s. Each trial uses a new session; no user cookies or tokens were carried over. No response content or offers were saved in the database. The owner supplied the browser material: NFJ HTML and API, Bulldogjob .pl, theprotocol /praca — all HTTP 200. Session data from the attachments was not copied.

## Results

- **NFJ HTML and API:** the base client gets 403, changing only the User-Agent to Chrome 156 gives 200, returning to the base client gives 403 again. Trials changing only Accept or Accept-Language remain 403. For the API, Content-Type, Origin or Referer alone also remain 403. The browser header set gives 200. In this sample the User-Agent is a sufficient change; neither the server rule nor how lasting the behaviour is was established. A full header set or user cookies are not necessary.
- **NFJ Content-Type:** the API returned 200 and JSON also with application/json and just the Chrome User-Agent. The suspicion that application/infiniteSearch+json is required was not confirmed. With the default User-Agent both types got 403. The JSON had, among others, postings, criteriaSearch, totalCount, totalPages. The completeness and filtering semantics of the results were not verified.
- **Bulldogjob .pl:** all six trials 403; the responses contain cf-mitigated: challenge. Changing headers within the examined range is not enough.
- **Bulldogjob .com:** all six trials 200, the HTML contains __NEXT_DATA__, no challenge markers detected. The current result differs from the earlier 403. Neither the equivalence of the offer set with the .pl domain nor the cause of the variation over time was confirmed.
- **theprotocol /praca:** all six trials 403 and cf-mitigated: challenge. Changing only the User-Agent, Accept, language, or their set with Sec-CH-UA/Sec-Fetch-*, is not enough.

Not tested: copying cookies, solving the challenge, TLS fingerprint, HTTP/2, proxies, changes of the outgoing address or other ways of obtaining a session. IP, time, session state and transport remain potential factors; none was identified as a proven cause. The trials were not randomised and are no guarantee of future availability. The combined set does not reproduce the whole browser: it keeps the compression supported by default by requests, and omits cookies, tokens and the analytical nfj-global-context. Each Sec-* header and compression were not tested separately.

## Reproduction

Script: [naglowki-http-probe.py](naglowki-http-probe.py). Running in the current container: `docker compose exec -T worker /opt/jobspy/bin/python - < docs/research/polskie-zrodla/naglowki-http-probe.py`. The script sends 33 requests and prints only metadata; running it again is a new network test. [JSONL results](naglowki-http-wyniki.jsonl) contain the UTC time, URL, changed headers, status, response size/hash and selected non-confidential headers. For the API the parameters and body from the owner were used; PHP is only a trial value, not a fixed scope of the adapter.

## Trial matrix

| Target | Trial | HTTP | Cloudflare challenge | Application data |
| --- | --- | --- | --- | --- |
| nfj-html | baseline | 403 | — | — |
| nfj-html | ua | 200 | — | serverApp-state |
| nfj-html | accept | 403 | — | — |
| nfj-html | language | 403 | — | — |
| nfj-html | combined | 200 | — | serverApp-state |
| nfj-html | baseline-repeat | 403 | — | — |
| nfj-api | baseline | 403 | — | — |
| nfj-api | ua | 200 | — | JSON |
| nfj-api | accept | 403 | — | — |
| nfj-api | language | 403 | — | — |
| nfj-api | content-type | 403 | — | — |
| nfj-api | origin | 403 | — | — |
| nfj-api | referer | 403 | — | — |
| nfj-api | combined | 200 | — | JSON |
| nfj-api | baseline-repeat | 403 | — | — |
| bulldog-pl | baseline | 403 | challenge | — |
| bulldog-pl | ua | 403 | challenge | — |
| bulldog-pl | accept | 403 | challenge | — |
| bulldog-pl | language | 403 | challenge | — |
| bulldog-pl | combined | 403 | challenge | — |
| bulldog-pl | baseline-repeat | 403 | challenge | — |
| bulldog-com | baseline | 200 | — | __NEXT_DATA__ |
| bulldog-com | ua | 200 | — | __NEXT_DATA__ |
| bulldog-com | accept | 200 | — | __NEXT_DATA__ |
| bulldog-com | language | 200 | — | __NEXT_DATA__ |
| bulldog-com | combined | 200 | — | __NEXT_DATA__ |
| bulldog-com | baseline-repeat | 200 | — | __NEXT_DATA__ |
| theprotocol | baseline | 403 | challenge | — |
| theprotocol | ua | 403 | challenge | — |
| theprotocol | accept | 403 | challenge | — |
| theprotocol | language | 403 | challenge | — |
| theprotocol | combined | 403 | challenge | — |
| theprotocol | baseline-repeat | 403 | challenge | — |
