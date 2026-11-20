# Job offers

A private, local tool for fetching and browsing job offers, assessing them against a professional profile and doing company research.

## Technologies

| Area                | Technologies and their use                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application         | Nuxt and TypeScript for the interface and the API. Views use Vue and Nuxt UI. We validate input data with Zod.                                                           |
| Data                | PostgreSQL. We query with `pg` and parameterised SQL, and change the database schema with `node-pg-migrate`.                                                             |
| Background jobs     | A separate TypeScript worker runs jobs from a pg-boss queue that runs on PostgreSQL.                                                                                     |
| Source integrations | Some ad collectors use Python.                                                                                                                                           |
| AI integrations     | We call external models through the OpenAI Responses API, directly or asynchronously through the Batch API. Local execution uses Ollama. Paid calls use a shared budget. |
| Local environment   | Docker Compose runs the database, migrations, the application and the worker. We install JavaScript dependencies with pnpm according to `pnpm-lock.yaml`.                |
| Code checks         | ESLint checks the code, Prettier formats it and Vitest runs the tests. The `pnpm check` command combines lint, type checking and tests.                                  |

Versions and environment configuration are set by [package.json](package.json), [Dockerfile](Dockerfile) and [compose.yaml](compose.yaml). See also [dependencies and migrations](#dependencies-and-migrations).

## How we develop the project

1. We describe product requirements and design decisions in the documentation. [Feature specifications](docs/specs/pierwsza-wersja/README.md)
2. We make a change in the module responsible for the feature. We use the existing tools and dependencies. [Module map](docs/architecture/moduly.md) · [Architecture and coding rules](docs/architecture/moduly-i-zasady-kodu.md)
3. We check the change in the local Compose environment. We run `pnpm check` and the formatting check, and for changes in the database or the queue we also use the integration tests. Details are in the sections [Getting started](#getting-started) and [Developer commands](#developer-commands).

## Getting started

You need a running Docker with Compose v2. The application tools run in containers; you do not need to update Node or pnpm globally. Local Node is used only to generate the configuration file:

```sh
node scripts/setup-env.mjs
docker compose up --build -d --wait
```

Open the [local application](http://127.0.0.1:3100). `WEB_PORT` in `.env` changes the host port. `.env` is local and ignored by Git; the generator does not overwrite an existing file. Do not change the password of an existing database just by editing `.env` — the PostgreSQL initialisation variables apply to a new volume.

Compose runs `db`, the one-off `migrate`, `web` and `worker`. The web server and the worker wait for the migrations, and the migrations wait for the database to be ready. PostgreSQL does not publish a port on the host. The web server is available only on loopback. Changes to Nuxt sources are visible without a rebuild; after changing the worker, run `docker compose restart worker`.

The /offers page shows the importer's data, without the AI integration. By owner's decision the application works without login; loopback provides private access (an SSH tunnel on a future VPS). This setup is not a VPS deployment or the target production configuration.

## Fetching offers

The worker fetches the IT category with the filters `Developer`, `PHP`, `Senior` according to the SOLID.Jobs classification. It adds no salary or location restrictions. It keeps the source data, including missing/unknown values, links and HTML, as data for later safe presentation. The import does not use AI.

```sh
# Manual request, optionally waiting up to 2 minutes
docker compose run --rm tools pnpm source:sync --wait
# Last run and last complete sync
docker compose run --rm tools pnpm source:status
# A specific run
docker compose run --rm tools pnpm source:status <run-uuid>
```

Without `--wait` the command returns the run ID at once. Concurrent requests return the same pending run; with a run in progress, the first request queues one pending run and later ones point at it. `--wait` waits for that run without a time limit and exits with code 1 on an error or a partial result; stopping the command does not stop the run. Every source, from the CLI, the application or the schedule, is requested to one queue: a source runs one import at a time, in the order requested, and different sources run in parallel ([module rules](modules/sources/README.md#requesting-a-sync)). The status contains the number of pages, unique entries and new revisions, and a safe error cause.

The default import runs every day at **08:00 Europe/Warsaw**. The variable `SOURCE_SYNC_TIME=HH:mm` in `.env` changes the time; apply it with `docker compose up -d --force-recreate worker`. The worker checks for an overdue import at start and every minute. After a break of several days it creates one import. A manual import does not replace the scheduled one of the same day. A failed run does not create a loop of automatic requests on the same day; you can retry it manually. A single API request has one retry on a network error/429/5xx, a limited timeout and spacing between requests.

The database stores source ads (`source_ads`), successive changed payloads (`source_ad_revisions`), scope versions and the run history. An identical import creates no new revisions. After an error we keep the pages that were saved correctly. Only a complete import of the same scope can mark a missing offer as unavailable; a partial one does not change the availability of entries it did not see. The source's `valid_to` stays separate information from availability. None of these states means the recruitment process has ended.

The importer detects changes in counters and duplicates between pages, but the API does not guarantee an atomic snapshot of many pages. Interrupting the worker leaves the saved data in place; the queue retries the job and the next attempt continues the same run. Once the delivery of the queue job has ended, recovery marks the abandoned run as partial/failed and a new import can be requested. The list and the details panel use the local API; we do not display earlier content for now.

## Browsing offers

The [offer list](http://127.0.0.1:3100/offers) opens without login. The table, the current details panel and the change history dates use PostgreSQL. Filters and the selected offer are saved in the URL; they do not change the import scope or the professional profile. Available are search, technologies any/all/excluded and required/optional, location/work mode, contract, working time, seniority, availability and pay. Sorting covers the detection/publication date, title and company; a page has 20 items.

The minimum pay filter requires a currency and a period; it checks the upper bound of a matching variant and marks partial coverage. It does not convert currencies, gross/net or periods. Offers with an unknown salary range stay in the results by default; you can hide them. Other explicit filters select known matching values. We present the source description as text. Company names from sources stay separate from company profiles: assigning the publishing company, the employer or the client requires explicit confirmation on the offer.

## Developer commands

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm format:check
docker compose run --rm tools pnpm build
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
docker compose logs --tail=100 web worker migrate
docker compose down
```

`check` runs ESLint, the Nuxt and worker type checks and Vitest. Integration tests require running `web` and `worker` (`up --wait` first).

Health: `/api/health/live` checks that HTTP works, `/api/health/ready` checks that the database answers and the newest migration is applied. The worker's health checks its liveness record, renewed every 10 s by the worker's loop.

Queue settings (attempts, retry delay, time limit, retention) are in [`queues.json`](queues.json), one entry per queue; an absent setting takes pg-boss's default, and `pnpm migrate` applies a change. `WORKER_POOL_SIZE` sets how many jobs of the queue library the worker carries out at once (default 2).

Formatting: `docker compose run --rm tools pnpm format`. Design documentation and agent tool files are excluded from the application's formatting/linting.

## Dependencies and migrations

Base versions: Node 24.15.0, pnpm 10.34.9, PostgreSQL 18.6. `pnpm-lock.yaml` decides the JS dependencies; the build uses `--frozen-lockfile`. Node on the host may have a different version, because Compose runs the whole tool set.

After changing `package.json`, update the lockfile and dependencies in the container, then rebuild the image. The `dependencies` volume holds the development dependencies; after the rebuild run `docker compose run --rm tools pnpm install --frozen-lockfile` before starting services with the new dependencies. Do not delete the database volume while doing this.

`node-pg-migrate` runs the application migrations, and the one-off service also initialises the pg-boss schema. The web server/worker do not run parallel migrators. We use no ORM and no down migrations that delete setup data.

## Durability and security

`database` is a named PostgreSQL volume, `dependencies` a separate tools volume. A plain `docker compose down` and recreating the containers keep the data. Do not use the option that deletes volumes for a daily restart.

An external service makes backups; the application contains no backup mechanism. Keeping the volume across a restart is not a backup. Autostart after login depends on the Docker runtime setting on the Mac; `restart: unless-stopped` does not start Docker itself or services explicitly stopped by `compose down`.

Do not store secrets in code, images, documentation or the public Nuxt configuration. `docker compose config` can print expanded secrets — do not paste its full output into reports.

## Project documentation

[Architecture in the C4 model](docs/architecture/README.md) covers the system context, containers, components and the code that prepares a profile proposal.

[PRD and feature drafts](docs/specs/pierwsza-wersja/README.md). We refine the requirements and solution design before a specific feature. Order: setup → fetching → list → further features.

## Professional profile

The [profile](http://127.0.0.1:3100/profile) lets you fill in experience, skills, direction and expectations by hand. Saving a draft does not activate the changes; confirming creates a kept version. Missing data stays as unknowns. One minimum pay applies to one contract.

A local worker reads a text PDF or a DOCX of up to 10 MiB (a PDF of up to 30 pages). You can also paste text. The originals stay in the named volume `documents`, outside the public directory; the external backup should cover this volume and the database. There is no OCR. The import does not change the profile or the preferences on its own.

AI is inactive by default: it needs the server-only `OPENAI_API_KEY`. The AI module keeps the provider, model and reasoning effort of the profile, the offer assessments and the research under one settings key each, and holds the price lists, token caps and endpoints itself. Both are fixed in its code for now ([client settings](modules/ai/client-settings.ts), [models and prices](modules/ai/model-catalog.ts)); changing a model or a price is a code change. The rates must cover the most expensive allowed variant, and the input cap the full context of the model actually used. [AI module](modules/ai/README.md)

The local profile runs when the profile settings name the local model (`gpt-oss:20b` on Ollama). The endpoint registry `AI_ENDPOINTS_JSON` gives the address of the `ollama` endpoint; an example is commented out in [.env.example](.env.example). The context window is part of the AI configuration. Keep older address versions as long as pending requests use them. Check the connection from the container and the model through the model list before enabling the local path. [Ollama model list API](https://docs.ollama.com/api/tags)

Losing the connection during local generation leaves the slot occupied until the end of the work is confirmed. Operator handling of this state and the panel commands are part of the acceptance of the whole epic. [Runtime contracts](docs/specs/lokalne-ai/kontrakty-runtime.md)

A controlled trial of the real API with a fictional CV passed on 2026-11-01: GPT-6 Luna, a valid schema and evidence from the text, usage settlement. AI was started locally after the configuration was verified. Automated tests still use control responses, with no paid calls. The shared limit is 100 PLN per month in Europe/Warsaw; an unknown cost stays reserved and is included in the budget shown in the profile. Settlement from usage is a conservative accounting estimate. By owner's decision, manual clarification of unknown costs was deferred to a separate task `oferty-pracy-qld`; it does not block using AI.

After changing the key or the configuration in `.env`, recreate the processes: `docker compose up -d --no-deps --force-recreate web worker`. Saving the file alone does not update the environment of running containers. The CV import uses the direct Responses API; the Batch API is intended for future offer assessments and matches.

The profile HTTP tests require a fresh `pnpm build`; they start their own server, schemas and file directory, without modifying the user's profile.

## JobSpy integration (disabled by default)

The worker contains a pinned package of the fork and Python dependencies; manual imports go to the shared source queue. There is no automatic JobSpy schedule. `JOBSPY_ENABLED=false` blocks requesting and running a fetch; enabling it requires `JOBSPY_ENABLED=true` in `.env` and recreating the web and worker services.

Status: `docker compose exec worker pnpm jobspy:status` or GET `/api/sources/jobspy`. After activation, `docker compose exec worker pnpm jobspy:sync --wait` starts a manual import. Indeed uses GraphQL and a limit shared with LinkedIn. Limiting the number of results means an incomplete run; the CLI then returns code 1 even though valid offers were saved. The JobSpy state is separate from the SOLID.Jobs import. Offers keep the origin of the pay; estimates do not confirm that the financial minimum is met, and an ad missing from a limited query does not change its availability.

Code and exact version: [package manifest](integrations/jobspy/manifest.json). [Maintenance guide](integrations/jobspy/README.md), [integration design](docs/specs/jobspy/features/integracja-aplikacji/solution-design.md), [Indeed import design](docs/specs/jobspy/features/indeed-graphql/solution-design.md).

## Himalayas — manual pilot

```sh
docker compose exec -T worker pnpm himalayas:sync
```

A direct TypeScript API, with no key and without JobSpy/Python. The command requests the import to the shared source queue, the worker runs it, and the command waits for completion without a time limit and prints the ID, status, counters and diagnostics of the saved run. Exit code 1 means an error or an incomplete import. The import covers the PHP/Senior/PL query, at most 5 pages of 20 candidates. This pilot has no schedule; you start another run manually. A request during a run queues one pending run. Stopping the command does not stop the run.

Ads are visible in the shared list with the source **Himalayas**, the unchanged source link and a warning that the PHP/senior qualification is unconfirmed. The search also covers incidental mentions in descriptions. We do not treat its results as a profile match. The source's update date does not pretend to be the publication date, and pay does not get a guessed contract or basis. Disappearing from the search does not close a saved offer. The pilot does not run AI.

[Pilot scope and solution](docs/specs/jobspy/features/himalayas/requirements.md). The source requires attribution and the use of `applicationLink`; it may not be used to republish the database in other aggregators.

## Polish portals: Bulldogjob, theprotocol.it, Just Join IT, No Fluff Jobs

The four sources are available in `/offers` in the section "Polskie serwisy — pobieranie ofert" ("Polish portals — fetching offers"). Enter a technology and a level, then choose "Pobierz oferty" ("Fetch offers") next to the source. The import is manual; its criteria do not change the filters for browsing saved offers. The form starts with PHP/Senior, but you can enter e.g. Go or leave the technology and level empty. Missing data on whether a criterion is met does not reject an offer and is reported in the details. An explicitly different known level is skipped.

The connectors use the Python/curl_cffi already in the worker image, a Chrome profile and HTTP/2. They do not need the user's cookies or a login. Bulldogjob and theprotocol use HTML and the embedded `__NEXT_DATA__`. Just Join IT uses a JSON API with a cursor, and No Fluff Jobs a search POST and a details JSON. In NFJ we turned off salary-match and respect the declared pages instead of assuming that the page size is 20. They are independent of the JobSpy fork contract. Pay, contracts, descriptions, technologies and the raw list/detail records go into the shared model and the revision history. Bulldogjob does not mark tags as mandatory; theprotocol keeps the required/optional split.

```sh
# After updating a running environment: create the source queue and restart
# With a clean docker compose up --build the migrate service already does this.
docker compose exec worker pnpm exec tsx scripts/init-queue.ts
docker compose up -d --no-deps worker web

# Manual imports; all means no such criterion
docker compose exec worker pnpm polish:sync --source bulldogjob --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:sync --source theprotocol --technology Go --seniority all --wait
docker compose exec worker pnpm polish:sync --source justjoinit --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:sync --source nofluffjobs --technology PHP --seniority senior --wait
docker compose exec worker pnpm polish:status
docker compose exec worker pnpm polish:status bulldogjob <run-uuid>

# Offline: parsers/transport with synthetic samples, no requests to the portals
docker compose exec worker /opt/jobspy/bin/python -m unittest discover -s tests -p 'test_polish*.py'
```

The default run has a limit of 50 offers, 5 pages, 60 requests and 150 seconds. The CLI lets you change `--max-offers` (1–200), `--max-pages` (1–100) and `--max-requests` (1–250). The time limit still applies. Requests to each source are at least 2 seconds apart; there are no hidden redirects, retries, proxies or solvers. The detail ID must match the list, and the address must belong to the specific portal. An HTML response is limited to 8 MiB, the saved record bundle to 6 MiB and the process to 180 s.

Reaching a limit, a pagination change, a challenge/403/429, a faulty record or a missing description result in an incomplete run. Correctly fetched records are kept, and absent offers **are not automatically marked as unavailable**, also after an empty result. We do not guarantee an atomic snapshot of the portal or market coverage. Concurrent requests for the same source return the active run, even if they have other criteria — after it ends you can start a new one. A restart recovers the state of abandoned jobs.

`POLISH_SOURCES=bulldogjob,theprotocol,justjoinit,nofluffjobs` enables the manual buttons and the CLI for the four sources; `POLISH_SOURCES=none` disables them. No schedule was added. The application request is `POST /api/sources/polish` with JSON matching the form, the status is `GET /api/sources/polish`; the POST requires the same Origin as the application. The direct Python process does not receive the AI keys, the database password or the application's proxy configuration.

Just Join IT searches for the technology through `skills`, `keywords` and `keywordType=skill`; we do not limit it to one main category. For supported levels the source gets `experienceLevels`; the others are checked locally. The cursor comes from `meta.next.cursor`, and when the observed boundary of 10000 is reached the result stays incomplete. We do not present the source's currency conversions as further contracts: only pay with `currencySource=original` is normalised, and all variants stay in raw.

NFJ identifies regional variants of the same publication by matching `reference` values in the list and the details, and without this evidence requires matching IDs (case-insensitive). It saves the canonical `defaultUrl` and fetches the details once per publication. Pagination counters still refer to regional cards, not to the number of saved offers. It keeps musts/nices, the original pay ranges per contract and raw. We read the `posted` timestamp as milliseconds; an expiry date without a time zone stays in raw, and the normalised date stays unknown. The technology name or the level is not derived from the title alone. An unknown level does not reject an offer.

### Offer assessments through the AI module

In the offer details, the section "Dopasowanie do profilu" ("Match to profile") lets you request an assessment based on a confirmed profile version. It shows the rating, a separate completeness, four components, evidence and the history. A result for an older profile/ad stays in the history, marked as stale. This stage does not run assessments or research automatically.

Assessments run through the AI module under the settings key `matching`; they need only `OPENAI_API_KEY`. An assessment from the button in the details is a single call at the **standard** price list of the model; offers selected in the list form one OpenAI batch at the **Batch** price list. The input limit applies to both: a single assessment is refused before any reservation when the exact request body its adapter sends is larger than the limit in UTF-8 bytes (ASSUMPTION(oferty-pracy-0mq.21/ASM-5)), and in a batch each request is checked conservatively by its number of UTF-8 bytes, including the instructions and the schema.

The AI module's `ai-execution` queue carries the work; the worker polls running batches every minute. A request uses the shared AI budget and waits for funds; a group may wait up to 24h for the Batch result, with separate results and settlement per offer. The history shows the state and the cost of each request from the AI module. Migration 18 moved the earlier assessments to AI executions; work in progress at that moment ended as interrupted, with its reservation released.

An uncertain batch creation state has the status "Wysyłka lub koszt wymagają sprawdzenia" ("Submission or cost need checking") and keeps the reservation; there is no automatic resubmission. Identified batches can be checked in the provider's panel. After a completed retrieval the files are deleted; cleanup errors are retried. This does not cover batches from before migration 18: files that a batch from before it left at OpenAI, because its cleanup failed or because it was submitted at the deploy, are not deleted by the application; you can delete them in the provider's panel (ASSUMPTION(oferty-pracy-0mq.21/ASM-9)). We do not delete a file when the creation result of a potentially active batch is unknown: the provider keeps input for 48h; result files for 7 days. In such a case, determine the remote state before a new request, which may generate another cost.

Must-have requirements without unambiguous data need checking. The local check compares a known work mode and full pay variants (currency/period/contract/basis). Text exclusions and the other requirements get no guessed confirmation. The AI assessment alone does not replace verifying them.

At the owner's request the AI module keeps the full batch content locally in PostgreSQL (`matching_batch_artifacts`, migration 12): the exact JSONL sent, the raw result and error files, successive Batch metadata and SHA-256 sums. We save the input before the upload, and all available result files before parsing and remote cleanup. An archive write error during retrieval leaves the files for another read, without another paid request. The archive contains professional profile data and the full model response; it does not contain the API key or authorisation headers. A single assessment keeps its archive in the same table: the exact request body sent to OpenAI and the raw response, saved before the request is sent and before the response is read. It does not go into logs or the repository and has no automatic deletion date.

In the offer details → "Historia zleceń AI" ("AI request history") → "Pobierz archiwum całej partii (JSON)" ("Download the archive of the whole batch (JSON)") you download the local artefacts; in a group this is the full batch of all the offers it covers. A single assessment is not sent in a batch; its archive holds the exact request body sent to OpenAI and the raw response, saved before the request is sent and before the response is read. The download does not query OpenAI. For old or not yet submitted requests the `reconstructedInput` field may contain input reconstructed from the saved requests; it does not pretend to be the original file. We do not reconstruct results deleted earlier. While work is in progress, the archive contains only the artefacts received so far.

In the list, the "Dopasowanie" ("Match") column shows the rating, completeness, components and staleness, and the state of the last request. In "Więcej filtrów" ("More filters") you can set a minimum rating, completeness and the four components, and also the assessment state. The sort "Najlepsze dopasowanie" ("Best match") shows current known assessments before stale ones and those without a rating. The thresholds do not treat unknowns as zero; stale results pass them only when the state "Nieaktualna ocena" ("Stale assessment") is explicitly selected.

Selecting the header applies to the current page. You can keep the selection when moving to the next page; changing filters clears the selection. The limit is 100 offers and 2 MiB of JSONL file. "Oceń zaznaczone" ("Assess selected") shows the total maximum reservation. Offers already pending are reused, and ones excluded locally generate no cost. When the budget is insufficient, the whole new group waits without a partial reservation. A command ID protects against a repeated request after an HTTP response is lost; clicking again with an unchanged selection reads the existing request.

The former `offer-matching` and `offer-matching-group` queues and the `matching_batches` and `matching_groups` tables stay only as history. Tests use a substituted transport, with no paid analyses.

## Companies and basic research

In the `/companies` tab you can create profiles of organisations, brands and companies of unestablished identity. In the ad details choose "Przypisz lub utwórz profil firmy" ("Assign or create a company profile"), then a role and a justification. A matching name/domain does not merge profiles. Technologies from offers are shown separately from research findings.

On a company profile, the button "Uruchom research podstawowy" ("Run basic research") requests collecting sources and a synthesis. The report covers the business, projects, working methods, technologies and risks. Findings have a type, a scope and clickable sources and dates. Searched claims are not automatic confirmation of the facts. Without sources the model should state an unknown. The report is our own synthesis; we do not save full pages or publishers' quotes.

Research runs as agent work in the AI module, with the agent price list of the model named in the research settings: `gpt-6-luna` at the standard (not Batch) rates, maximum input at least 500000 and output 4000–6000 tokens, `reasoning:low`; the comparison model `gpt-4.1-mini` requires at least 100000 input. The reservation of the shared monthly budget covers two runs and three searches at 0.01 USD each, from the agent price list of the AI module (ASSUMPTION(oferty-pracy-0mq.22/ASM-4)). The UI shows the limit before the request. Only the server reads the key; changing `.env` requires recreating web/worker.

A finished report is reused with no TTL. "Odśwież research — nowy koszt" ("Refresh research — new cost") creates a new version; the previous ones stay available to view. Concurrent requests do not duplicate the cost. A missing budget gives a waiting state. An uncertain interruption keeps the reservation and needs attention; a paid attempt is not retried automatically. An error does not delete the previous report. Thresholds for automatic starts and deep research remain later stages.
