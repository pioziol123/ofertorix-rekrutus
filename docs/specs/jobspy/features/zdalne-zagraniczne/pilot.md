# Pilot of foreign remote offers — 2026-11-02

Package 1.4.1+oferty.3, running worker. One manual Senior PHP query per source market, is_remote=true, location=null. Limit 10 HTTP / 90 seconds per source. No accounts, proxies or circumventing blocks.

| Source | Market | Saved | HTTP | Missing descriptions | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Glassdoor | UK | 12 | 3 | 0 | partial / limited-unverified |
| ZipRecruiter | USA | 0 | 1 | 0 | failed / adapter_error |
| Naukri | India | 20 | 10 | 11 | partial / request_limit |
| BDJobs | Bangladesh | 6 | 7 | 0 | partial / limited-unverified |
| HelloWork | France | 1 | 2 | 0 | partial / limited-unverified |

Run IDs: Glassdoor e5258793-f143-4920-81dd-5578c3caefe5; ZipRecruiter 2d47b4d5-5d3a-4ad7-bad7-d0b36f32473a; Naukri 7a9618f2-0a54-45b6-a3c9-7a0439962fae; BDJobs 9363a1d6-a076-4d80-b954-f7656e0e00f5; HelloWork 87cbd2ba-b059-4eeb-89a3-4211d47f5ee0.

39 new ads. All 39 have unknown in the conservative assessment of whether work from Poland is possible. This does not mean they are incompatible, but it does not prove availability either. 39 senior PHP matches were not confirmed. Incompleteness and the lack of evidence of complete paging are explicit; we do not expire unseen offers. ZipRecruiter returned no saved record; safe diagnostics point to an adapter error, the exact cause was not determined, and we do not equate it with an empty market.

In total, the database after the trial: 82 source ads (31 SOLID.Jobs, 12 Bayt and 39 new). They may contain duplicates across portals. The earlier Bayt ads after assessing the geographic evidence: 4 allowed, 3 excluded, 5 unknown; these statuses concern only the place/mode of work, not PHP, seniority or the whole match.

LinkedIn stays disabled. [robots.txt](https://www.linkedin.com/robots.txt) gives whitelist-crawl@linkedin.com for requesting consent, indicating the limited purpose of approved search engines. There is no guarantee of consent for a private offer archive. The [Talent Solutions programme](https://business.linkedin.com/hire/ats-partners/partner-application) and the [Job Posting API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview) concern recruitment integrations and publishing offers; they do not confirm the possibility of searching the whole catalogue.
