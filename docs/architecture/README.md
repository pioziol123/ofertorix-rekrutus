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

The shared portal boundary covers SOLID.Jobs, Bulldogjob, theprotocol.it, Just Join IT, No Fluff Jobs, the portals handled by JobSpy and the separate Himalayas pilot. The import scope and how it is started depend on the adapter. Basic research uses web search through OpenAI. The result goes to the company profile with its sources. [JobSpy catalogue](../../lib/sources/jobspy-catalog.ts) · [Polish sources catalogue](../../lib/sources/polish-catalog.ts) · [Himalayas pilot](../../scripts/himalayas-sync.ts) · [Research provider](../../lib/companies/research-provider.ts)

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
  CLI -->|"Requests imports, reads statuses, saves pilot results"| DB
  Web -->|"Saves and serves CV originals"| Files
  Worker -->|"Reads files for text extraction"| Files
  Worker -->|"Fetches ads over HTTP(S)"| Boards
  CLI -->|"Fetches Himalayas offers over HTTPS"| Boards
  Worker -.->|"Calls the Responses, Files and Batch APIs over HTTPS"| OpenAI
  Web -.->|"Checks the model over HTTP(S)"| Ollama
  Worker -.->|"Generates a profile proposal over HTTP(S)"| Ollama

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Web,Worker,CLI,DB,Files internal
  class Owner,Boards,OpenAI,Ollama external
```

Nuxt delivers the Vue code that runs in the browser and handles the Nitro routes in the same web application. Compose publishes its port on `127.0.0.1`. PostgreSQL runs in the Compose network. The `pg` and `pg-boss` libraries use PostgreSQL, and pg-boss jobs have the default schema `pgboss`. A separate `migrate` service prepares the application and queue schema at start, before web and the worker start. [Compose](../../compose.yaml) · [Nuxt configuration](../../nuxt.config.ts) · [Database access](../../lib/db.ts) ([rules](moduly-i-zasady-kodu.md#database-access)) · [Queue](../../lib/queue.ts) · [Queue initialisation](../../scripts/init-queue.ts)

The `documents` volume is shared by web and the worker under `/data/documents`. The database stores import metadata, extracted text, profile versions and operation results. Python subprocesses serve as adapters started by the worker. The Himalayas script runs the import directly from the CLI. [CV import](../../lib/profile/imports.ts) · [Worker image](../../Dockerfile) · [Commands](../../package.json)

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
| Offers and matching | [Offer list API](../../server/api/offers/index.get.ts), [Offers module](../../modules/offers/index.ts), [assessment data in the list](../../lib/matching/list.ts), [assessment group request](../../server/api/matching/index.post.ts) |
| Professional profile | [Version confirmation](../../server/api/profile/confirm.post.ts), [CV import](../../server/api/profile/imports/index.post.ts), [proposal request](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts), [profile storage](../../lib/profile/store.ts) |
| Companies and research | [Company list API](../../server/api/companies/index.get.ts), [links to an offer](../../server/api/companies/%5Bid%5D/links.post.ts), [research request](../../server/api/companies/%5Bid%5D/research.post.ts), [company profile storage](../../lib/companies/store.ts) |
| Source handling | [Import request](../../server/api/sources/polish.post.ts), [Polish sources status](../../server/api/sources/polish.get.ts), [JobSpy status](../../server/api/sources/jobspy.get.ts) |

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
    Matching["Match assessments<br/>[TypeScript]<br/>Single and group batches, publishing assessments"]
    Research["Basic research<br/>[TypeScript]<br/>Collects sources and synthesises the report"]
  end

  Runtime -->|"Receives jobs and saves the heartbeat"| DB
  Runtime -->|"Starts an import run"| Import
  Runtime -->|"Passes the CV import ID"| Parse
  Runtime -->|"Passes the AI attempt ID"| Profile
  Runtime -->|"Passes the request or group ID"| Matching
  Runtime -->|"Passes the research operation ID"| Research
  Import -->|"Fetches ads over HTTP(S)"| Boards
  Import -->|"Saves ads, revisions and statuses"| DB
  Parse -->|"Reads the CV original"| Files
  Parse -->|"Saves the text and the extraction status"| DB
  Profile -->|"Saves the proposal and the attempt state"| DB
  Matching -->|"Saves assessments, history and batch artefacts"| DB
  Research -->|"Saves the report version and the attempt state"| DB
  Profile -.->|"Generates a proposal through the Responses API"| OpenAI
  Profile -.->|"Generates a proposal through the Ollama API"| Ollama
  Matching -.->|"Sends batches and receives results through the Files / Batch API"| OpenAI
  Research -.->|"Searches for sources and synthesises the report through the Responses API"| OpenAI

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Runtime,Import,Parse,Profile,Matching,Research internal
  class DB,Files,Boards,OpenAI,Ollama external
```

| Component | Entry points and implementation |
| --- | --- |
| Queue handling and schedule | [Worker entry point](../../worker/index.ts). At start and every minute it checks for overdue work. The schedule requests the SOLID.Jobs import. |
| Ad import | [SOLID.Jobs](../../lib/sources/sync.ts), [Polish sources](../../lib/sources/polish-sync.ts), [JobSpy](../../lib/sources/jobspy-sync.ts), [ad and revision storage](../../lib/sources/store.ts). |
| CV extraction | [`extractImport`](../../lib/profile/imports.ts) handles `profile-parse`. |
| Profile proposal | [`executeAi`](../../lib/profile/ai.ts) handles `profile-ai`. The paid path uses the [AI budget](../../modules/ai/infrastructure/persistence/budget.ts). |
| Match assessments | The [single request](../../lib/matching/store.ts) and the [group](../../lib/matching/groups.ts) use the [Batch client](../../lib/matching/batch.ts) and the [batch archive](../../lib/matching/archive.ts). |
| Basic research | [`executeCompanyResearch`](../../lib/companies/research.ts) runs `company-research` and uses the [OpenAI provider](../../lib/companies/research-provider.ts). |
| General AI executions | [`runExecution`](../../modules/ai/run-execution.ts) handles `ai-execution` for clients of the [AI module](../../modules/ai/README.md) contract; no client uses it yet. |

<a id="c4-kod-przygotowanie-propozycji-profilu"></a>

## C4 — code that prepares a profile proposal

The view shows the calls inside the profile proposal component and its entry points. The choice of executor is based on the configuration saved with the attempt. The earlier text extraction belongs to a separate worker component.

```mermaid
flowchart TB
  Prepare["prepare.post.ts<br/>[Nitro route]"]
  Worker["worker/index.ts<br/>[profile-ai queue handler]"]

  subgraph Proposal["Code that prepares a profile proposal"]
    Enqueue["prepareProposal<br/>[Function · ai.ts]"]
    Config["profileConfiguration<br/>[Function · ai-configuration.ts]"]
    LocalQueue["enqueueLocalProfile<br/>[Function · local-ai.ts]"]
    Dispatch["executeAi<br/>[Function · ai.ts]"]
    Paid["executePaidProfile<br/>[Function · ai.ts]"]
    Local["executeLocalProfile<br/>[Function · local-ai.ts]"]
    OpenAI["OpenAiAdapter<br/>[Class · models/openai.ts]"]
    Ollama["OllamaAdapter<br/>[Class · models/ollama.ts]"]
    Result["readAiProposal<br/>[Function · ai-result.ts]"]
    Slot["claimLocal<br/>[Function · operations/local.ts]"]
  end

  Prepare -->|"Validates the request and passes the text and the revision"| Enqueue
  Enqueue -->|"Reads the configuration and creates an execution snapshot"| Config
  Config -.->|"Checks the availability of the chosen model"| Ollama
  Enqueue -.->|"Saves a local attempt and requests delivery"| LocalQueue
  Worker -->|"Passes the attempt ID"| Dispatch
  Dispatch -->|"For OpenAI passes the adapter factory to the paid path"| Paid
  Dispatch -.->|"For a saved Ollama snapshot starts the local path"| Local
  Paid -->|"Generates a proposal from the professional data"| OpenAI
  Paid -->|"Validates the model result"| Result
  Local -->|"Claims the shared local slot"| Slot
  Local -->|"Requests generation from the snapshot"| Ollama
  Local -->|"Validates the model result"| Result

  classDef internal fill:#dbeafe,stroke:#2563eb,color:#172554
  classDef external fill:#f1f5f9,stroke:#64748b,color:#0f172a
  class Enqueue,Config,LocalQueue,Dispatch,Paid,Local,OpenAI,Ollama,Result,Slot internal
  class Prepare,Worker external
```

`prepareProposal` removes contact data from the passed text and saves its revision. For OpenAI it creates an attempt with a budget reservation and requests the work once funds are available. For Ollama it saves a local operation and requests delivery through the same pg-boss queue. The worker reads the saved configuration. After validation it saves the proposal on the import, and applying the proposal is a separate operation by the owner. [HTTP entry point](../../server/api/profile/imports/%5Bid%5D/prepare.post.ts) · [Orchestration and settlement](../../lib/profile/ai.ts) · [Profile configuration](../../lib/profile/ai-configuration.ts) · [Local execution](../../lib/profile/local-ai.ts) · [Proposal validation](../../lib/profile/ai-result.ts) · [Applying the proposal](../../server/api/profile/imports/%5Bid%5D/apply.post.ts)

<a id="stan-lokalnego-ai"></a>

## State of local AI

| Area | State in the current code |
| --- | --- |
| Professional profile | The preparation route and the `profile-ai` handler lead to the local executor when the snapshot is Ollama. [Compose](../../compose.yaml) passes `AI_PROFILE_EXECUTION_JSON` and `AI_ENDPOINTS_JSON` to web and the worker. A configuration example is in the [environment file](../../.env.example). Model availability and connectivity from the containers need separate verification. |
| Local queue and recovery | The [local AI migration](../../migrations/1770000000013_local_ai.cjs) adds operation, queue and slot data. The [local profile module](../../lib/profile/local-ai.ts) wakes pending jobs after the end of a generation is confirmed. The [worker](../../worker/index.ts) calls `recoverLocalProfiles` at start and in the schedule cycle. |
| Offer matching | The connected worker uses OpenAI Batch. The local assessment path is described in the [solution design](../specs/lokalne-ai/solution-design.md). |
| Employer research | The connected basic research uses OpenAI Responses and web search. OpenCode and the browser for local research are described in the [solution design](../specs/lokalne-ai/solution-design.md). |

After changing an entry point, a data store or an external integration, update the relevant view together with the links to the code.
