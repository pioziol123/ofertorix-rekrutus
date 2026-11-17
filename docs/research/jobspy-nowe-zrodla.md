# Additional sources besides JobSpy

Verification date: 2026-11-03. Scope: operator documentation and a sample Remote OK response; without running scrapers, installing third-party packages or measuring the number of matching offers. Context: `bd show oferty-pracy-y81.14`. Senior PHP, Poland, or remote work available from Poland. This is an assessment of candidates, not an implementation.

"New" means additional compared with the application's current adapters, not newly created portals. API documentation does not prove the number of relevant recruitments. Geographic availability remains a criterion separate from remote as such.

## Priorities

| Priority | Source | Confirmed access and usefulness | Significant limitation |
| --- | --- | --- | --- |
| 1 | **Himalayas** | API without a mandatory key; search by `q`, `country`, `seniority`, `worldwide`; descriptions and pay with a period. A good basis for PHP/Senior/PL search. | Needs the source and an unchanged `applicationLink`; daily refresh. The number of matches was not shown here. |
| 2 | **Jobicy** | Public JSON, cursor pagination, geography, category, keyword; separate status checks of stored IDs. | The feed covers the last 7 days. Disappearing from it does not mean the offer is closed. |
| 3 | **Remote OK** | Public JSON; an actual response that was read has an ID, description, tags, location and pay fields. An adapter proposal exists in JobSpy — details in the fork report. | The first element of the array is metadata/terms. Remote does not guarantee work from Poland. |
| 4 | **Arbeitnow** | The operator describes a free API without a key, European offers from ATSs, a remote field; a separate UK endpoint. | Workplace restrictions must be read; do not assume that German/UK remote includes Poland. |
| 5 | **Greenhouse / Lever / Ashby** | Documented interfaces for the published offers of specific companies. Useful for monitoring selected employers. | They require a company register and board identifiers. They are not a global search engine for the whole market. |
| 6 | **Remotive / We Work Remotely** | The documented Remotive API and public WWR RSS feeds, including backend/fullstack. | Remotive has a 24 h delay; in this verification, WWR RSS gives no confirmation of complete sync and closures. |

The order above is a design recommendation based on how well the interfaces fit, not a ranking of market size.

## Evidence and integration requirements

### Himalayas

The official description shows browse with a cursor and at most 20 records, search with pagination, and checking a single ad. The country filter also includes worldwide offers. Page results can shift; deduplicate by `guid`. `pubDate` means the last update. The API distinguishes 200/open and 410/closed; 404 is not equivalent to the latter. Without a key there is a shared pool; a free key gives 60/min and 10 000/day, exceeding it gives 429. The operator requires attribution and use of `applicationLink`, and forbids redistributing the data to other aggregators. [Operator documentation](https://himalayas.app/api), [API reference](https://himalayas.app/docs/remote-jobs-api).

### Jobicy

The current description shows `GET /api/jobs`, up to 100 records per page and `nextCursor`. A new automated run at most once an hour; cursor pages in sequence. The feed is 7 days, while `/api/jobs/status?ids=...` distinguishes active/closed/unknown. Without a key, the address leads to Jobicy; the paid option of original ATS links is not needed for our import. The operator allows ordinary integrations without a separate agreement and requires the source to be credited. [Documentation and fair use](https://jobicy.com/jobs-rss-feed).

### Remote OK and Arbeitnow

Reading Remote OK confirms the JSON, not the correctness of every salary or the completeness of the history. The terms in the metadata require the source name and a backlink; the logo requires separate consent. [Endpoint with terms](https://remoteok.com/api).

Arbeitnow describes European data from several ATSs and provides a link to a Postman specification. It is a candidate for a pilot; a request limit, handling of closures and PHP coverage are not confirmed here. [Operator description](https://www.arbeitnow.com/blog/job-board-api).

### Directly from the employer: ATS

- Greenhouse: GET without authentication, `boards/{board_token}/jobs?content=true` includes the description. [Job Board API](https://docs.greenhouse.io/job-board).
- Lever: lists under a company identifier, a global and a European host, JSON, descriptions and optional pay. The documentation excludes full-text search of the whole market; the stated limit of 2/s applies to **POST applications**, not GET of offers. [Official repository](https://github.com/lever/postings-api).
- Ashby: the board of a specific organisation, description, locations, mode and optional compensation data through `includeCompensation=true`. [Operator documentation](https://developers.ashbyhq.com/docs/public-job-posting-api).

This study did not establish a general licence to redistribute the offers of all ATS customers. Our case is personal monitoring; we are not designing the publication of someone else's database.

### Remotive and WWR

Remotive recommends at most four reads a day; more than two a minute lead to a block. It requires the source and a Remotive link, and offers are delayed by 24 h. [Operator README](https://github.com/remotive-com/remote-jobs-api).

WWR publishes a general RSS feed and backend/fullstack feeds and asks for a backlink. This document confirms the feed; it is not a full audit of terms, retention or completeness. [Official RSS catalogue](https://weworkremotely.com/remote-job-rss-feed).

## Recommendation for the application

First a small Himalayas pilot, then Jobicy and Remote OK. Our own TypeScript adapters can use the shared ad storage without extending the Python dependency where JSON is enough. Selected companies through an ATS are a separate, later direction. Still required: operator-specific limits, attribution, keeping source salaries and incomplete results, without guessing availability from Poland or seniority.
