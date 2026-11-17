# No Fluff Jobs — access to ads

Date verified: **2026-11-03**. Supplements the [earlier source comparison](../zrodla-ofert.md). The operator's public pages and documents, the public code of independent integrations and a single detail response in the browser were examined, without downloading the database, running scrapers, bypassing protections or contacting the operator. Search engine results may be delayed and ad pages may change.

## Conclusion

**The portal contains ads and an extensive search, but the path to automated integration remains unagreed.** PHP and Senior are only examples, and the project's technologies and filter values remain configurable. No officially documented public API for reading ads and no official RSS channel of offers were found. This is not proof that no such access exists or that it cannot be obtained individually. The browser search and its possible technical back end are not a documented integration contract.

The terms of 15.10.2026, § 2 sec. 8–9, restrict downloading or secondary use of a substantial part of the database, and also repeated or systematic downloading of data forming the database, in particular ads. Therefore **before planning a recurring import, even for personal use, a suitable written agreement must be obtained from the operator**, covering the specific way of use. This is a practical conclusion for the project, not a legal opinion. [Terms, p. 7](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf#page=7).

## What the portal shows

- [The PHP offer search](https://nofluffjobs.com/pl/PHP) shows backend and fullstack offers, including ones with Senior in the title. PHP as a search tag does not guarantee that every offer concerns a PHP developer position. Offers without the word Senior in the title may also be useful.
- [The PHP and remote work view](https://nofluffjobs.com/remote/PHP) shows filters for technology, seniority (including Senior, Expert and Lead), location, work mode, salary, working language and contract type. These are interface capabilities, not confirmed parameters of an available API. The working-time filter and the completeness of individual categories were not verified.
- [The PHP / Fullstack Developer example](https://entrypoint-prod.nofluffjobs.com/pl/job/php-fullstack-developer-itfs-warszawa-2) contains Senior, a location, a hybrid description, a validity date, mandatory and nice-to-have technologies, a language, terms of engagement and information about the client. Results and ad pages may change; data from a single offer must not be treated as a guaranteed schema for all.
- [Another offer](https://entrypoint-prod.nofluffjobs.com/pl/job/php-developer-regular-senior-iai-szczecin-1) has Regular/Senior in the title, but the level field shows Mid. This is an example of the risk of losing relevant results with overly narrow seniority filtering. Remote work, location, the number of office days and the right to work from Poland need a separate assessment of the content; a lack of confirmation remains an unknown.
- Not every offer shows an amount on the list: [the PHP results](https://nofluffjobs.com/pl?criteria=PHP) also contain items with a message about checking the salary. Do not assume complete numeric salary ranges.

## Technical access and terms

| Area | Result and missing information |
| --- | --- |
| Official read API / RSS | No public documentation, channel or permission to use them for aggregation was confirmed. Documentation of a publishing integration, if it exists, does not by itself confirm the right to read all offers. |
| Application endpoints | [robots.txt](https://nofluffjobs.com/robots.txt) contains `Disallow: /api/` for `User-agent: *`. This is a directive for crawlers, not a licence or a standalone answer to the question of consent. The public code of independent clients reveals the unofficial requests described below; the detail of one ad returned JSON in the browser; search was not confirmed in this test. |
| Identification | The browser shows ad addresses, but a stable identifier, URL behaviour after a title change, deduplication and republication were not verified. Do not take the slug as a durable key without an agreement and tests. |
| Pagination and scope | Handling of paging or a cursor in an available contract, limits, completeness, historical export and a stable snapshot while the list changes were not established. A visible button for more offers is no guarantee of a complete sync. |
| Changes and end of an offer | A validity date is visible in the examples; a last-update field, a change channel, webhooks, tombstones, reading withdrawn ads and extension rules were not confirmed. Absence in an incomplete run does not confirm expiry. |
| Access terms | Price, limits, frequency, authentication, storage terms, permitted passing of excerpts to AI, history retention, attribution method and data deletion rules were not established. Using an intermediary provider is not confirmation of the operator's consent. |

The terms § 2 sec. 11 provide additional rules for data available after logging in and for information sent by e-mail. An e-mail alert exists on the [results page](https://nofluffjobs.com/pl/PHP), but its existence does not mean consent to automated processing or a full import of offers. [Terms](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf#page=7).

## Technical study of public code — 2026-11-03

This is an analysis of third-party code and of a single live response, not the operator's documentation. No official read contract or SLA was found. [robots.txt](https://nofluffjobs.com/robots.txt) specifies `Disallow: /api/` and `/posting/` for `User-agent: *`. A single read of the detail in the browser made it possible to view the JSON; the browser interface itself did not reveal the HTTP code. Direct attempts from the terminal did not get past DNS resolution (curl code 6), so they are not a server response. A separate test in the container on 2026-11-03 (Python requests Session without a proxy and automatic retries, 2 s gap) gave `HTTP 403`, `text/html`, without a redirect, for the detail GET and the search POST described below. No attempt was made to bypass the block. The discrepancy with the browser read does not establish the cause of the refusal or the browser status. The addresses and names below serve to assess feasibility; they are not consent to import.

### Two observed request variants

- [career-ops, pinned commit `9b17a8a`, request construction](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L54-L93) and [the call](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L118-L157) show `POST https://nofluffjobs.com/api/search/posting`, `Accept: application/json, text/plain, */*`, `Content-Type: application/infiniteSearch+json`. The URL parameters are `sort=newest`, `withSalaryMatch=true`, `pageTo`, `pageSize`, `salaryCurrency`, `salaryPeriod`, `region`, `language`; the client defaults are 20, PLN, month, pl and pl-PL respectively. With text, the client sends `rawSearch`, `url.searchParam`, `criteria`, `pageSize` and `withSalaryMatch`; alternatively a `criteriaSearch` object with arrays. The code adds no explicit token or Authorization header; this does not prove current anonymous access or the absence of other server requirements.
- [go-nofluffjobs, client code](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/client.go) and [model](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/models.go) describe the same `POST` with `Content-Type: application/json`, the parameters `limit`, `offset`, `salaryCurrency`, `salaryPeriod`, `region` and the JSON `page`, `rawSearch`, `criteriaSearch`. This code on the `main` branch is a moving reference; its state was checked on 2026-11-03. [The README](https://github.com/necsord/go-nofluffjobs#usage) gives an example `limit=50`, `offset=0`, `page=1` with a Golang requirement and `b2b`. This is a client example, not the operator's documented boundary values.

The `criteriaSearch` fields in the code include, among others, `requirement`, `category`, `keyword`, `seniority`, `city`, `employment`, `jobLanguage`, `jobPosition`, `company`, `id`, `more` and `salary` with `currency`, `greaterThan`, `period`; career-ops adds `country`, `province`, `applicationStatus`, `withSalaryMatch`. The existence of the fields does not prove their current support, value syntax, AND/OR/NOT semantics, completeness of results, or that required and optional technologies can be separated by a filter. A working-time filter was not confirmed. The product needs any technologies and configurable criteria; local filtering after fetching a permitted scope may be necessary if the source contract does not cover the requirements.

### Pagination, response and details

[career-ops](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L118-L157) increments `pageTo` from 1, by default up to five pages of 20; it stops after `totalPages` or an empty `postings` array, deduplicating URLs within the run. Five pages and 20 are the client author's decisions, not an API limit. [The Go model](https://github.com/necsord/go-nofluffjobs/blob/main/nofluffjobs/models.go) points to `totalCount` and `postings`, and in turn uses `limit`/`offset` and `page`. The relation between these two variants, sort stability, the maximum page size and a consistent snapshot are not known. Changes during paging may cause omissions or duplicates; neither `totalCount` nor an empty page alone guarantees a complete sync.

The Go model provides in an item `id`, `url`, `title`, `name`, `technology`, `category`, `seniority`, `regions`, `location.places`, `location.fullyRemote`, `posted`, `renewed`, `salary.from`, `salary.to`, `salary.type`, `salary.currency`. [career-ops](https://github.com/career-ops-hq/career-ops/blob/9b17a8ac97b398a496b38e423ae24e433b43254f/providers/nofluffjobs.mjs#L95-L116) interprets `posted` as a number of milliseconds and builds the link from `url` or `id`; this is the client's behaviour, not a guarantee of semantics, time zone or identifier stability. `renewed` is not proof of a last-modification field for the whole content. The list model does not confirm a full description, all salary types, an expiry date, required versus optional technologies or remote location details. The detail read is described below; one response is not a guaranteed schema. Fields may be optional, incomplete or change type.

The path has no visible version prefix, but no change or backward-compatibility policy was established. Limits, limit headers, `429`/retry rules, SLA, validation, tokens, cookies, partner access and host stability were not confirmed. Open-source code and its licence do not grant a licence to the operator's data. A change channel, webhooks, history, deleted offers, tombstones and the durability of `id` on renewal and republication were not established either.

### Details: a single live read

On 3 November 2026 a `GET` of [the details of a single ad](https://nofluffjobs.com/api/posting/php-fullstack-developer-itfs-warszawa-2) was opened in the browser. A JSON response was visible without logging in or supplying a token manually. The browser did not show the HTTP code or headers, so we assign them no values; a separate client in the container received 403, as described above. This is an observation of one offer, not a guarantee of anonymous access, schema, completeness or the right to automate.

**The list in the browser, 3 November 2026:** the `/pl` page contains `script#serverApp-state[type="application/json"]` about 380 kB long. In one entry with a hash-like key (do not assume a fixed name) an object was found with `criteriaSearch`, `postings`, `totalCount`, `totalPages`, `exactMatchesPages`, `rawSearch`, `params` and other metadata. `postings` had 20 records, and the first item's object had the fields `id`, `name`, `location`, `posted`, `title`, `technology`, `category`, `seniority`, `url`, `regions`, `fullyRemote`, `salary` and others. The state also contains a separate set `/joboffers/oftheday?...`, 8 promoted items: in total, initially there were 28 cards in the DOM. After clicking "Pokaż kolejne oferty" (Show more offers) the DOM grew to 48 cards; the second-page request and its status were not directly observed. The Angular state after the click is not proof that the next 20 items are appended to the SSR script. The counters `totalCount=21706` and `totalPages=168` need not have the same basis (there are salaryMatch/additionalSearch groups); do not mechanically derive catalogue completeness from them. This is the DOM state after the browser loaded, not proof that raw HTML is available in the worker.

| Path | Type and observation in this sample |
| --- | --- |
| `id`, `postingUrl`, `defaultUrl`, `title`, `status` | string; `id` and the URL contained the same slug, status `PUBLISHED`; this does not prove identity durability. |
| `basics.category`, `basics.technology` | string; `basics.seniority` an array of strings. The main technology is not the full list of requirements. |
| `company.name`, `company.size`, `companyUrl` | string; the publishing company's data does not prove the identity of the employer or the client. |
| `requirements.musts`, `requirements.nices` | arrays of `{value: string, type: string}` objects; they give separate required and nice-to-have tags. `requirements.description` is an HTML string and contains additional context; `requirements.languages` is an array of objects `type`, `code`, `level`. |
| `details.description` | HTML string; `specs.dailyTasks` an array of strings. Keeping formatting and presenting HTML safely need a separate solution. |
| `location.places` | an array of objects with `city`, `country.code`, `country.name`, an address and `geoLocation`; `location.remote` a number, `remoteFlexible` boolean, `hybridDesc` string. The meaning of the number and the possibility of working from Poland do not follow automatically from these types. |
| `essentials.originalSalary` | an object with `currency`, `types` and visibility markers; in the sample `types.b2b` contains `period: "Hour"`, a numeric `range` array and `paidHoliday: false`. Terms may differ per contract; the amount basis must not be guessed. |
| `recruitment.languages`, `recruitment.processSteps` | arrays of objects with a code and of strings respectively; `onlineInterviewAvailable` boolean. |
| `posted`, `expiresAt`, `version` | respectively an integer, a date string without an explicit zone and an integer; the observation does not establish the unit, the zone or the version semantics. `postedOrRenewedDaysAgo` is a number, but it does not replace a content change date. |

For comparison, [the operator's 2019 article](https://nofluffjobs.com/pl/log/praca-w-it/jak-zbudowac-narzedzie-cli-w-node-js/) presented an older `GET /api/posting` as a programming example; it does not confirm the current contract or permission for recurring downloads. [A commercial description of an external tool](https://apify.com/muhammadafzal/nofluffjobs-scraper) declares a list and JSON details, but its example data is synthetic and is neither an observation of the operator's response nor consent to use the data.

### Adapter protocol to check after agreement

1. Accept a configurable scope: any technologies (any/all/exclusions), level, location, mode, contract, working time and salary; do not hard-code a specific programming language. Map to source filters only the semantics confirmed by tests; apply the rest locally to the permitted scope, keeping the unknowns.
2. Fetch every list page and the details of all items needing a refresh; record the source identifier, URL, raw values, observation time and whether the run was complete/incomplete. Agree the schema and the number of requests with the operator.
3. Normalise separately the mandatory and optional tags, the terms for each contract type, currency and period, the provenance of company data, the location and the mode description; process HTML safely. Working hours, the amount basis and the right to work from Poland may remain unknown.
4. Deduplicate by the source identifier only within confirmed stability; treat publication, renewal, content change and expiry as separate events. An error, a limit or a list change during fetching means an incomplete run; absence in it does not mean expiry.
5. Before rollout, check full pagination, filter boundaries and behaviour, optionality/types across different ads, behaviour for withdrawn offers and URL changes, as well as `429`/`5xx` statuses, retry and the permitted retention. One example is not enough to establish these rules.

### Consequences for the project after obtaining agreement

Store the source identifier, the source URL and the time of the first/last observation separately from the identity of the offer across portals; treat the stability of `id` as a hypothesis. Keep versions and content differences only within the agreed retention, together with provenance, currency, period and amount basis. `posted`, `renewed`, detection and confirmed expiry are separate events. On a page error, a limit or an incomplete run, mark the sync as incomplete; absence from the results does not prove expiry. Technical retries, the number of requests and the schedule require agreed limits, not values inferred from code.

## Next step: an enquiry to the operator

The operator gives [a sales and product contact](https://nofluffjobs.com/pl/about/): **sales@nofluffjobs.com**, and a general address **info@nofluffjobs.com**. These are points of contact, not confirmation that a partner programme exists. No message was sent.

In the enquiry, describe a single-person application, a planned sync once a day and on demand, and storing ads and their history locally or on our own VPS. Ask for:

1. Access to an official read API/feed, or written terms for another way of fetching, together with the price and restrictions for personal use.
2. The scope of configurable filters for technology, experience level, location/Poland, work mode, contract, working time, language and salary; the full list and detail schema, and the distinction between mandatory and optional technologies.
3. A durable identifier, pagination and a completeness guarantee, limits and frequency, publication/change/expiry dates, republications and how to detect a withdrawal.
4. Consent to store the full content and previous versions locally after expiry, the use of excerpts by an external AI, required links and attribution, and data deletion rules.

Until a reply is received, treat No Fluff Jobs as a source for manual browsing, and the adapter design and its schedule as unconfirmed. Do not interpret the absence of a reply as consent.

## Supplement: comparison of headers from the container

Current trials from 2026-11-03: [matrix and conclusions](naglowki-http.md). NFJ HTML and API return 200 after changing only the User-Agent to Chrome, while the base client still gets 403. Bulldogjob .com currently returns 200 even to the base client; .pl and theprotocol still return 403 with `cf-mitigated: challenge`, also with a browser header set. The results supplement and partly replace the earlier 403 observation; they do not confirm durability or complete sync.
