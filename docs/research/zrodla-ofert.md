# Data availability of offer sources for the Polish market

Verification date: **2026-10-30**. Context: `bd show oferty-pracy-v4t.1`; requirements: [product decisions](../product/ustalenia.md). This is material for choosing a source, not an owner's decision or an implementation of fetching.

## Conclusion

**Recommended candidate for the first source: SOLID.Jobs.** It is the only one of the five that, in this study, has a confirmed official, documented read interface intended also for aggregators and AI assistants. The documentation speaks of free access without an account, key or OAuth; your own `campaign` identifier is required. It explicitly allows presenting offers in an application and building an aggregator. [Official API page](https://solid.jobs/api-ofert-pracy).

The recommendation concerns simplicity and explicit integration rules. It does not prove the best market coverage or the number of matching offers for the owner: the values of the baseline requirements remain undecided. The other portals may be useful later, after obtaining appropriate access or clarifying the terms.

## Method and strength of evidence

Official pages, documentation linked by the operator, terms of service and sample ads were checked. Searches for portal names together with `API`, `RSS` and integrations did not reveal a confirmed public read interface for the four competitors. **"Not confirmed" does not mean "does not exist".** The documentation of an ATS vendor, a paid scraper or a third-party aggregator does not confirm an API offering by the portal operator. An interface for employers to publish ads is not access to the whole list of offers.

One successful SOLID.Jobs GET with `pageSize=1` was made; the whole database was not fetched and limits were not tested. Some theprotocol.it pages returned 403; restrictions were not bypassed. The stated date is the date of the check; search engine content may come from a cache. So the counters visible on the pages are not compared as exact current market sizes.

## Comparison

| Source | Official API / RSS read of offers | Data and work from Poland | Terms / restrictions | Assessment for the start |
| --- | --- | --- | --- | --- |
| **SOLID.Jobs** | Confirmed public REST API and official RSS feeds of offers: general, IT and specialisations. [RSS catalogue](https://solid.jobs/about/rss). | The API sample has the location Kraków, B2B terms, technologies, description and dates. The IT division also includes roles other than programming. | Free; `campaign`; 300 requests/min/IP, queue of 10, cache of 1 h; the API page allows aggregators. [Documentation](https://solid.jobs/api-ofert-pracy). | The fewest integration uncertainties; recommended candidate. |
| **Just Join IT** | No official public read API or RSS of offers confirmed. An attempt at the old `/api/offers` through the web tool ended with 404; this is not proof that no other API exists. | The search has Polish cities, remote, technologies, seniority, contracts, working time, languages and a filter for offers with salary ranges. [Search](https://justjoin.it/). | The user terms of 14.07.2026, points 11.2–11.3, restrict copying/downloading content; automated extraction requires explicit written consent. [Terms from the official site](https://s3.eu-west-1.amazonaws.com/public.justjoin.com/regulations/jjit-users-terms-of-service/jjit__regulamin_uzytkownika_justjoinit_14072026). | Do not start a scheduled import without an appropriate agreement. |
| **No Fluff Jobs** | No official public read API or RSS of offers confirmed. | Filters: technologies, seniority, location, mode, contract, language and salary ranges; there are offers in Poland. [Search](https://nofluffjobs.com/). | The terms of 15.10.2026 §2 sections 8–9 restrict a substantial part of the database and repeated/systematic downloading; robots excludes `/api/`. [Terms](https://nofluffjobs.com/static/No_Fluff_Jobs_Terms_and_Conditions.pdf), [robots](https://nofluffjobs.com/robots.txt). | First clarify access and terms; an unofficial endpoint alone is not enough. |
| **Bulldogjob** | No official public read API or RSS of offers confirmed. | The list has Polish and foreign locations, remote, technologies, experience, working arrangement and salary ranges. [Offer list](https://bulldogjob.pl/companies/jobs). | Terms §16 section 3 restrict copying, reproduction, distribution and downloading of content in whole or in part. [Terms](https://bulldogjob.pl/terms/general). | Do not choose for automated import without an access agreement. |
| **theprotocol.it** | No official public read API or RSS of offers confirmed. | The operator describes the Polish IT market, MUST/NICE/NOT technology filters, location, earnings, contracts and experience. [About the site](https://theprotocol.it/o-nas). | The site points to terms in force from 12.10.2026, but the full document could not be verified in this study; some addresses return 403. [Terms page](https://theprotocol.it/regulamin). | Technical access and the permissibility of integration remain unknown. |

For the last four sources, the following were not established: a public pagination contract, request limits, guaranteed completeness, a historical export or a closure status interface. Features visible in the browser are no guarantee that these fields are available through an API. `robots.txt` describes expectations for crawlers; it does not replace terms of service or a licence.

## SOLID.Jobs: API, RSS and an actual sample

The official RSS catalogue lists the feed of all new offers `https://solid.jobs/rss/job-offers`, the IT feed `https://solid.jobs/rss/job-offers/division/IT` and feeds for programming specialisations, e.g. Python, Java and .NET. The existence and purpose of the feeds were confirmed on the operator's page; reading the IT feed with the web tool stopped at the unsupported type `application/rss+xml`, so the XML content was not verified and no audit of RSS completeness or retention was done. Guarantees of history, pagination, updates and signalling closure through RSS were not established. For full import and sync, the documented API remains the recommendation. [RSS feed catalogue](https://solid.jobs/about/rss).

The official client describes `GET /public-api/offers/{division}`, version `X-Api-Version: 1.0`, page indexing from zero, 30 records per page by default and at most 500. The response contains `jobs`, `pageIndex`, `pageSize`, `totalCount`, `totalPages`. There are filters for cities, categories/specialisations, experience, phrase and minimum salary, and sorting by, among others, `validFrom`, `validTo` and salary. [Operator README](https://github.com/solid-company/solid-jobs-client#main-endpoint).

Control query, without content filters:

```text
GET https://solid.jobs/public-api/offers/IT?campaign=osobisty-asystent-research&pageSize=1&pageIndex=0
```

Result: **HTTP 200**, `pageIndex=0`, `pageSize=1`, `totalCount=1525`, `totalPages=1525`. The counter applies to the IT division at the time of reading, not to developers alone or to the whole history. A shortened record of the fields actually read (the full description and lists are omitted):

```json
{
  "jobOfferKey": "73e829f7-9306-4210-85ce-8eea8de68acb",
  "title": "Project Manager",
  "division": "IT",
  "category": "ItManager",
  "subCategory": "ProjectManager",
  "company": "Verita HR",
  "salary": {
    "from": 24000.0, "to": 28500.0,
    "currency": "PLN", "period": "Month", "employmentType": "B2B"
  },
  "contractTime": "full_time",
  "locations": ["Kraków"],
  "isRemote": false,
  "isHybrid": true,
  "experienceLevel": "Senior",
  "validFrom": "2026-10-30T11:36:01.7201077+01:00",
  "validTo": "2026-11-30T11:36:01.7201077+01:00",
  "updatedAt": "2026-10-30T11:26:12.1036722+01:00"
}
```

Sample source: [the operator's public endpoint](https://solid.jobs/public-api/offers/IT?campaign=osobisty-asystent-research&pageSize=1&pageIndex=0), read on 2026-10-30. One record confirms neither completeness nor the behaviour of the whole database.

The sample also contained `companyLogoUrl`, `benefits`, `skills` with name and level, `languages` with name and level, the full `description` in HTML and a `url` address containing the campaign identifier. The description revealed a recruitment intermediary, an unnamed client and six days a month in the office. This is an example of data that needs the text to be read: a single `company` does not separate the roles of the publishing company, the employing company and the client; `isHybrid` alone does not specify the number of office days.

### Usefulness and gaps for the product

| Requirement | Evidence / consequence |
| --- | --- |
| Stable identity at the source | There is `jobOfferKey`; use it together with the source identifier, not the title or the campaign URL alone. This is a design recommendation based on the sample. |
| Salary | The sample confirms the amount, currency, period and contract. The documentation also provides for `secondarySalary`; amount bounds may be `null`. Do not assume a second salary range is present. [Field description](https://github.com/solid-company/solid-jobs-client#example-response). |
| Required / optional technologies | The documentation shows a `NiceToHave` level; keep the original level instead of dropping this distinction. [Operator example](https://github.com/solid-company/solid-jobs-client#example-response). |
| From Poland | A Polish address is a strong signal, but `isRemote=true` alone does not prove that residence in Poland is accepted, nor the required permit, time zone or working hours. These data remain unknown if the description does not state them. |
| History | An export of the history of individual ads or of change versions was not confirmed. Market statistics do not replace an offer's history. Our own snapshots are a project need. |
| Closure | There are `validTo` and change dates; a separate `closed` status, tombstone, webhook or guaranteed read of a withdrawn offer was not confirmed. Absence from a partial page is not enough. |
| Updates | A 1 h cache means that more frequent polling does not guarantee fresher data. No SLA or atomic snapshot of many pages was established. [API page](https://solid.jobs/api-ofert-pracy). |

## Boundaries of the recommended first adapter

The following are **design conclusions**, not additional guarantees from the operator:

- Fetch the IT division or an agreed broad scope, and set the filtering boundaries only after the profile is defined. Do not use the PM sample as evidence of match quality for a developer.
- Start with one run a day and a manual refresh, with sequential pagination, 429/backoff handling and handling of a failure of the whole run. The limit of 300/min is a ceiling, not a recommended frequency.
- Keep the source key, the full description, the original fields, the fetch date and the URL returned by the API together with the campaign; display the source and a link back. No separate obligation to use a specific logo or attribution text was found — this is not a confirmed licence for any further trading of the data.
- Keep notes and history locally after an ad disappears. A single error, an incomplete run or a change of filters must not mean expiry; the rule for confirming closure needs clarification when designing the sync.
- Before implementation, check several programming offers from the chosen scope, and the stability of the key and of optional fields. This does not require load testing or bypassing the restrictions of other sources.

## Correction of earlier assumptions

1. **SOLID.Jobs as a sensible starting point — confirmed**, now by the official API and a successful read, not only by an earlier conversation.
2. **"The other Polish portals have an API for fetching" — not confirmed.** Frontend endpoints or third-party offerings must not be presented as official integration access.
3. **"No API" or "no RSS" — too strong.** SOLID.Jobs has a confirmed API and an official RSS catalogue. For the other four sources, no public read contract/offer feed was found or verified.
4. **"Publicly visible = allowed to fetch systematically" — an inappropriate basis for the project.** JJIT, NFJ and Bulldogjob have the terms-of-service restrictions described above. For theprotocol.it the detailed terms remain unknown; do not carry over the provisions of other Grupa Pracuj services to this portal automatically.
