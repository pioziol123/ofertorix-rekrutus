# Job offers architecture in the C4 model

Job offers (Oferty pracy) is a private system with a single owner. It collects source ads, lets the owner browse them and assess their match to the professional profile, and gathers information about companies. The diagrams describe the current code and the local Compose configuration, read on 11 November 2026. Dashed lines mark paths available after additional configuration. Arrows point from the initiator of an interaction. [C4 model](https://c4model.com/diagrams)

- [C1 — system context](#c1-kontekst-systemu)
- [C2 — containers](#c2-kontenery)
- [C3 — web and worker components](#c3-komponenty)
- [C4 — code that prepares a profile proposal](#c4-kod-przygotowanie-propozycji-profilu)
- [State of local AI](#stan-lokalnego-ai)

<a id="c1-kontekst-systemu"></a>

## C1 — system context

```mermaid
flowchart LR
  Owner(["Owner<br/>[Person]"])
  System["Job offers<br/>[System]<br/>Collects ads, the professional profile,<br/>match assessments and employer research"]
  Boards["Job offer portals<br/>[External systems]"]
  OpenAI["OpenAI<br/>[External system]"]
  Ollama["Ollama<br/>[System external to the application]"]

  Owner -->|"Browses offers and companies, manages the profile, requests operations"| System
  System -->|"Fetches ad lists and details"| Boards
  System -.->|"Requests profile proposals, assessments and research"| OpenAI
  System -.->|"Checks model availability and generates a profile proposal"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class System internal
  class Owner,Boards,OpenAI,Ollama external
```

The shared portal boundary covers SOLID.Jobs, Bulldogjob, theprotocol.it, Just Join IT, No Fluff Jobs, the portals handled by JobSpy and the separate Himalayas pilot. The import scope depends on the adapter; every source is requested through one operation to one queue, with at most one unfinished sync per source. Basic research uses web search through OpenAI. The result goes to the company profile with its sources. [JobSpy catalogue](../../modules/sources/domain/jobspy-catalog.ts) · [Polish sources catalogue](../../modules/sources/domain/polish-catalog.ts) · [Himalayas pilot](../../scripts/himalayas-sync.ts) · [Research agent](../../modules/ai/infrastructure/adapters/openai-agent.ts)

<a id="c2-kontenery"></a>

## C2 — containers

```mermaid
flowchart LR
  Owner(["Owner<br/>[Person]"])
  Boards["Job offer portals<br/>[External systems]"]
  OpenAI["OpenAI<br/>[External system]"]
  Ollama["Ollama<br/>[External system]"]

  subgraph System["Job offers"]
    Web["Web application<br/>[Nuxt / Vue / Nitro, TypeScript]<br/>Provides the UI and the HTTP API"]
    Worker["Worker<br/>[Node.js, TypeScript, Python]<br/>Handles jobs and the schedule"]
    CLI["CLI tools<br/>[Node.js, TypeScript]<br/>Manual imports and status reads"]
    DB[("PostgreSQL<br/>[Data store]<br/>Application data and pg-boss queues")]
    Files[("CV documents<br/>[File volume]<br/>PDF / DOCX originals")]
  end

  Owner -->|"Uses the UI in a browser, HTTP on loopback"| Web
  Owner -->|"Runs pnpm commands through Compose"| CLI
  Web -->|"Reads and writes data, requests jobs through pg-boss"| DB
  Worker -->|"Receives jobs through pg-boss and saves results"| DB
  CLI -->|"Requests imports and reads statuses"| DB
  Web -->|"Saves and serves CV originals"| Files
  Worker -->|"Reads files for text extraction"| Files
  Worker -->|"Fetches ads over HTTP(S)"| Boards
  Worker -.->|"Calls the Responses API over HTTPS"| OpenAI
  Worker -.->|"Generates a profile proposal over HTTP(S)"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Web,Worker,CLI,DB,Files internal
  class Owner,Boards,OpenAI,Ollama external
```

Nuxt delivers the Vue code that runs in the browser and handles the Nitro routes in the same web application. Compose publishes its port on `127.0.0.1`. PostgreSQL runs in the Compose network. The `pg` and `pg-boss` libraries use PostgreSQL, and pg-boss jobs have the default schema `pgboss`. A separate `migrate` service prepares the application and queue schema at start, before web and the worker start. [Compose](../../compose.yaml) · [Nuxt configuration](../../nuxt.config.ts) · [Database access](../../lib/db.ts) ([rules](moduly-i-zasady-kodu.md#database-access)) · [Queue](../../lib/queue.ts) · [Queue library](../../lib/queues/index.ts) · [Queue initialisation](../../scripts/init-queue.ts)

The `documents` volume is shared by web and the worker under `/data/documents`. The database stores import metadata, extracted text, profile versions and operation results. Python subprocesses serve as adapters started by the worker. [CV import](../../modules/profile/import-cv.ts) · [Worker image](../../Dockerfile) · [Commands](../../package.json)

<a id="c3-komponenty"></a>

## C3 — components

### Web application

```mermaid
flowchart TB
  Owner(["Owner<br/>[Person]"])
  DB[("PostgreSQL<br/>[Container]")]
  Files[("CV documents<br/>[Container]")]
  Ollama["Ollama<br/>[External system]"]

  subgraph Web["Web application · Nuxt"]
    UI["Vue views<br/>[Vue / Nuxt UI]<br/>Offers, profile and companies"]
    Offers["Offers and matching<br/>[Nitro routes + TypeScript modules]<br/>List, filters, assessment history, requests"]
    Profile["Professional profile<br/>[Nitro routes + TypeScript modules]<br/>Draft, versions, CV import, AI proposal"]
    Companies["Companies and research<br/>[Nitro routes + TypeScript modules]<br/>Company profiles, roles on offers, reports"]
    Sources["Source handling<br/>[Nitro routes + TypeScript modules]<br/>Import status and manual requests for Polish sources"]
  end

  Owner -->|"Opens views over HTTP"| UI
  UI -->|"Reads offers and submits instructions, HTTP/JSON"| Offers
  UI -->|"Manages the profile and uploads the CV, HTTP"| Profile
  UI -->|"Edits links and requests research, HTTP/JSON"| Companies
  UI -->|"Reads status or requests an import, HTTP/JSON"| Sources
  Offers -->|"Reads offers, saves assessments and requests matching"| DB
  Profile -->|"Saves versions and requests extraction or a proposal"| DB
  Companies -->|"Saves company profiles and requests research"| DB
  Sources -->|"Reads and requests runs"| DB
  Profile -->|"Saves and serves PDF / DOCX"| Files
  Profile -.->|"Checks the model before a request"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class UI,Offers,Profile,Companies,Sources internal
  class Owner,DB,Files,Ollama external
```

| Component | Entry points and implementation |
| --- | --- |
| Vue views | [Offer list](../../app/pages/offers.vue), [professional profile](../../app/pages/profile.vue), [company details](../../app/pages/companies/%5Bid%5D.vue) |
| Offers and matching | [Offer list API](../../server/api/offers/index.get.ts), [Offers module](../../modules/offers/index.ts), [assessment data in the list](../../modules/matching/read-offer-assessments.ts), [assessment group request](../../server/api/matching/index.post.ts) |
| Professional profile | [Version confirmation](../../server/api/profile/confirm.post.ts), [CV import](../../server/api/profile/imports/index.post.ts), [proposal request](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts), [profile storage](../../modules/profile/infrastructure/persistence/profile.ts) |
| Companies and research | [Company list API](../../server/api/companies/index.get.ts), [links to an offer](../../server/api/companies/%5Bid%5D/links.post.ts), [research request](../../server/api/companies/%5Bid%5D/research.post.ts), [company commands](../../modules/companies/company-commands.ts), [company reads](../../modules/companies/read-companies.ts) |
| Source handling | [Import request](../../server/api/sources/polish.post.ts), [Polish sources status](../../server/api/sources/polish.get.ts), [JobSpy status](../../server/api/sources/jobspy.get.ts) |
| Shared route handling | [Identifier validation, body limit, error mapping and queue client](../../server/utils/http.ts), used by the routes of every module |

### Worker

```mermaid
flowchart TB
  DB[("PostgreSQL<br/>[Container]")]
  Files[("CV documents<br/>[Container]")]
  Boards["Job offer portals<br/>[External systems]"]
  OpenAI["OpenAI<br/>[External system]"]
  Ollama["Ollama<br/>[External system]"]

  subgraph Worker["Worker · Node.js"]
    Runtime["Queue handling and schedule<br/>[TypeScript / pg-boss]<br/>Job registration, recovery, heartbeat"]
    Import["Ad import<br/>[TypeScript / Python]<br/>SOLID.Jobs, Polish sources and JobSpy"]
    Parse["CV extraction<br/>[pdfjs-dist / mammoth]<br/>Reads text from PDF or DOCX"]
    Profile["Profile proposal<br/>[TypeScript]<br/>Prepares and validates professional data"]
    Matching["Match assessments<br/>[TypeScript]<br/>Places one AI assignment per assessed offer, publishes assessments"]
    Research["Basic research<br/>[TypeScript]<br/>Places an agent assignment for research, validates and publishes the report"]
  end

  Runtime -->|"Receives jobs and saves the heartbeat"| DB
  Runtime -->|"Starts an import run"| Import
  Runtime -->|"Passes the CV import ID"| Parse
  Runtime -->|"Passes the AI attempt ID"| Profile
  Runtime -->|"Delivers the AI outcome of an assessment"| Matching
  Runtime -->|"Delivers the AI outcome of a research"| Research
  Import -->|"Fetches ads over HTTP(S)"| Boards
  Import -->|"Saves ads, revisions and statuses"| DB
  Parse -->|"Reads the CV original"| Files
  Parse -->|"Saves the text and the extraction status"| DB
  Profile -->|"Saves the proposal and the attempt state"| DB
  Matching -->|"Saves assessments and history"| DB
  Research -->|"Saves the report version or its message"| DB
  Profile -.->|"Generates a proposal through the Responses API"| OpenAI
  Profile -.->|"Generates a proposal through the Ollama API"| Ollama
  Matching -.->|"Through the AI module: one single call per assessment"| OpenAI
  Research -.->|"Through the AI module: web search and synthesis through the Responses API"| OpenAI

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Runtime,Import,Parse,Profile,Matching,Research internal
  class DB,Files,Boards,OpenAI,Ollama external
```

| Component | Entry points and implementation |
| --- | --- |
| Periodic work | The [periodic process](../../periodic/index.ts), its own container service beside the worker, repeats a [pass](../../periodic/steps.ts) 60 s after the previous one ended: it sends AI operations waiting for the budget, fails AI assignments past their time limit and makes the daily sync request, which requests the SOLID.Jobs import through the [Sources module](../../modules/sources/README.md#requesting-a-sync) once per schedule occurrence. A step's error is logged and the other steps run. |
| Queue and worker libraries | The [worker entry point](../../worker/index.ts) starts the [worker library](../../lib/workers/index.ts): it runs the [module plugins](../../plugins/index.ts), takes jobs of every queue in the database through the [queue library](../../lib/queues/index.ts) and carries each out in a process of a fixed pool, and writes the worker's liveness record. Queue migrations create the queues with their names and key modes written in them; the [queue configuration](../../queues.json) gives the queues' settings, which the migration step applies. The Profile module reads CV text, the Sources module carries out ad syncs and the AI module carries out the operations of its assignments on them. The [carry-over step](../../scripts/carry-over-jobs.ts) of the migration step requests anew, through the owning module, the work a removed queue of the existing path held, and the [end of earlier AI work](../../scripts/end-old-ai-work.ts) has each requesting module mark as failed its matters still waiting for the AI work removed with the old way. |
| Ad import | The [Sources module plugin](../../plugins/sources.ts) registers the [sync job](../../modules/sources/infrastructure/worker/sync-queue.ts) of queue `source-sync-run` (one job of a source at a time, 3 attempts of 1 hour) with the [shared run executor](../../modules/sources/execute-sync-run.ts), which takes an interrupted sync over, and its failure handler, which ends the sync after the last attempt failed. The [sync request](../../modules/sources/request-sync.ts) returns the source's unfinished sync or creates one with its job; [ad and revision storage](../../modules/sources/infrastructure/persistence/source-ads.ts). |
| CV extraction | The [Profile module plugin](../../plugins/profile.ts) registers the [reading job](../../modules/profile/infrastructure/worker/cv-text-queue.ts) of queue `profile-cv-text` (one reading at a time, 2 attempts of 2 minutes) with [`readCvText`](../../modules/profile/extract-cv-text.ts) and its failure handler, which asks for pasted text after the last attempt failed. |
| Match assessments | The [single request](../../modules/matching/request-assessment.ts) and the [group](../../modules/matching/request-assessment-group.ts) place one single-answer assignment per offer, in one save, through [Matching's AI integration](../../modules/matching/infrastructure/adapters/assessment-ai.ts); the AI module funds and carries out each on its own. Matching's receiver of assignments, in the [shared registration](../../receivers/index.ts), checks each result by Matching's own rules in [receive-assessment.ts](../../modules/matching/receive-assessment.ts) and publishes it, or ends the assessment as failed, also after a failure. The [exchange view](../../modules/matching/read-assessment-exchange.ts) reads the exchange of an assessment's operations through the AI module. Assessments made before assignments show only what Matching stored itself. |
| Basic research | The [research request](../../modules/companies/request-research.ts) places one agent assignment with web search through [Companies' AI integration](../../modules/companies/infrastructure/adapters/research-ai.ts); its [receiver](../../modules/companies/receive-research.ts), registered in the [shared registration of receivers](../../receivers/index.ts), validates and publishes or rejects each report, and ends the research as failed when its assignment fails. The search and synthesis run in the AI module's paid executor ([agent session](../../modules/ai/executors/openai-agent-session.ts)). |
| AI assignments | The [AI module plugin](../../plugins/ai.ts) registers [`runOperation`](../../modules/ai/assignments/run-operation.ts) and its failure handler for the queue of each executor, `ai-operation-openai` and `ai-operation-ollama` (one operation of each at a time, 4 attempts of 60 minutes). An operation found running by a later attempt, or left by the last one, ends uncertain and its assignment needs attention. The records of the AI work before assignments are an archive no code reads ([AI module](../../modules/ai/README.md)). |

<a id="c4-kod-przygotowanie-propozycji-profilu"></a>

## C4 — code that prepares a profile proposal

The view shows the calls of proposal preparation across the Profile and the AI module. The Profile knows no provider: it places an assignment under its settings name, and the AI module finds the executor and its parameters for that name. The earlier text extraction belongs to a separate worker component.

```mermaid
flowchart TB
  Prepare["prepare.post.ts<br/>[Nitro route]"]
  Worker["worker library<br/>[queue jobs of the executors]"]
  Periodic["periodic process<br/>[time limit step]"]

  subgraph Profile["Profile module"]
    Enqueue["prepareProposal<br/>[Function · prepare-proposal.ts]"]
    Integration["placeProposalAssignment, proposalAssignmentReceiver<br/>[Integration · proposal-ai.ts]"]
    Receive["takeAssignmentResult, endAssignmentPreparation<br/>[Function · receive-proposal.ts]"]
  end

  subgraph AI["AI module"]
    Place["placeAssignment<br/>[Function · place-assignment.ts]"]
    Run["runOperation<br/>[Function · run-operation.ts]"]
    Limit["failAssignmentsPastTimeLimit<br/>[Function · fail-assignments-past-time-limit.ts]"]
    OpenAI["openAiExecutor<br/>[Executor · openai.ts]"]
  end

  Prepare -->|"Validates the request and passes the text and the revision"| Enqueue
  Enqueue -->|"Places the assignment in its transaction"| Integration
  Integration --> Place
  Worker -->|"Passes the operation ID"| Run
  Run -->|"Carries out the operation"| OpenAI
  Run -->|"Delivers the result"| Integration
  Periodic --> Limit
  Limit -->|"Delivers the failure"| Integration
  Integration -->|"Checks the format and the quotes and saves the proposal, or ends the preparation"| Receive

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Enqueue,Integration,Receive,Place,Run,Limit,OpenAI internal
  class Prepare,Worker,Periodic external
```

`prepareProposal` removes contact data from the passed text, saves its revision, places the assignment and keeps its identifier with the import, in one transaction; placing sends the job of the assignment's first operation to the executor's queue. The worker carries out the operation and delivers the result to the Profile's receiver in the transaction that saves the assignment's final status; a failure, for example at the time limit, reaches the same receiver the same way. The receiver saves the proposal, or the message of the check it failed, on the import, and applying the proposal is a separate operation by the owner. [HTTP entry point](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts) · [Preparation request](../../modules/profile/prepare-proposal.ts) · [Integration with AI](../../modules/profile/infrastructure/adapters/proposal-ai.ts) · [Proposal validation](../../modules/profile/receive-proposal.ts) · [Carrying out an operation](../../modules/ai/assignments/run-operation.ts) · [Applying the proposal](../../server/api/profile/imports/%5Bid%5D/apply.post.ts)

<a id="stan-lokalnego-ai"></a>

## State of local AI

| Area | State in the current code |
| --- | --- |
| Professional profile | Proposal preparation runs on the local executor when the Profile's settings of assignments in the AI module name it; today they name the paid executor. The settings in the AI module choose the model; [Compose](../../compose.yaml) passes `AI_ENDPOINTS_JSON` to web and the worker. A configuration example is in the [environment file](../../.env.example). Model availability and connectivity from the containers need separate verification. |
| Local queue | Operations of the local executor go to its own queue, carried out one at a time in the order they were sent through exclusivity in the queue; a paid operation runs beside them. An operation found running ends uncertain; a local process that was ended may still compute when the next one starts. |
| Offer matching | Each assessment is one assignment of the AI module, carried out by the paid executor as one OpenAI call; a group command places one assignment per offer. The local assessment path is described in the [solution design](../specs/lokalne-ai/solution-design.md). |
| Employer research | The connected basic research uses OpenAI Responses and web search. OpenCode and the browser for local research are described in the [solution design](../specs/lokalne-ai/solution-design.md). |

After changing an entry point, a data store or an external integration, update the relevant view together with the links to the code.
