# Company career pages and the platforms behind them

Verification date: **2026-11-22**. This investigation took the owner's list of 89 career links, opened each one, and established whether it shows a list of ads or a list of further links, and which recruitment platform (ATS, applicant tracking system: the service a company uses to publish its ads) serves the ads. It is the input for the epic that adds these sources to the Sources module. It records what was true on the day of the check; it decides nothing.

## Main finding

Almost every company page is a thin front for a recruitment platform. One connector per platform, configured with a list of company boards (the company's identifier on that platform), covers many companies at once. 20 platforms cover 65 of the 89 links; 5 links are job portals that list ads of many companies; 9 company pages publish their ads only in their own HTML; 10 links give no list of ads today.

Counts of ads are from the public read on the day of the check and only show that the read works.

## Method

- Every link was fetched with a browser user agent and searched for platform traces (host names of the platforms in links, scripts and frames).
- Pages that build the list in the browser were opened in a real browser; the requests the page made and the links it rendered were read.
- For each platform the public, unauthenticated read of a company's ads was called once. No login, key or bot protection was bypassed. One page (Muse Group) embeds a widget key for its platform; it was not used, so that read stays unverified.
- Link 3 (Async Jobs) is a catalogue of 73 companies, not a list of ads. Each of the 73 links was explored the same way; the result is in [Companies from the Async Jobs catalogue](#companies-from-the-async-jobs-catalogue).

## Platforms

The owner decided on 2026-11-22: when a company uses a recruitment platform, the platform is the source; the company's own careers page is not a separate source, even when it shows the same ads. The owner changed this on 2026-11-26: the source is the company's list of ads on the platform, not the platform as a whole; the current meaning of "source" is in the glossary.

"Read" names the public endpoint that returned the company's ads. `{board}` is the company's identifier on the platform.

| Platform | Read (public, no key) | Companies from the owner's list (board, ads) |
| --- | --- | --- |
| Lever | `GET https://api.lever.co/v0/postings/{board}?mode=json`; EU tenants: `api.eu.lever.co` | 1inch (`1inch`, 5), Contentsquare (`contentsquare`, 25), Truv (`truv`, 10), Coinspaid EU (`coinspaid`, 33), Finom EU (`pnlfin`, 5) |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` | Block Labs (`block-labs`, 4), Cyberhaven (`Cyberhaven`, 37), lemlist (`lemlist`, 17), Ruby Labs (`ruby-labs`, 31; links 24 and 77), Chili Piper (`chilipiper`, 3), RoomPriceGenie (`roompricegenie`, 12), TheyDo (`theydo`, 2), Zapier (`zapier`, 9), Keyrock (`keyrock`, 11), Tiger Data (`tigerdata`, 3), Patrianna (`patrianna`, 25) |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | Goodnotes (`goodnotes`, 4), Starburst (`starburst`, 36), Nebius (`nebius`, 367), Smartcat (`smartcatplatforminc`, 28), Fundraise Up (`fundraiseup-usa`), Binance (`binance`, 226), Toloka (`toloka`, 18), Remote.com (`remotecom`, **0**: the board is empty) |
| BambooHR | `GET https://{board}.bamboohr.com/careers/list` (JSON) | Chainstack (6), Mercuryo (8), ToYou (2), Prezi (3), Wildix (12), Appewa (0) |
| Teamtailor | `GET https://{host}/jobs.rss` on the company's own careers host | Sweatcoin (`sweatcoin.teamtailor.com`), Àlber Blanc (16), Noda (`join.noda.live`, 6), Playnetic (8), Replika (10), TecAlliance (`career.tecalliance.net`, 16), FXC Intelligence (1), Utorg (`utorg.teamtailor.com`), Energy Robotics / Korial (`careers.korial.com`, 0) |
| Workable | `GET https://apply.workable.com/api/v1/widget/accounts/{board}` | BrandBastion (6), Feeld (`feeldco`, 5), TheSoul Publishing (`thesoul-publishing-1`, 3), Infiterra (0) |
| Recruitee | `GET https://{host}/api/offers/` | Hostaway (`careers.hostaway.com`, 10), Novakid (`novakidteachers.recruitee.com`, 1), Red Sky (`redsky.recruitee.com`, 18), Wallarm (0) |
| Workday | `POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with a JSON body (`limit`, `offset`, `searchText`, `appliedFacets`) | Zendesk (`zendesk.wd1`, site `zendesk`, 137), Semrush (`semrush.wd5`, site `semrushcareers`, 7) |
| Rippling ATS | `GET https://api.rippling.com/platform/api/ats/v2/board/{board}/jobs` | VDX.tv (`vdxtvakaexponentialinteractive`) |
| JazzHR | HTML list at `https://{board}.applytojob.com/apply` | Digital Alchemy (`digitalalchemylimited`, 9), Codekeeper (`codekeeper`; link 36 redirects there) |
| Breezy HR | `GET https://{board}.breezy.hr/json` | Social Discovery Group (`social-discovery-ventures`, 37) |
| Personio | `GET https://{board}.jobs.personio.de/xml` | Vivid Money (`vivid`, 18) |
| Comeet | Widget script `comeet.co/careers-api`; the read needs the company UID and the widget key the page embeds | Muse Group (`mu.se`, UID `FA.001`), SuperPlay (its own page renders Comeet position IDs) |
| Pinpoint | `GET https://{board}.pinpointhq.com/jobs.json` | Tabby (`tabby`) |
| Gem | `GET https://api.gem.com/job_board/v0/{board}/job_posts/` | Rootly (`rootly`) |
| Jobvite | HTML list at `https://jobs.jobvite.com/{board}/jobs` | Absolute Security (`absolute`, 18 links) |
| Zoho Recruit | The careers page embeds the ads as JSON in the HTML | Effvision (`careers.effvision.com`) |
| Nodi | `GET https://api.nodi.global/job-offers/active/company/{board}` | dLocal (`dlocal`; link 31 redirects there) |
| HiBob | Ads at `https://{board}.careers.hibob.com/jobs/...` | Tangem (`join-tangem`; its own page also lists two ads on its own site) |
| Lucca | Ads at `https://jobs.world.luccasoftware.com/{board}/...` | Tremau (`tremau`) |

The read of Pinpoint, Gem, Nodi, HiBob, Lucca and Rippling was seen in the requests the company page made; its response shape was not studied. Recruitee hosts and Teamtailor hosts can be the company's own domain; the platform recognises the company by the host.

## Job portals

These links lead to ads of many companies, not of one employer.

| Link | What it is | Access |
| --- | --- | --- |
| builtin.com | US job portal with categories and remote filters | Static HTML pages per category; no public API seen |
| startup.jobs | Startup job portal; the owner's link filters remote QA ads from the last 30 days | Cloudflare bot check: a plain request gets 403, a browser gets the list |
| remocate.app | Remote and relocation job board | Static HTML, about 20 ads on the start page, ad pages at `/jobs/{slug}` |
| jobs.scribble.vc | Job board of the Scribble venture fund's portfolio, built on Consider | The page reads `/api-boards/search-jobs`; ads link to the companies' own platforms (e.g. Ashby) |
| asyncjobs.co | Catalogue of 73 "async-first" companies | Not a list of ads; explored below |

## Companies publishing ads only on their own page

No platform was found behind these pages; the list is in the page HTML or in the site's own data file.

| Company | Where the ads are |
| --- | --- |
| Skyro | `skyro.io/career-and-culture`, ad pages `/vacancy/{id}` (5 ads) |
| Onde | `onde.app/careers`, block `.vacancies` (3 ads) |
| B9 | `bnine.com/careers`, "Open positions" list without ad pages |
| Immigram | `immigram.io/career`, 3 ads without ad pages |
| Scalable Solutions | `scalablesolutions.io/careers/vacancies`, ad pages `/careers/vacancy/{slug}` |
| JET BI | `jetbi.com/vacancy` |
| Outside Digital | `outside.digital/career`, data in the site's Next.js data file |
| Bending Spoons | `jobs.bendingspoons.com`, ad pages `/positions/{id}` (about 40) |
| Doumo | `doumo.io/jobs`, each ad is a public Notion page |

## Links with no list of ads

| Link | Finding |
| --- | --- |
| 6 Fortris | The BambooHR board no longer exists (redirects to bamboohr.com); `fortris.com/careers` shows no ads |
| 13 inktech.org | Domain does not resolve |
| 17 Sardina Systems | Page offers only an e-mail address |
| 28 TOP | No list; applications by e-mail |
| 30 YouHodler | `/careers` redirects to the home page |
| 39 Blum | `careers.blum.io` does not resolve; `blum.io/careers` is 404 |
| 63 Adapty | No list rendered on the page |
| 78 QIC digital | The "Open positions" section is empty |
| 83 Nozomi | The page returns 404 |
| 51 claude.ai/chat/… | A Claude conversation, not a careers page |

Two more boards exist but were empty on the day: Remote.com on Greenhouse and Energy Robotics on Teamtailor. They count in the platform table.

## Companies from the Async Jobs catalogue

Boards found on platforms already in the table above:

- **Ashby:** 1Password (`1password`), Lightdash, Deepnote, Teleport (`goteleport`), Kit, Linear, LocalStack, Maze (`mazedesign`), Mistral AI (`mistral.ai`), n8n, Supabase, Toggl, Trigger.dev (`triggerdev`), Expensify, Help Scout, Kraken (`kraken.com`), Nango, Oyster (`oyster`), RevenueCat, TestGorilla, ClickHouse (205), Docker (50), ElevenLabs (122), Resend (13), Temporal (92), PostHog (9), Buffer (2), Weaviate (2), Sticker Mule (3), DuckDuckGo (`duck-duck-go`), Zapier, PandaDoc (Ashby and Greenhouse both answer with 11).
- **Greenhouse:** Canonical, Grafana Labs (`grafanalabs`), Sourcegraph (`sourcegraph91`), AssemblyAI, Ledgy, Lokalise, Airbnb, Chainguard, Cloudflare, Coinbase, Customer.io (`customerio`), Datadog, Elastic, GitLab, Mozilla, Stripe, Tailscale, Wikimedia Foundation (`wikimedia`), Ghost, Pulumi (`pulumicorporation`). Board names were confirmed by the board's own company name.
- **Lever:** Metabase, Superside, Toptal, Fly.io (`fly`).
- **Workable:** Hugging Face (`huggingface`).
- **Rippling ATS:** Prisma (`prisma-careers`), Chess.com (`chess`).
- **iCIMS:** GitHub (not a platform in the table; no public read was checked).

Without a platform found: Automattic, 37signals, Better Stack, Doist, Gumroad (no careers page any more), Remote.com, Shopify, Postman, Raycast, Framer, dbt Labs, Deel, Builder.io, Toptal's and Coinbase's own pages (both answered 403; their boards were found on Lever and Greenhouse).

## Conclusion

A connector per platform with a list of company boards is the cheapest way to cover the list: Lever, Ashby and Greenhouse alone cover 24 companies from the owner's list and more than 50 from the Async Jobs catalogue. Small platforms (one or two companies each) and the job portals each need their own connector; the nine companies with their own HTML pages need a page reader per company or a generic one. The epic created from this investigation has one task per platform or portal; each task starts with these findings and confirms the response shape before it fixes the contract.
