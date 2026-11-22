# OpenAI API: overview of all services

Sources as of: **2026-11-21**. This is a general overview of every kind of service OpenAI offers through its API: what each one does, how it is called, the technical facts worth knowing, and what it is good for. It is written for the project owner and for agents who need to know what exists before choosing anything; it is not an integration design for this application and it decides nothing. Only primary sources were used: the official documentation at [developers.openai.com](https://developers.openai.com/api/docs) (the documentation index requested at `platform.openai.com` redirects there), the API reference, the [pricing page](https://developers.openai.com/api/docs/pricing), the [deprecations page](https://developers.openai.com/api/docs/deprecations), the [changelog](https://developers.openai.com/api/docs/changelog) and the official repositories on GitHub. No API calls were made and no key was used; nothing here was tested by running it.

**Main message.** The API of late 2026 differs sharply from the API of a year earlier, so older knowledge and older tutorials mislead:

- The **Responses API** is the main interface. Chat Completions still works but lacks the newer features; the Assistants API was shut down on 2026-08-26.
- The current text models are the **GPT-6 family** (`gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-terra`, `gpt-6-luna`). GPT-4o, GPT-4.1, GPT-5 and `o3` are deprecated with shutdown dates between December 2026 and January 2027.
- Several services are **gone or closing**: video generation (Sora, shut down 2026-09-24), the deep research models (2026-07-23), the hosted Evals platform, Agent Builder and reusable prompt objects (all three on 2026-11-30), and self-serve fine-tuning (new jobs end 2027-01-06).
- Several services are **new**: GPT-Live for voice, the hosted Agents API, the Decisions API, WebSocket mode, Fast and Ultrafast processing, discounted background completion windows, shell, skills and tool search.
- All three text-to-speech models and most older transcription models are deprecated; the listed replacements run through the realtime interfaces.

## How to read this document

- The **service map** below lists every service with its purpose and status. Use it to find a section.
- **Common to the whole API** covers what applies to every service: keys, organizations and projects, SDKs, rate limits and tiers, billing, data retention, versioning and deprecation.
- After that, each service has its own section with the same four parts: *What it does*, *Integration*, *Technical facts*, *Example uses*. Where an example has a limitation, a cost, a condition or a better alternative, it follows under the label **Nuances**.
- **Status wording.** "No status label in the docs" means the documentation does not call the service GA, beta or preview; it is not a claim that the service is GA. Dates are written as in the source.
- **Prices** were read on 2026-11-21 and are examples; the [pricing page](https://developers.openai.com/api/docs/pricing) is the authority.
- **"Not confirmed in the docs"** marks a fact that could not be found in the sources. These points are collected again in the section "What could not be confirmed".
- **The examples** are illustrations written for this overview, from any industry. They show how a documented capability is typically used; they are not taken from the docs and were not run.

Terms used throughout: a **token** is the unit in which text is measured and billed (roughly a word fragment); the **context window** is the maximum number of tokens a model can take in one request; **ZDR** (Zero Data Retention) is an approval-based arrangement under which OpenAI does not keep request content; **SSE** (server-sent events) is a one-way HTTP stream used for streaming output.

## Service map

| Service | What it is for | Status |
| --- | --- | --- |
| **Core text-generation APIs** | | |
| Responses API | Main text-generation API: text/image/file in, typed items out, tools, optional server-side state | No status label; recommended for all new projects |
| Conversations API | Durable server-side conversation object used with Responses | No status label; replacement for Assistants threads |
| Chat Completions API | Older stateless messages-in, choices-out API | Supported, superseded by Responses; no shutdown date |
| Legacy Completions API | Free-text prompt continuation | Effectively shut down: all models retired Sep 28, 2026 (fine-tunes Oct 23, 2026) |
| Assistants API | Server-side assistants, threads and runs | Shut down Aug 26, 2026; replaced by Responses + Conversations |
| Structured Outputs / JSON mode | Model output constrained to a JSON Schema | No status label; JSON mode is the older, not recommended form |
| Function calling / custom tools | Model requests calls to your own code; strict schemas, grammars, async tools | No status label |
| Reasoning | Effort levels, pro mode, summaries, encrypted and persisted reasoning | No status label |
| Images and files as input | Vision and PDF/document/spreadsheet input to text models | No status label |
| Mid-turn steering | Add instructions to a running response over WebSocket | No status label; GPT-6 family only, added Sep 3, 2026 |
| Multi-agent in Responses | Model spawns and coordinates subagents within one request | Beta |
| Reusable prompts (`/v1/prompts`) | Dashboard-managed prompt templates referenced by ID | Deprecated; shutdown Nov 30, 2026 |
| Daybreak (cyber access programs) | Gated access for defensive security work via `access_programs.cyber` | Approval required; no GA/beta label; old aliases deprecated |
| Decisions API | Fast typed answers (probability, choice, score) without text generation | GA since Oct 22, 2026 |
| **Built-in tools, retrieval, files, embeddings and moderation** | | |
| Web search tool (`web_search`) | Answers grounded in current web pages, with citations; image results | No status label; `web_search_preview` legacy; search-preview chat models shut down 2026-07-23 |
| Deep research | Long multi-source research reports | Dedicated models shut down 2026-07-23; replaced by reasoning model + `web_search` + background mode |
| File search tool (`file_search`) | Model searches your uploaded documents and cites them | No status label |
| Vector stores and Retrieval API | Hosted document index; direct semantic search endpoint | No status label (reference examples still send an Assistants beta header) |
| Code Interpreter (`code_interpreter`) and Containers API | Model runs Python in a hosted sandbox; manage sandboxes and their files | No status label |
| Shell tool (`shell`) | Terminal for the model, hosted container or your own runtime | No status label; hosted shell since 2026-02-10; `local_shell` retired |
| Apply Patch tool (`apply_patch`) | Model proposes file diffs that your app applies | No status label |
| Skills | Reusable instruction-and-script bundles mounted in shell environments | No status label; since 2026-02-10 |
| Computer use (`computer`) | Model operates a browser or desktop through screenshots and actions | GA integration per migration table; `computer-use-preview` shut down 2026-07-23 |
| Image generation tool (`image_generation`) | Create and edit images inside a Responses conversation | No status label; transparent background in preview; `gpt-image-1` shut down 2026-10-23 |
| Remote MCP servers (`mcp` + `server_url`) | Let the model call tools on external MCP servers | No status label |
| Secure MCP Tunnel (`mcp` + `tunnel_id`) | Reach private MCP servers without exposing them | Released 2026-05-19 for enterprise customers; no other label |
| Connectors (`mcp` + `connector_id`) | OpenAI-maintained access to Gmail, Drive, Dropbox, Microsoft services | Deprecated for models released after 2026-09-01; no shutdown date |
| Tool search (`tool_search`) | Load tool definitions on demand to save tokens | No status label; since 2026-03-05; `gpt-5.4` and later |
| Programmatic Tool Calling (`programmatic_tool_calling`) | Model writes JavaScript that orchestrates tool calls | No status label; since 2026-07-09 |
| Async tool calling (`async: true`) | Model keeps working while your function runs | No status label; GPT-6 Astra and later |
| Files API | Store files for use by other services | No status label |
| Uploads API | Multi-part upload of large files (up to 8 GB) | No status label |
| Embeddings | Text to vectors for search, clustering, classification | No status label |
| Moderation | Free harmful-content classification of text and images; inline scores | No status label; `text-moderation-*` shut down 2025-10-27 |
| **Delivery modes, processing modes and cost levers** | | |
| Streaming (SSE) | Show output while it is generated; `stream: true` on Responses / Chat Completions | No status label in the docs |
| WebSocket mode (Responses) | Persistent connection for many-turn, tool-heavy runs; parallel lanes, forking, mid-turn steering | No status label; launched Feb 23, 2026 |
| Background mode | Asynchronous long-running responses with polling or webhook; 2h / 8h windows at 30% / 40% discount | No label for background mode; discounted windows in public beta (Nov 17, 2026) |
| Webhooks | Push notification when a response, batch, fine-tune, eval run or call event occurs | No status label; added Jun 24, 2025 |
| Batch API | File of independent requests, 50% cheaper, within 24 hours, separate limits | No status label; released Apr 2024 |
| Flex processing | Cheaper, slower synchronous tier (`service_tier: flex`) | Beta, being wound down; not on GPT-6.2; retirement date not announced |
| Fast mode (formerly Priority processing) | Up to 2.5x faster at about 2x price (`service_tier: fast` / `priority`) | No label; renamed Jul 30, 2026; EU-residency Fast for GPT-5.2 / 5.4 / 5.4 mini shuts down Jan 11, 2027 |
| Ultrafast mode | Fastest tier at 6x price (3x promo on GPT-6.2 until Feb 28, 2027) | No explicit label; generally available to API users for GPT-6 Astra and GPT-6.1 Sol |
| Reserved Tier | Guaranteed capacity per model for Enterprise, bought via sales | No status label |
| Scale Tier | Older Enterprise capacity bundles; only mentioned in passing | Not documented in the API docs; no deprecation entry |
| Prompt caching (+ lifetime options, prewarm, diagnostics) | Cheaper and faster reuse of identical prompt prefixes | Default-on, no label; diagnostics GA Sep 8, 2026; 12h lifetime added Oct 20, 2026 |
| Predicted Outputs | Faster regeneration of mostly-known text in Chat Completions | Tied to GPT-4o / GPT-4.1 models that shut down Jan 14, 2027 (gpt-4.1-nano already shut down Oct 23, 2026) |
| Token counting | Exact input-token count before sending (`POST /v1/responses/input_tokens`) | No status label |
| Compaction | Shrink long conversation context (server-side, trigger, or `POST /v1/responses/compact`) | No status label; standalone Dec 11, 2025, server-side Feb 10, 2026 |
| **Voice, audio, realtime, images and video** | | |
| GPT-Live (Live API, `/v1/live/sessions`) | Full-duplex voice conversations where a separate backend (OpenAI Responses model or your own agent) does reasoning and tools; WebRTC, WebSocket, SIP in and out | GA (gpt-live-1 since 2026-09-10; gpt-live-1.1 since 2026-11-19); recommended start for new voice apps |
| Realtime API (`/v1/realtime`) | Speech-to-speech sessions where one model listens, reasons, calls tools/MCP and speaks; WebRTC, WebSocket, inbound SIP | GA; current models gpt-realtime-2.1 / -mini; gpt-realtime and gpt-realtime-mini deprecated (shutdown 2027-01-20); beta interface shut down 2026-05-12 |
| Realtime transcription | Live captions / streaming speech-to-text without an assistant | No status label; recommended model gpt-live-transcribe (released 2026-07-28) |
| Realtime translation (`/v1/realtime/translations`) | Live speech-to-speech interpretation with transcript deltas | No status label; released 2026-05-07 |
| File transcription (`/v1/audio/transcriptions`) | Transcript of a recorded file, optionally streamed | Active with gpt-transcribe; whisper-1 and gpt-4o-*-transcribe(-diarize) deprecated (shutdown 2027-02-26) |
| Audio translations (`/v1/audio/translations`) | Recorded audio to English text | Deprecated, shutdown 2027-02-26; replacement /v1/realtime/translations |
| Text-to-speech (`/v1/audio/speech`) | Text to spoken audio file/stream | All accepted models deprecated (shutdown 2027-01-06); replacement is gpt-realtime-2.1-mini through the Realtime API |
| Custom voices and voice consents (`/v1/audio/voices`) | Own voice from a description or from a recording with consent | Prompt-to-voice GA (GPT-Live only); recording-based voices limited to eligible customers |
| Audio in Chat Completions | Audio input and/or spoken output in a normal chat request | gpt-audio-1.5 current; gpt-audio and gpt-audio-mini deprecated (shutdown 2027-01-20) |
| Images API (`/v1/images/generations`, `/edits`) | Generate and edit images; SVG and GIF output; streaming previews | Active; newest gpt-image-2.6-sunburst/-flare; gpt-image-1-mini, gpt-image-1.5, chatgpt-image-latest shut down 2026-12-01; gpt-image-2 2027-02-10; variations endpoint retired |
| Video generation (Videos API, Sora 2) | Text/image to video | Shut down 2026-09-24, no replacement |
| Content provenance checks (`/v1/content_provenance_checks`) | Detect OpenAI C2PA metadata / SynthID watermark in images, audio, PDFs | No status label; text checks by application only |
| Decisions voice connection | GPT-Live calling the Decisions API directly for fast typed choices during speech | Feature of GPT-Live released 2026-10-15; Decisions API itself GA |
| **Agent-building products** | | |
| Agents SDK | Open-source TypeScript/Python library that runs the agent loop in your own application: agents, handoffs, guardrails, approvals, sessions, tracing, sandbox agents, voice | No status label; 0.x releases (Python v0.25.0, JS 0.22.0), actively developed |
| Agents API | Hosted agent runtime: OpenAI runs the loop, sessions, sandboxes, tools, subagents, schedules | Public beta since 2026-09-10 (`OpenAI-Beta: agents=v1`) |
| Bedrock Managed Agents | AWS-hosted adaptation of the Agents API with IAM auth | No status label in OpenAI docs (AWS service) |
| Agent Builder | Visual canvas for agent workflows | Deprecated; shutdown 2026-11-30; replaced by Agents SDK or ChatGPT Workspace Agents |
| AgentKit | Umbrella name; today only a pricing row for ChatKit storage and one changelog mention | No current product page |
| ChatKit | Embeddable chat UI with widgets and actions; self-hosted server or legacy hosted sessions | Beta (`OpenAI-Beta: chatkit_beta=v1`); remains available |
| Workspace Agents API | Trigger published ChatGPT workspace agents from a backend (api.chatgpt.com) | No status label; run-status polling in beta |
| GPTs and GPT Actions | Custom ChatGPT versions calling your REST API | ChatGPT product, not an API service; no status label |
| Plugins for ChatGPT and Codex (ex Apps SDK) | Skills + MCP server + optional UI distributed through the ChatGPT/Codex directory | ChatGPT product, not an API service; no status label |
| Codex | Coding agent with CLI, SDK, CI mode; `gpt-5.3-codex` API model | Separate product; `gpt-5.3-codex` deprecated, shutdown 2027-04-01 |
| **Model optimization, evaluation and safety services** | | |
| Evals API and dashboard | Hosted, repeatable tests of model output | Deprecated; read-only since 2026-10-31; shutdown 2026-11-30; replacement Promptfoo |
| Datasets | Dashboard workspace for quick prompt tests and annotation | Deprecated with Evals; shutdown 2026-11-30 |
| Evaluating external models | Running hosted evals against non-OpenAI models | Deprecated with Evals; shutdown 2026-11-30 |
| Graders | JSON-defined scoring rules for evals and fine-tuning | Deprecated; eval use ends 2026-11-30, fine-tuning use follows the 2027-01-06 timeline |
| Trace grading and agent evals | Scoring recorded agent runs in the dashboard | No status label; depends on the Evals dashboard that shuts down 2026-11-30 |
| Prompt optimizer | Dataset-driven automatic prompt rewriting (dashboard) | Deprecated with Evals; shutdown 2026-11-30 |
| Prompt generation | Playground button that drafts prompts and schemas | No status label; dashboard feature, not an API |
| Fine-tuning (overall) | Training a private variant of a base model | Restricted access; new jobs end 2027-01-06; inference until base model shutdown (2027-01-14 for remaining models) |
| Supervised fine-tuning | Training on correct example answers | Restricted; ends 2027-01-06 |
| Vision fine-tuning | Supervised training with image inputs | Restricted; winding down; base model shuts down 2027-01-14 |
| Direct preference optimization | Training on preferred vs non-preferred answers | Restricted; ends 2027-01-06 |
| Reinforcement fine-tuning | Training with a grader as reward | No longer documented; reference marks it "historical"; its o4-mini models shut down 2026-10-23 |
| Model distillation / stored completions | Capturing large-model outputs to train a small model; stored Chat Completions log | Distillation: technique only, no product; stored completions endpoints: no status label |
| Safety classifiers and safety identifiers | Background risk classification; per-user blocking | No status label; always on |
| Cybersecurity checks | Extra safeguards on cyber-capable models | No status label; "still being calibrated" |
| Misalignment monitoring and safety alerts | Async check that an agent follows the user's intent; alerts API | No status label; announced 2026-09-03 |
| Safety enforcement notifications | Webhooks and case lookup for warnings and deactivations | No status label |
| CSAM image classifier | Prioritizing images for human review | Limited access (approved organizations), free; announced 2026-11-16 |
| Under-18 guidance, safety best practices, Private Safety Processing | Policy and guidance | Not API services |
| Red teaming | Adversarial testing: Promptfoo (open source) or enterprise managed offering | Not an API service; no status label |
| **Administration and platform services** | | |
| Administration API | Automate users, projects, keys, limits, audit logs, usage and costs | No status label; launched Aug 1, 2024 |
| Models endpoint | List/retrieve models, shutdown dates, delete fine-tuned model | No status label |
| Workload identity federation | Keyless auth with short-lived tokens | Released May 26, 2026; X.509 variant GA Aug 29, 2026; Codex variant beta |
| Mutual TLS | Client certificate check on API requests | GA since Aug 29, 2026 |
| IP allowlist | Restrict API calls to listed addresses | No status label; released Oct 1, 2025 |
| Private Link | Private Azure network path to the API | No status label; by request only |
| Asymmetric keys (external keys) | Register RSA public key for Private Safety Processing decryption | No status label |
| API organization blocking | Network-level allowlist of organizations via header | No status label |
| Terraform provider | Organization resources as infrastructure as code | Released Jul 29, 2026 (v1.0.0+); webhook resources beta |
| OpenAI CLI | Call the API and admin endpoints from a terminal | No status label |
| OpenAI on Amazon Bedrock | OpenAI models through AWS, OpenAI-compatible API | Available since Jun 1, 2026; no status label |
| OpenAI on Google Cloud | OpenAI models through Google Cloud | Private preview |

## Common to the whole API

### Authentication and API keys

- **Base URL and transport.** Requests go over HTTPS to `https://api.openai.com/v1/...` and carry the credential as an HTTP bearer token: `Authorization: Bearer <key or access token>` ([API overview](https://developers.openai.com/api/reference/overview)).
- **Three credential kinds.** A standard API key for application requests, an Admin API key for the Administration endpoints only, and a short-lived access token obtained through workload identity federation ([API overview](https://developers.openai.com/api/reference/overview)).
- **Project keys owned by a user.** A user-owned project key acts with its owner's access and is meant for that person's own development work, not as the permanent identity of a production application ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).
- **Service accounts.** A service account is a non-human identity that belongs to one project and can own API keys. It is the recommended identity for a deployed application, a scheduled job or a CI workflow. The full key value is returned only once, at creation ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).
- **Admin API keys.** Used for organization management; they cannot be used on non-administration endpoints ([Administration overview](https://developers.openai.com/api/reference/administration/overview)).
- **Key scopes do not add permissions.** A key's scopes can restrict what the key does, but the key never exceeds the effective permissions of its owner (user or service account) ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).
- **Expiration and governance.** Project keys can be created with an expiration date, and administrators can enforce a maximum key lifetime per organization or project (changelog entry of Sep 10, 2026). Administrators can also allow only service-account keys, allow only user-owned keys, or disable new key creation; existing keys are unaffected (changelog entry of Sep 15, 2026) ([changelog](https://developers.openai.com/api/docs/changelog), [production best practices](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys)).
- **Optional routing headers.** `OpenAI-Organization` and `OpenAI-Project` select the organization and project when a user belongs to several organizations or uses a legacy user key ([API overview](https://developers.openai.com/api/reference/overview)).
- **Propagation delays.** Revoking a key takes effect within a few seconds; most other changes that affect authentication propagate within 15 minutes ([API overview](https://developers.openai.com/api/reference/overview)).
- **Request IDs.** Every response carries `x-request-id`; you can also send your own `X-Client-Request-Id` (ASCII, at most 512 characters). Total request headers should stay under 64 KiB ([API overview](https://developers.openai.com/api/reference/overview)).
- **Keyless alternative.** Workload identity federation exchanges a token from your own identity provider for an OpenAI access token that lives at most one hour, so no long-lived key is stored. See the part "Administration and platform services" ([workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation)).
- **Never ship a key to a browser or mobile app.** The docs require keys to be loaded on the server from an environment variable or a secret manager ([API overview](https://developers.openai.com/api/reference/overview)).

### Organizations, projects, roles and groups

- **Hierarchy.** The organization is the top-level account; a project is a workspace for keys, files and other resources. Organization roles apply to all projects, project roles only inside one project ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- **Rate limits and spend limits can be set per project**, which is why the docs recommend separate projects for staging and production ([production best practices](https://developers.openai.com/api/docs/guides/production-best-practices)).
- **Role-based access control (RBAC).** A role is a bundle of permissions (for example "Model capabilities: Request", "Files: Read/Write"). Preset roles are organization owner, organization reader, project owner, project member and project viewer; you can also define custom roles. A user's effective access is the union of all roles, direct or through groups. The same permissions govern the API and the dashboard ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- **Groups.** Collections of users that receive roles; they can be synced from an identity provider through SCIM ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- **Propagation.** Role changes and group sync can take up to 30 minutes ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- **Project-level controls beyond roles.** A project can have a model allowlist or denylist, hosted-tool permissions, a data-retention setting and a set of allowed service tiers ([Admin APIs guide](https://developers.openai.com/api/docs/guides/admin-apis); changelog entry of Oct 21, 2026 in the [changelog](https://developers.openai.com/api/docs/changelog)).
- **Status.** Enhanced RBAC was released on Nov 13, 2025 ([changelog](https://developers.openai.com/api/docs/changelog)); the guide carries no beta or GA label.

### Official SDKs, the CLI and access through other clouds

- **Official SDKs.** TypeScript/JavaScript ([openai-node](https://github.com/openai/openai-node)), Python ([openai-python](https://github.com/openai/openai-python)), .NET (built with Microsoft, NuGet package `OpenAI`), Java ([openai-java](https://github.com/openai/openai-java)), Go ([openai-go](https://github.com/openai/openai-go), import path `openai-go/v3`) and Ruby ([openai-ruby](https://github.com/openai/openai-ruby), Ruby 3.3.0 or later) ([SDKs and CLI](https://developers.openai.com/api/docs/libraries)).
- **Status of the SDKs.** The libraries page gives no GA/beta label for any SDK. The changelog records that Go and Java started as beta SDKs and .NET launched in beta, but the docs do not state when or whether those labels were lifted. Not confirmed in the docs: the current formal status of each SDK ([SDKs and CLI](https://developers.openai.com/api/docs/libraries), [changelog](https://developers.openai.com/api/docs/changelog)).
- **Versioning of SDKs.** Released libraries follow semantic versioning ([API overview](https://developers.openai.com/api/reference/overview)).
- **Agents SDK.** A separate library for orchestrating agents, in [TypeScript](https://github.com/openai/openai-agents-js) and [Python](https://github.com/openai/openai-agents-python) ([SDKs and CLI](https://developers.openai.com/api/docs/libraries)); covered in the agents part of this document.
- **CLI.** A generated `openai` command-line tool; see the part "Administration and platform services" ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).
- **Any HTTP client works.** The API is plain HTTPS with JSON; an OpenAPI specification is published in [openai-openapi](https://github.com/openai/openai-openapi) ([SDKs and CLI](https://developers.openai.com/api/docs/libraries)).
- **Amazon Bedrock.** Since Jun 1, 2026 supported OpenAI models run on AWS behind an OpenAI-compatible Responses and Chat Completions API, on two endpoints (`bedrock-runtime` and `bedrock-mantle`) with different feature coverage. Model IDs take an `openai.` prefix (for example `openai.gpt-6-luna`), availability depends on the AWS Region, and AWS handles access, billing and operations. WebSocket connections and asynchronous tool calling are listed as not available there. The .NET SDK has no Bedrock provider ([OpenAI on Amazon Bedrock](https://developers.openai.com/api/docs/guides/amazon-bedrock), [changelog](https://developers.openai.com/api/docs/changelog)).
- **Google Cloud.** In **private preview** (access by request). Six models are listed (`gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`, `gpt-6-luna`), billed to the Google Cloud account and governed by Google Cloud IAM ([OpenAI on Google Cloud](https://developers.openai.com/api/docs/guides/google-cloud)).
- **Microsoft Azure.** The pricing page says OpenAI models on Azure are billed through Azure, and the libraries page lists Azure-maintained client libraries ([pricing](https://developers.openai.com/api/docs/pricing), [SDKs and CLI](https://developers.openai.com/api/docs/libraries)). The docs contain no dedicated Azure guide.

### Rate limits and usage tiers

- **What is measured.** Requests per minute (RPM), requests per day (RPD), tokens per minute (TPM), tokens per day (TPD), images per minute (IPM), and audio minutes per minute for some streaming audio models. Whichever limit is reached first applies ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)).
- **Where limits apply.** At the organization level and the project level, not per user; they differ by model, and some model families share one limit. Long-context requests have a separate limit ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)).
- **Queued-work limit.** A separate "Batch/Background" limit caps the total input tokens queued per model for Batch jobs and for background requests with `2h` or `8h` completion windows ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)).
- **Usage tiers.** On Oct 6, 2026 the tiers were simplified from five to three paid tiers ([changelog](https://developers.openai.com/api/docs/changelog)). The tier rises automatically as total credit purchases reach each threshold ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#usage-tiers)):

| Tier | Qualification | Approved monthly usage limit |
| --- | --- | --- |
| Free | User in a supported geography | $100 / month |
| Build | $5 in total credit purchases | $500 / month |
| Launch | $100 in total credit purchases | $5,000 / month |
| Grow | $500 in total credit purchases | $200,000 / month |

- **Published standard limits (read 2026-11-21).** Build: 5,000 RPM and 1,000,000 TPM for Astra, Sol and Terra models, 2,000,000 TPM for Luna. Launch: 10,000 RPM and 4,000,000 TPM (Luna 10,000,000 TPM). Grow: 15,000 RPM and 40,000,000 TPM (Luna 30,000 RPM and 180,000,000 TPM). The limits for your organization are shown in the dashboard under Settings > Organization > Limits ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#usage-tiers)).
- **A tier is not model access.** Reaching a tier does not grant every model; a model can be missing because of project model permissions, data-retention settings or model-specific access requirements ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#model-availability)).
- **Headers.** Responses carry `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, the matching `remaining` and `reset` headers, and `x-ratelimit-*-project-tokens` when a project token limit applies. `Retry-After` may be present on a temporary `429` or a `503` ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#rate-limits-in-headers)).
- **Ramp-rate errors.** `429` with code `slow_down` means traffic grew too fast, even inside RPM/TPM limits; `503` with code `server_is_overloaded` means the model is temporarily overloaded. Rule of thumb from the docs: above 1 million input TPM, grow by at most 50% every 15 minutes ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#error-mitigation)).
- **Retries.** The official SDKs retry eligible `429` and `503` responses automatically; failed requests still count against per-minute limits ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#error-mitigation)).
- **Per-project limits.** Project rate limits can be lowered or managed in the dashboard, through the Administration API and through Terraform ([Administration reference](https://developers.openai.com/api/reference/resources/admin), [Terraform: rate limits and spend](https://developers.openai.com/api/docs/guides/terraform/rate-limits-and-spend)).
- **Reserved capacity.** Scale Tier and Reserved Tier are named as options for enterprise customers who need predictable capacity ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#error-mitigation)); they are covered with the processing modes.

### Spend limits

- **Two controls.** A spend alert only sends a notification. A hard spend limit, added on Jul 22, 2026, makes affected requests fail with `429` once tracked monthly spend reaches the amount ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [changelog](https://developers.openai.com/api/docs/changelog)).
- **Scope.** Both exist for the whole organization and for a single project. Error codes are `organization_spend_limit_exceeded` and `project_spend_limit_exceeded` ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)).
- **Not instantaneous.** Recorded spend can slightly exceed the configured amount while the limit state propagates. The limit resets with the next monthly cycle ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)).
- **Separate from the OpenAI-approved usage limit** of the usage tier, which returns `organization_usage_limit_exceeded` when reached ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)).

### Billing model

- **Prepaid credits.** The documented self-serve model is prepaid credits: when none remain, requests fail with `429` and code `credit_balance_exhausted`; Auto Recharge can top the balance up ([error codes](https://developers.openai.com/api/docs/guides/error-codes), [API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)). Not confirmed in the docs: terms of monthly invoicing for larger customers.
- **Per-token pricing.** Text models are priced per 1 million tokens, separately for input, cached input, cache writes (30-minute and 12-hour) and output. Requests above 272K input tokens ("long context") use higher rates ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Example prices, Standard tier, short context (read 2026-11-21).** `gpt-6.2-astra` $8.00 input / $40.00 output; `gpt-6.2-sol` $2.00 / $10.00; `gpt-6.1-terra` $1.00 / $5.00; `gpt-6-luna` $0.10 / $0.50 per 1M tokens ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Service tiers change the rate.** The pricing page has separate tables for Standard, Batch, Flex, Fast (the former Priority processing, renamed on Jul 30, 2026) and Ultrafast. For `gpt-6.2-astra`, Batch costs 50% of Standard and Fast costs twice Standard ([pricing](https://developers.openai.com/api/docs/pricing), [GPT-6.2 Astra model page](https://developers.openai.com/api/docs/models/gpt-6.2-astra)). Flex is being wound down and will not be added to new models ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Other units.** Images are billed in image and text tokens, GPT-Live voice sessions per minute (billed per second), transcription per minute, embeddings per input token; `omni-moderation-latest` is free ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Tools.** Built-in tools add their own charges on top of model tokens, for example web search $10.00 per 1,000 calls plus search content tokens, file search $2.50 per 1,000 calls plus $0.10 per GB of storage per day (1 GB free), containers for Hosted Shell and Code Interpreter from $0.03 per 20-minute session for 1 GB (read 2026-11-21) ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Regional uplift.** Data-residency endpoints cost 10% more for models released on or after March 5, 2026; FedRAMP endpoints also carry a 10% uplift ([pricing](https://developers.openai.com/api/docs/pricing)).
- **API credits for ChatGPT subscribers.** Since Oct 28, 2026, eligible ChatGPT Pro and Business subscriptions can claim free API credits, up to $500 per month, by linking an API organization they own. Unused credits expire at the end of the billing cycle. Codex usage through API keys is not covered ([API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [changelog](https://developers.openai.com/api/docs/changelog)).
- **Tracking.** The dashboard has Usage and Costs views; the same data is available through the Usage and Costs endpoints of the Administration API (the part "Administration and platform services").

### Data retention, privacy and data residency

- **Training.** Since March 1, 2023, data sent to the API is not used to train OpenAI models unless you opt in ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Two kinds of stored data.** Abuse monitoring logs (prompts, responses and derived metadata) and application state (data a feature must persist to work) ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Default retention of abuse logs.** Up to 30 days for all API usage, unless a longer period is required by law or needed to prevent harm. The audio transcription, audio translation and moderation endpoints are listed with no abuse-monitoring retention ([data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint)).
- **Endpoints that keep state until you delete it.** Conversations, ChatKit threads, Agents (`/v1/agents`), vector stores, files, fine-tuning jobs, evals, batches and custom voices. Files can be given an `expires_after` ([data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint)).
- **Responses API.** Response data is stored for at least 30 days by default or when `store` is `true`. Chat Completions keeps no application state by default, with exceptions such as audio output held for 1 hour ([data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses)).
- **Prompt caching** may hold encrypted cache data on GPU-local storage for up to 24 hours ([data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses)).
- **Zero Data Retention (ZDR) and Modified Abuse Monitoring (MAM).** Both exclude customer content from abuse logs; both need prior approval by OpenAI (through sales). ZDR additionally forces `store` to `false` on Responses and Chat Completions. Endpoints marked "not ZDR eligible" may still store state. They are configured per organization and per project ([data controls](https://developers.openai.com/api/docs/guides/your-data#zero-data-retention)).
- **Exception that always applies.** Image and file inputs are scanned for child sexual abuse material; a flagged image is retained for manual review even under ZDR or MAM ([data controls](https://developers.openai.com/api/docs/guides/your-data#image-and-file-inputs)).
- **ZDR with Private Safety Processing (PSP).** Automated safety review without OpenAI retaining prompts or responses; requires customer-controlled storage ([ZDR with Private Safety Processing](https://developers.openai.com/api/docs/guides/private-safety-processing)).
- **Enterprise Key Management (EKM).** Encrypts application state with keys from your own AWS KMS, Google Cloud KMS or Azure Key Vault ([data controls](https://developers.openai.com/api/docs/guides/your-data#enterprise-key-management-ekm)).
- **Data residency.** Chosen per project at creation and not changeable afterwards; requires eligibility through sales. Regions with a domain prefix: United States (`us.api.openai.com`), Europe (`eu.`), Australia (`au.`), Canada (`ca.`), Japan (`jp.`), India (`in.`), Singapore (`sg.`), South Korea (`kr.`), United Kingdom (`gb.`) and United Arab Emirates (`ae.`). All store data in region; regional processing (inference in region) is listed for the US, Europe, Australia, Japan, India and the UAE, not for Canada, Singapore, South Korea or the UK. Since Aug 21, 2026 a Global project can opt in to choosing the region per request ([data residency](https://developers.openai.com/api/docs/guides/data-residency), [changelog](https://developers.openai.com/api/docs/changelog)).
- **System data is not covered** by residency: account data, usage statistics, billing data and similar may be stored elsewhere ([data residency](https://developers.openai.com/api/docs/guides/data-residency)).
- **HIPAA.** Since Oct 5, 2026 admins of eligible organizations can accept a Business Associate Agreement in organization settings ([changelog](https://developers.openai.com/api/docs/changelog)).

### Versioning and deprecation

- **API version.** The REST API is `v1`; the `openai-version` response header currently reports `2020-10-01`. OpenAI states it avoids breaking changes within a major version; adding endpoints, optional parameters, response properties or streaming event types counts as backwards compatible ([API overview](https://developers.openai.com/api/reference/overview#backwards-compatibility)).
- **Beta headers.** Some beta surfaces are switched on with an `OpenAI-Beta` request header, for example `agents=v1` for the Agents API and `responses_multi_agent=v1` ([Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [multi-agent beta](https://developers.openai.com/api/docs/guides/responses-multi-agent)). The retired `realtime=v1` header stopped working on May 12, 2026 ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Snapshots and aliases.** A snapshot is a pinned model version; an alias points to a snapshot and may move. Behaviour can change between snapshots, so the docs advise pinning a version and running evals ([API overview](https://developers.openai.com/api/reference/overview#backwards-compatibility)). Older models have dated snapshots such as `gpt-5.5-2026-04-23`; the GPT-6 Luna page lists only `gpt-6-luna` under "Snapshots" ([GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna)).
- **Lifecycle states.** Active, Deprecated (retirement announced, still usable until the shutdown date) and Shutdown ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Notice periods.** At least 6 months for generally available models; at least 3 months for specialised variants and image generation models; preview models (with `preview` in the name) can be retired with as little as 2 weeks' notice ([deprecations](https://developers.openai.com/api/docs/deprecations#model-deprecation-notice-periods)).
- **Checking shutdown dates in code.** `GET /v1/models` and `GET /v1/models/{model}` return an optional `shutdown_date` field for each model ([deprecations](https://developers.openai.com/api/docs/deprecations#best-practices), [Models reference](https://developers.openai.com/api/reference/resources/models)).
- **Fine-tuned models** follow the shutdown schedule of their base model ([deprecations](https://developers.openai.com/api/docs/deprecations)).

Upcoming feature and endpoint shutdowns ([deprecations](https://developers.openai.com/api/docs/deprecations#feature-and-endpoint-deprecations)):

| Shutdown date | Feature or endpoint | Status | Listed replacement |
| --- | --- | --- | --- |
| Nov 30, 2026 | `/v1/prompts` and reusable prompt objects | Deprecated | Prompt content in application code |
| Nov 30, 2026 | Evals dashboard, API and graders | Read-only | Promptfoo (migration guide) |
| Nov 30, 2026 | Agent Builder | Deprecated | Agents SDK or ChatGPT Workspace Agents; ChatKit stays |
| Jan 6, 2027 | Self-serve fine-tuning job creation | Restricted access | None; inference on existing fine-tuned models continues until the base model is retired |
| Jan 11, 2027 | GPT-5.2, GPT-5.4, GPT-5.4 mini with EU data residency and `service_tier: fast` or `priority` | Deprecated | Same models on Standard, or the GPT-6.2 family |
| Feb 26, 2027 | `/v1/audio/translations` | Deprecated | `/v1/realtime/translations` |

Upcoming model shutdowns ([deprecations](https://developers.openai.com/api/docs/deprecations#upcoming-deprecations)):

| Shutdown date | Models | Listed replacement |
| --- | --- | --- |
| Dec 1, 2026 | `gpt-image-1-mini`, `gpt-image-1.5`, `chatgpt-image-latest` | `gpt-image-2.6-sunburst` or `gpt-image-2.6-flare` |
| Dec 11, 2026 | `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3`, `o3-pro` | `gpt-6.1-sol`, `gpt-6.1-terra` (for mini), `gpt-6-luna` (for nano) |
| Jan 6, 2027 | `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` | `gpt-realtime-2.1-mini` |
| Jan 14, 2027 | GPT-4o, GPT-4o mini, GPT-4.1, GPT-4.1 mini snapshots | `gpt-6-luna` |
| Jan 20, 2027 | `gpt-realtime`, `gpt-realtime-mini`, `gpt-audio`, `gpt-audio-mini`, `gpt-4o-audio`, `gpt-4o-realtime`, their mini variants, `gpt-4o-mini-transcribe-2025-03-20` | `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-audio-1.5` |
| Feb 1, 2027 | `gpt-5.5-cyber-preview` | The most capable cyber model available to the organization |
| Feb 10, 2027 | `gpt-image-2` | `gpt-image-2.6-sunburst` or `gpt-image-2.6-flare` |
| Feb 26, 2027 | `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` | `gpt-live-transcribe` or `gpt-transcribe` |
| Apr 1, 2027 | `gpt-5.3-codex`, `gpt-5.4-nano`, `gpt-5.1` | `gpt-6-sol`, `gpt-6-luna` (for nano) |

Already shut down in 2026 and worth knowing: the Videos API and the `sora-2` models (Sep 24, 2026, no one-to-one replacement), the Assistants API (Aug 26, 2026, replaced by the Responses and Conversations APIs), `dall-e-2` and `dall-e-3` (May 12, 2026), and the GPT-3.5 Turbo, GPT-4 and GPT-4 Turbo models (Oct 23, 2026) ([deprecations](https://developers.openai.com/api/docs/deprecations#past-deprecations)).

### Error handling in brief

Errors come as an HTTP status plus an `error.code` in the body; always read the code, because one status covers several causes. `401` covers a wrong key and a blocked IP (`ip_not_authorized`); `403` covers an unsupported country; `429` covers rate limits, `slow_down`, spend limits, the usage limit and `credit_balance_exhausted`; `500` and `503` are server-side and retryable ([error codes](https://developers.openai.com/api/docs/guides/error-codes)). Only temporary rate-limit and overload errors should be retried; quota and billing errors need an action from you ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#error-mitigation)).

### Current model families at a glance

The model catalog recommends `gpt-6.2-astra` as the flagship, `gpt-6.2-sol` to balance intelligence and cost, and `gpt-6-luna` for cost-sensitive, high-volume work ([models](https://developers.openai.com/api/docs/models)). The model selection guide suggests starting most API workflows with GPT-6.2 Sol at medium reasoning effort ([model selection](https://developers.openai.com/api/docs/guides/model-selection)).

| Family | Model IDs listed as current | Notes |
| --- | --- | --- |
| Flagship text (text and image in, text out) | `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6.1-terra`, `gpt-6-luna` | `gpt-6.2-astra`: 1,050,000-token context window, 128,000 max output tokens ([model page](https://developers.openai.com/api/docs/models/gpt-6.2-astra)) |
| Other active text models | `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.2`, `gpt-5.2-pro` | Listed under "More models" ([all models](https://developers.openai.com/api/docs/models/all)) |
| Image generation and editing | `gpt-image-2.6-sunburst`, `gpt-image-2.6-flare`, `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` | Older image models are deprecated ([all models](https://developers.openai.com/api/docs/models/all)) |
| Realtime and audio | `gpt-live-1.1`, `gpt-live-1`, `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `gpt-realtime-2`, `gpt-realtime-1.5`, `gpt-realtime-translate`, `gpt-live-transcribe`, `gpt-realtime-whisper`, `gpt-audio-1.5`, `gpt-transcribe` | Text-to-speech models `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` are deprecated ([all models](https://developers.openai.com/api/docs/models/all)) |
| Embeddings | `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002` | ([all models](https://developers.openai.com/api/docs/models/all)) |
| Moderation | `omni-moderation-latest` | Text and images; free ([pricing](https://developers.openai.com/api/docs/pricing)) |
| Open-weight | `gpt-oss-120b`, `gpt-oss-20b` | Apache 2.0 licence, downloadable ([all models](https://developers.openai.com/api/docs/models/all)) |
| Specialised, access by approval | Cyber ("OpenAI Daybreak"): `gpt-6-cyber`, `gpt-5.6-cyber`. Life sciences: `gpt-rosalind-research`; the pricing page also lists `gpt-6-rosalind` and `gpt-rosalind-discovery`. Legal configurations: `gpt-6.2-astra-law`, `gpt-6-astra-law` | Approval required for cyber and life-sciences models ([all models](https://developers.openai.com/api/docs/models/all), [pricing](https://developers.openai.com/api/docs/pricing)) |
| ChatGPT model | `chat-latest` | "Not recommended for API use" ([all models](https://developers.openai.com/api/docs/models/all)) |

No video generation model is current: the Videos API was shut down on Sep 24, 2026 ([deprecations](https://developers.openai.com/api/docs/deprecations#past-deprecations)).

**Supported countries.** The API may be used only from the listed countries and territories; access from elsewhere can get the account blocked, and requests from an unsupported location fail with `403`. Poland and the other EU member states are on the list ([supported countries](https://developers.openai.com/api/docs/supported-countries), [error codes](https://developers.openai.com/api/docs/guides/error-codes)).

## Core text-generation APIs

### Responses API

**Status:** No status label in the docs; described as the recommended API for all new projects ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)). Released in March 2025 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
The Responses API is the main way to get a model to generate text. You send text, images or files, and you get back an `output` array of typed "Items": messages, reasoning items, tool calls and others ([text guide](https://developers.openai.com/api/docs/guides/text)). In one request the model can call several built-in tools and your own functions (an "agentic loop") ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)). It can also keep conversation state on OpenAI's side, so you do not have to resend the whole history yourself ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state)).

#### Integration
- Endpoints ([reference](https://developers.openai.com/api/reference/resources/responses)):
  - `POST /v1/responses` creates a response.
  - `GET /v1/responses/{response_id}` retrieves a stored response.
  - `DELETE /v1/responses/{response_id}` deletes it.
  - `POST /v1/responses/{response_id}/cancel` cancels it; this works only for responses created with `background: true`.
  - `GET /v1/responses/{response_id}/input_items` lists the input items of a response.
  - `POST /v1/responses/compact` and `POST /v1/responses/input_tokens` serve compaction and token counting (covered in the part "Delivery modes, processing modes and cost levers").
- Call style: synchronous by default; server-sent events with `stream: true`; a WebSocket mode; asynchronous with `background: true` ([create reference](https://developers.openai.com/api/reference/resources/responses/methods/create), [conversation state](https://developers.openai.com/api/docs/guides/conversation-state)).
- SDKs: the text guide shows official examples for TypeScript, Python, Go, Java, C#, Ruby and an `openai` CLI. Some SDKs offer an `output_text` helper that joins all text output into one string ([text guide](https://developers.openai.com/api/docs/guides/text)).
- Call shape:

```bash
curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "gpt-6.2-sol", "reasoning": {"effort": "low"},
       "input": [{"role": "developer", "content": "Answer in one sentence."},
                 {"role": "user", "content": "What is an idempotent request?"}]}'
```

#### Technical facts
- **Input.** `input` is a string or an array of items. Message roles are `developer` (application rules, higher priority), `user` and `assistant` ([text guide](https://developers.openai.com/api/docs/guides/text)). Content parts include `input_text`, `input_image` and `input_file` ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **`instructions`.** Top-level `instructions` apply only to the request that carries them and are not inherited through `previous_response_id`. From GPT-6.2 they are appended after `input` and billed at the uncached input rate, so reusable rules belong in the first `developer` message, where prompt caching can apply ([text guide](https://developers.openai.com/api/docs/guides/text), [GPT-6.2 guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6.2-astra)).
- **State.** There are three options: resend prior output items yourself, chain with `previous_response_id`, or attach a `conversation`. `previous_response_id` and `conversation` cannot be combined ([create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)). Chaining does not reduce cost: all earlier input tokens in the chain are billed again as input ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state)).
- **Storage.** `store` defaults to `true`. Stored responses are kept for 30 days and are visible in the dashboard logs. Under Zero Data Retention (ZDR, a contract mode with no stored customer content) `store` is always treated as `false` ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Key parameters** ([create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)):
  - `model`, `input`, `instructions`.
  - `max_output_tokens` (minimum 16; it counts reasoning tokens too) and `max_tool_calls`.
  - `reasoning` with `effort`, `mode`, `summary` and `context`.
  - `text.format` (plain text, `json_schema`, `json_object`) and `text.verbosity` (`low`, `medium`, `high`).
  - `tools`, `tool_choice`, `parallel_tool_calls`.
  - `truncation` (`auto` or `disabled`, default `disabled`).
  - `include`, `metadata` (16 key-value pairs), `service_tier`, `prompt_cache_key`, `safety_identifier` (which replaces `user`).
  - `moderation`, which returns moderation results for input and output in the same call.
  - `temperature` and `top_p`.
- **Parameters rejected by new models.** GPT-6 Astra and GPT-6.2 do not accept custom `temperature`, `top_p` or log probabilities ([changelog](https://developers.openai.com/api/docs/changelog), [GPT-6.2 guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6.2-astra)).
- **No multiple candidates.** There is no `n` parameter. A request returns one generation ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
- **Current text models** (from the model pages; prices are Standard, per 1M tokens, input / output, read 2026-11-21):

| Model | Context window | Max input | Max output | Price |
| --- | --- | --- | --- | --- |
| [`gpt-6.2-astra`](https://developers.openai.com/api/docs/models/gpt-6.2-astra) (flagship) | 1,050,000 | 922,000 | 128,000 | $8 / $40 |
| [`gpt-6.2-sol`](https://developers.openai.com/api/docs/models/gpt-6.2-sol) (default for everyday work) | 1,050,000 | 922,000 | 128,000 | $2 / $10 |
| [`gpt-6.1-terra`](https://developers.openai.com/api/docs/models/gpt-6.1-terra) (visual reasoning, computer use) | 1,050,000 | 922,000 | 128,000 | $1 / $5 |
| [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna) (cheapest, high volume) | 1,050,000 | 922,000 | 128,000 | $0.10 / $0.50 |
| [`gpt-6.1-sol`](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | 1,050,000 | 922,000 | 128,000 | $2 / $10 |
| [`gpt-6-sol`](https://developers.openai.com/api/docs/models/gpt-6-sol) | 1,050,000 | 922,000 | 128,000 | $2 / $10 |
| [`gpt-6-astra`](https://developers.openai.com/api/docs/models/gpt-6-astra) | 1,050,000 | 922,000 | 128,000 | $10 / $50 |
| [`gpt-5.6-sol`](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | 1,050,000 | 922,000 | 128,000 | $4 / $20 (promotional until Nov 30, 2026) |
| [`gpt-5.6-terra`](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | 1,050,000 | 922,000 | 128,000 | $2 / $12 |
| [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | 1,050,000 | 922,000 | 128,000 | $0.20 / $1.20 |
| [`gpt-5.5`](https://developers.openai.com/api/docs/models/gpt-5.5) | 1,050,000 | not stated | 128,000 | $5 / $30 |
| [`gpt-5.4`](https://developers.openai.com/api/docs/models/gpt-5.4) | 1,050,000 | not stated | 128,000 | $2.50 / $15 |
| [`gpt-5.4-mini`](https://developers.openai.com/api/docs/models/gpt-5.4-mini) | 400,000 | 272,000 | 128,000 | $0.75 / $4.50 |

- **Other models.** The catalogue also lists GPT-5.2, the Pro variants (GPT-5.2 Pro, 5.4 Pro, 5.5 Pro), `chat-latest` (the ChatGPT model, "not recommended for API use"), the gated Cyber models and GPT-Rosalind for life sciences ([all models](https://developers.openai.com/api/docs/models/all)).
- **Open-weight models.** `gpt-oss-120b` and `gpt-oss-20b` are Apache 2.0 models with a 131,072-token context and text input only. Their model pages list Responses and Batch as supported and Chat Completions as not supported ([gpt-oss-120b](https://developers.openai.com/api/docs/models/gpt-oss-120b)). Not confirmed in the docs: their hosted price.
- **Long-context surcharge.** Requests with more than 272K input tokens cost 2x on input and cache rates and 1.5x on output, for the whole request ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra), [pricing](https://developers.openai.com/api/docs/pricing)).
- **Rate limits.** Limits depend on the usage tier. For example, `gpt-6.2-astra` at the Build tier allows 5,000 requests and 1,000,000 tokens per minute ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra)).
- **Model retirements.** `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3` and `o3-pro` shut down on Dec 11, 2026. GPT-4o, GPT-4o mini, GPT-4.1 and GPT-4.1 mini shut down on Jan 14, 2027. `gpt-5.1`, `gpt-5.3-codex` and `gpt-5.4-nano` shut down on Apr 1, 2027 ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Pitfall: reading the output.** Do not read `output[0].content[0].text`. The array often starts with reasoning or tool items ([text guide](https://developers.openai.com/api/docs/guides/text)).
- **Pitfall: snapshots.** The docs recommend pinning production to a model snapshot and keeping an evaluation suite ([text guide](https://developers.openai.com/api/docs/guides/text)).
- **Code generation.** There is no separate code model line any more. The Codex-named models are shut down or deprecated, and the docs recommend `gpt-6.2-astra` for API code generation and Codex (a separate product) as a ready coding agent ([code generation](https://developers.openai.com/api/docs/guides/code-generation), [all models](https://developers.openai.com/api/docs/models/all)).
- **Prompting guides.** The citation-formatting guide is prompting advice on how to present sources and ask the model to cite them. It is not a separate API feature ([citation formatting](https://developers.openai.com/api/docs/guides/citation-formatting)).

#### Example uses
**Example 1: Support assistant with server-side history.** A help widget answers customer questions over several turns. The first request carries a `developer` message with the rules. Each later request sends only the new user message plus `previous_response_id`.
**Nuances.** The earlier turns are still billed as input on every request, and stored responses expire after 30 days ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state)). For conversations that must live longer, use the Conversations API.

**Example 2: Stateless batch summariser.** A nightly job summarises documents. Each call is independent, with `store: false`, a cheap model such as `gpt-6-luna` and low reasoning effort.
**Nuances.** With reasoning models, leave room in `max_output_tokens`, because reasoning tokens count against it ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).

### Conversations API (conversation state)

**Status:** No status label in the docs. Listed, together with the Responses API, as the replacement for the Assistants API (release date not checked) ([changelog](https://developers.openai.com/api/docs/changelog), [deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
A conversation is a durable server-side object with its own ID. It stores items: messages, tool calls, tool outputs and other data. You pass its ID in `conversation` on a Responses request. The API then prepends the stored items to the input and appends the new input and output after the response completes ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).

#### Integration
Synchronous REST calls ([reference](https://developers.openai.com/api/reference/resources/conversations)):
- `POST /v1/conversations` creates a conversation.
- `GET /v1/conversations/{id}` retrieves it, `POST /v1/conversations/{id}` updates it and `DELETE /v1/conversations/{id}` deletes it.
- `POST /v1/conversations/{id}/items` adds items and `GET /v1/conversations/{id}/items` lists them.
- `GET /v1/conversations/{id}/items/{item_id}` retrieves one item and `DELETE /v1/conversations/{id}/items/{item_id}` deletes it.

Official SDK examples exist in the guide.

#### Technical facts
- You can add up to 20 items at a time when creating a conversation ([reference](https://developers.openai.com/api/reference/resources/conversations)).
- Conversations and their items are not subject to the 30-day limit. They are kept until you delete them ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [data controls](https://developers.openai.com/api/docs/guides/your-data)).
- `/v1/conversations` is not eligible for Zero Data Retention ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- No separate fee is documented. The model tokens of each response are billed as usual. Not confirmed in the docs: a maximum number of items per conversation.
- Pitfall: a long conversation still has to fit the model's context window. See compaction in the part "Delivery modes, processing modes and cost levers" ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state)).

#### Example uses
**Example 1: Long-running case file.** A back-office tool keeps one conversation per customer case for months. Different workers and devices continue it by ID.
**Nuances.** The data stays on OpenAI's side until you delete it. Plan deletion yourself if you have retention duties.

### Chat Completions API

**Status:** Supported but superseded: "While Chat Completions remains supported, Responses is recommended for all new projects" ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)). No shutdown date is listed on the [deprecations page](https://developers.openai.com/api/docs/deprecations).

#### What it does
This is the older text-generation API. You send a `messages` array and get back `choices`, each holding one message. It keeps no state: your application stores the transcript and resends it on every call ([overview](https://developers.openai.com/api/reference/chat-completions/overview), [migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).

#### Integration
- `POST /v1/chat/completions`, synchronous or SSE streaming with `stream: true` ([reference](https://developers.openai.com/api/reference/resources/chat)).
- The stored chat completions endpoints still exist and work only for completions created with `store: true` ([reference](https://developers.openai.com/api/reference/resources/chat)):
  - `GET /v1/chat/completions` lists them.
  - `GET /v1/chat/completions/{id}` retrieves one.
  - `POST /v1/chat/completions/{id}` updates its metadata only.
  - `DELETE /v1/chat/completions/{id}` deletes it.
  - `GET /v1/chat/completions/{id}/messages` returns its messages.
- All official SDKs support it.

#### Technical facts
- **Models.** Current models, including GPT-6.2, accept Chat Completions ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra)). The open-weight `gpt-oss` models do not ([gpt-oss-120b](https://developers.openai.com/api/docs/models/gpt-oss-120b)).
- **Tool calling is restricted.** Starting with GPT-5.4, Chat Completions does not support tool calling when `reasoning_effort` is anything other than `none` ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)). GPT-6 Astra, GPT-6.1 Sol and GPT-6.2 reject `none`, so tool calling with them requires Responses ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning), [changelog](https://developers.openai.com/api/docs/changelog)).
- **What it lacks.** Missing compared with Responses: built-in tools such as web search, file search, code interpreter, computer use and MCP; server-side conversation state; reasoning summaries; encrypted reasoning items; `reasoning.mode: pro` ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses), [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).
- **File inputs.** Only PDFs are accepted, and not by URL ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **Parameter names differ.** Structured Outputs go in `response_format`, not `text.format`. Reasoning effort is `reasoning_effort`, and the output cap is `max_completion_tokens` ([reference](https://developers.openai.com/api/reference/resources/chat)).
- **Multiple candidates.** `n` exists, but "newer models reject an explicit `n`, even `n=1`" ([reference](https://developers.openai.com/api/reference/resources/chat)).
- **Still only here.** Audio input and output run through the `gpt-audio-1.5` model, since audio in Responses is marked "coming soon". Predicted Outputs (the `prediction` parameter, which speeds up regeneration of a mostly unchanged file) are documented only for GPT-4o and GPT-4.1 models, which shut down on Jan 14, 2027; the GPT-6.2 and GPT-6.1 Terra pages list them as unsupported ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses), [predicted outputs](https://developers.openai.com/api/docs/guides/predicted-outputs), [gpt-6.2-sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol)).
- **Storage.** The reference gives `store` a default of `false`, while the migration guide says chat completions "are stored by default for new accounts" (see GAPS). Abuse-monitoring logs are kept for 30 days ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Billing.** Tokens are billed at the same model rates as in Responses. OpenAI reports 40% to 80% better cache use with Responses in internal tests ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).

#### Example uses
**Example 1: Keeping an existing integration alive.** An older product sends plain text prompts through Chat Completions with no tools. It can switch `model` to a current one and keep working. Text-only message arrays are compatible between the two APIs.
**Nuances.** As soon as the product needs tool calls with a reasoning model, it has to move to Responses. The docs suggest migrating one flow at a time ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).

### Legacy Completions API

**Status:** Effectively shut down. The endpoint is documented "for reference", but all its models are gone: `gpt-3.5-turbo-instruct`, `babbage-002` and `davinci-002` shut down on Sep 28, 2026, and their fine-tuned versions on Oct 23, 2026 ([completions guide](https://developers.openai.com/api/docs/guides/completions), [deprecations](https://developers.openai.com/api/docs/deprecations)).

`POST /v1/completions` took a free-text `prompt` (optionally a `suffix` for inserting text in the middle) and returned a continuation. Its last update was in July 2023 ([completions guide](https://developers.openai.com/api/docs/guides/completions)). The current model pages list "Completions (legacy)" as not supported ([gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna)). The stated replacement is the Responses API or Chat Completions; the deprecations page names `gpt-5.6-terra` as the replacement model ([deprecations](https://developers.openai.com/api/docs/deprecations)).

### Assistants API

**Status:** Shut down on Aug 26, 2026 (notice given Aug 26, 2025). The replacement is the Responses API plus the Conversations API ([deprecations](https://developers.openai.com/api/docs/deprecations), [migration guide](https://developers.openai.com/api/docs/assistants/migration)).

The Assistants API kept assistants, threads and runs as server-side objects. The migration guide maps them as follows ([Assistants migration guide](https://developers.openai.com/api/docs/assistants/migration)):

| Before | Now |
| --- | --- |
| Assistant (model, instructions, tools) | Configuration your application passes in each Responses request |
| Thread | Conversation (stores items, not only messages) |
| Run | Response (you manage the tool-call loop yourself) |
| Run step | Item |

Notes:
- An earlier migration path turned assistants into dashboard "prompt objects". Those are now deprecated too, so keep the configuration in code ([Assistants migration guide](https://developers.openai.com/api/docs/assistants/migration)).
- Thread messages can no longer be fetched from the Assistants API. History has to come from your own storage ([Assistants migration guide](https://developers.openai.com/api/docs/assistants/migration)).
- Assistants objects that were never deleted are retained indefinitely, and deleted ones are removed after 30 days ([data controls](https://developers.openai.com/api/docs/guides/your-data)).

### Structured Outputs (and JSON mode)

**Status:** No status label in the docs; listed as a supported feature on the current model pages ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra)). JSON mode is described as the older, not recommended method ([create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).

#### What it does
You supply a JSON Schema and the model's completed, non-refusal answer is constrained to match it: required fields are present and enum values are valid. This removes the need for "please answer in JSON" prompts and retry loops. Your application still has to handle refusals, incomplete responses and business rules that the schema cannot express ([Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)).

#### Integration
- Responses: `text.format = {"type": "json_schema", "name": ..., "strict": true, "schema": {...}}`. Chat Completions: `response_format` with a nested `json_schema` object ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
- The same mechanism powers `strict` function calling ([Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)).
- SDK helpers: Pydantic models in Python, Zod in JavaScript, Sorbet `T::Struct` in Ruby ([Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)).
- It works with streaming, and the docs recommend the SDK helpers for that ([Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)).

#### Technical facts
All from the [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs):
- **Supported types.** String, number, boolean, integer, object, array, enum and `anyOf`. `$defs` and recursive schemas are supported.
- **Supported constraints.** Strings: `pattern` and `format` (`date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`). Numbers: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`. Arrays: `minItems`, `maxItems`.
- **Rules.** The root must be an object, not `anyOf`. Every field must be listed in `required`; an optional field is expressed as a union with `null`. Every object needs `additionalProperties: false`.
- **Not supported.** `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`/`then`/`else`. An unsupported schema with `strict: true` returns an error.
- **Limits.** Up to 5,000 object properties in total and 10 levels of nesting. Up to 120,000 characters in total for property names, definition names, enum values and const values. Up to 1,000 enum values across the schema.
- **Key order.** Output keys follow the order of the keys in the schema.
- **Refusals.** If the model refuses for safety reasons, the output carries a `refusal` content part and no schema-shaped JSON. Check for it before parsing. A response cut by the token limit is incomplete JSON.
- **Switching schema mid-conversation.** On supported GPT-6 and later models, append a `configuration_update` item to `input` and leave `text.format` unchanged. This keeps the prompt cache prefix intact.
- **JSON mode.** `{"type": "json_object"}` guarantees only syntactically valid JSON, not a schema. The word "JSON" must appear somewhere in the context or the API returns an error.
- **Billing.** No separate charge is documented; you pay normal tokens ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Pitfall.** The model always tries to fill the schema, so unrelated input can produce invented values. Tell the model in the prompt what to return when the input does not fit.

#### Example uses
**Example 1: Data extraction from free text.** A service reads incoming emails and returns `{sender_company, order_number, requested_date}` for a database insert. Fields that may be missing are typed as string-or-null.
**Nuances.** The schema guarantees shape, not truth. Validate values, for example that the order exists.

**Example 2: UI built from model output.** A tutoring app asks for a list of solution steps, each with `explanation` and `formula`, and renders each part differently.
**Nuances.** For a plain yes/no, a category or a score, the Decisions API below is faster and cheaper.

### Function calling (custom functions and custom tools)

**Status:** No status label in the docs; listed as a supported feature on the current model pages ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra)).

#### What it does
You describe your own functions, each with a name, a description and a JSON Schema for its parameters. When the model decides it needs one, it returns a `function_call` item with arguments instead of text. Your code runs the function and sends the result back as a `function_call_output` item linked by `call_id`, and the model continues. OpenAI never executes your function ([function calling guide](https://developers.openai.com/api/docs/guides/function-calling)).

#### Integration
The `tools` array goes on `POST /v1/responses`. The loop is: request, tool call, your code, a second request with the output, final answer. It works synchronously, with streaming (arguments arrive as deltas) and over WebSocket ([function calling guide](https://developers.openai.com/api/docs/guides/function-calling)). The Agents SDK (covered in another part) wraps this loop.

#### Technical facts
From the [function calling guide](https://developers.openai.com/api/docs/guides/function-calling) unless another link is given:
- **Strict mode.** `strict: true` makes arguments follow the schema exactly, under the Structured Outputs rules (`additionalProperties: false`, all fields required). If you omit `strict`, Responses tries to normalise the schema into strict mode and falls back to best effort when it cannot. Chat Completions stays non-strict by default.
- **Parallel calls.** The model may return several function calls in one turn. `parallel_tool_calls: false` limits it to zero or one.
- **`tool_choice`.** Values: `auto` (default), `required`, a forced function, `none`, or `allowed_tools`. `allowed_tools` restricts the callable subset without changing the `tools` list, which preserves prompt caching.
- **Custom tools.** A tool of type `custom` receives a free-text string instead of JSON, for example code or a query. You can constrain that string with a context-free grammar in Lark or regex syntax (Rust regex dialect). The API may reject a grammar that is too complex.
- **Namespaces and tool search.** Related tools can be grouped into a namespace. With the `tool_search` tool (GPT-5.4 and later) rarely used tools are loaded only when needed.
- **Async tool calling.** Setting `async: true` on a function or custom tool lets the model keep working while your code runs the tool; you deliver the result later on the original `call_id`. It was added on Sep 3, 2026 for GPT-6 Astra; no status label is given ([async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling), [changelog](https://developers.openai.com/api/docs/changelog)).
- **Tool outputs.** A tool can return a string or an array of image or file objects.
- **Limit on the number of tools.** Not confirmed in the docs: a hard maximum. The guide gives only a soft recommendation of fewer than 20 functions available at the start of a turn.
- **Billing.** Function definitions are injected into the model context and billed as input tokens. Many large schemas cost money on every request.
- **Pitfall: reasoning items.** With reasoning models you must pass back the reasoning items returned alongside the function calls, or use `previous_response_id`. Otherwise the model loses its reasoning ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).
- **Pitfall: API choice.** Tool calling with current reasoning models requires Responses, not Chat Completions ([changelog](https://developers.openai.com/api/docs/changelog)).

#### Example uses
**Example 1: Assistant that reads live data.** A booking chatbot has `find_slots(date, service)` and `create_booking(slot_id, name)`. The model picks the function and the application calls its own database.
**Nuances.** Validate arguments and permissions in your code. The model only proposes the call.

**Example 2: Generating a query in a custom language.** An analytics tool defines a custom tool with a grammar for its filter language, so the model can only emit syntactically valid filters.
**Nuances.** Keep the grammar simple. Complex ones may be rejected or push the model to poor output.

### Reasoning (effort, pro mode, summaries, encrypted reasoning)

**Status:** No status label in the docs. Reasoning is a property of all current flagship models ("Reasoning token support" on the [model pages](https://developers.openai.com/api/docs/models/gpt-6.2-astra)).

#### What it does
Reasoning models produce hidden "reasoning tokens" before the visible answer: they plan, weigh alternatives and decide on tool use. You control how much they think and can get a summary of that thinking. The raw reasoning is never returned ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).

#### Integration
The `reasoning` object goes on `POST /v1/responses`; Chat Completions has only `reasoning_effort`. The docs state that reasoning models perform better through Responses ([reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)).

#### Technical facts
From the [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) unless another link is given:
- **Effort.** `reasoning.effort` can be `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`. Each model supports a subset.
  - GPT-6.2 Astra and Sol reject `none`.
  - GPT-6 Astra rejects `none` (HTTP 400).
  - GPT-6.1 Sol supports neither `none` nor `minimal`.
  - GPT-6 Luna, GPT-6 Sol and GPT-6.1 Terra accept `none`; the default is `medium` ([gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [gpt-6.1-terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)).
- **Pro mode.** `reasoning.mode: "pro"` (the default is `standard`) is available on GPT-5.6 and GPT-6 models, in Responses only. The model does more work for hard tasks. Tokens are billed at the model's normal rates, but more of them are used. Mode and effort are independent settings. Pro mode replaces the separate Pro model IDs: `gpt-5-pro` and `o3-pro` are to be replaced by `gpt-6.1-sol` with `reasoning.mode: pro` ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- **Billing.** Reasoning tokens are billed as output tokens and take space in the context window. The count is in `usage.output_tokens_details.reasoning_tokens`.
- **Truncated output.** If the output hits `max_output_tokens`, the response has status `incomplete`, possibly with no visible text, and you still pay. OpenAI recommends reserving at least 25,000 tokens for reasoning plus output when you start.
- **Summaries.** `reasoning.summary` (`auto`, `concise`, `detailed`) returns a readable summary in the reasoning item. It is opt-in and may require organisation verification.
- **Reasoning across turns.** `reasoning.context` can be `auto`, `current_turn` or `all_turns`. GPT-5.6 models default to `all_turns`, which reuses reasoning from earlier turns. Reuse works only within one model family.
- **Encrypted reasoning.** With `store: false` or ZDR, reasoning items carry `encrypted_content` by default. You pass them back unchanged in the next request. They are decrypted in memory and not stored ([migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)).
- **Dropped reasoning.** The API removes reasoning items when you switch model family, downgrade the model or change organisation. From GPT-6.2 it also removes them when you edit earlier history (a "prefix change") or change `safety_identifier`. The response field `input_transformations` reports what was removed ([keep the prefix unchanged](https://developers.openai.com/api/docs/guides/keep-prefix-unchanged)).
- **Changing effort mid-conversation.** Append a `configuration_update` item rather than changing the request parameter, so the cache prefix stays valid (GPT-6 and later).
- **`phase`.** Assistant messages can be labelled `commentary` or `final_answer`. If you replay history yourself, keep these labels, or the model may treat an interim note as the final answer.

#### Example uses
**Example 1: Tuning cost per task type.** One application uses `low` effort for classifying tickets and `high` for a weekly root-cause analysis, on the same model.
**Nuances.** The docs call effort "a tuning knob, not the primary way to recover quality". Fix the prompt first.

**Example 2: Stateless multi-step agent under ZDR.** A company with Zero Data Retention runs a tool-calling loop and replays every output item, including the encrypted reasoning items, on each request.
**Nuances.** Do not edit earlier items. On GPT-6.2 that discards the reasoning and raises cost.

### Images and files as input

**Status:** No status label in the docs; `image_input` is a supported feature on the current model pages ([gpt-6.2-astra](https://developers.openai.com/api/docs/models/gpt-6.2-astra)).

#### What it does
Text models accept images, so they can describe a picture, read text in it or answer questions about a chart. They also accept files such as PDFs, office documents, spreadsheets and code, as part of the prompt. Output is text only ([images and vision](https://developers.openai.com/api/docs/guides/images-vision), [file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).

#### Integration
Content parts `input_image` and `input_file` go inside a user message on `POST /v1/responses`. The source can be a URL, a Base64 data URL or a `file_id` from the Files API (`POST /v1/files` with `purpose="user_data"`) ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).

#### Technical facts
- **Image formats.** PNG, JPEG, WEBP and non-animated GIF ([images and vision](https://developers.openai.com/api/docs/guides/images-vision)).
- **Image limits.** Up to 512 MB total payload and up to 1,500 images per request. An image that needs more than 30,000 patches (32x32 px squares) after resizing is rejected, not shrunk ([images and vision](https://developers.openai.com/api/docs/guides/images-vision)).
- **`detail`.** Values are `low`, `high`, `original` or `auto`, depending on the model. `original` keeps the image's own dimensions and is meant for OCR and coordinate-sensitive work ([images and vision](https://developers.openai.com/api/docs/guides/images-vision)).
- **Image token cost.** Images are billed as input tokens: patch count times a model multiplier (1.2 for `gpt-6-astra` and GPT-5.x). For `gpt-6-astra` with `detail: high`, a 1024x1024 image costs 1,229 tokens and a 2048x2048 image costs 3,000. Image tokens also count towards the tokens-per-minute limit ([images and vision](https://developers.openai.com/api/docs/guides/images-vision)). There is an [image cost calculator](https://developers.openai.com/api/docs/guides/image-cost-calculator).
- **File types.** PDF, text and code, Word/RTF/ODT, PowerPoint, and CSV/XLS/XLSX ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **File limits.** Each file must be under 50 MB, and 50 MB is also the combined limit per request ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **PDF handling.** The API sends both the extracted text and an image of each page to the model, which raises token use. The `detail` setting on the file controls the page images; `auto` means `high` on GPT-5.6 and later ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **Other documents.** For non-PDF documents only the text is extracted. Embedded charts and images are lost, so convert to PDF first if they matter ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **Spreadsheets.** Only the first 1,000 rows per sheet are parsed, plus generated summary metadata ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **Chat Completions.** It accepts only PDF files, and not by URL ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).
- **Retention.** Image and file inputs are scanned for CSAM and may be retained for review even under ZDR ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- **Vision limits.** Small text, rotated images, precise spatial reasoning and counting can go wrong ([images and vision](https://developers.openai.com/api/docs/guides/images-vision)).

#### Example uses
**Example 1: Reading scanned invoices.** A bookkeeping tool sends each PDF invoice with a Structured Outputs schema and gets the fields back.
**Nuances.** Long PDFs are costly because of page images; use `detail: low` when layout does not matter. For question answering over many large files, File Search (built-in tools part) is the better fit ([file inputs](https://developers.openai.com/api/docs/guides/file-inputs)).

**Example 2: Checking a product photo.** A marketplace asks whether a photo shows the declared item and whether text on the label is legible.
**Nuances.** For a pure yes/no at high volume the Decisions API is cheaper.

### Mid-turn steering

**Status:** No status label in the docs. Added on Sep 3, 2026; available only with the GPT-6 model family and only over the WebSocket connection ([steering guide](https://developers.openai.com/api/docs/guides/steering), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
While a response is still being generated, the user can add a requirement or change direction without waiting for it to finish or cancelling it. The server finishes the current output item and any hosted tool work, then automatically starts a continuation response that includes the new input ([steering guide](https://developers.openai.com/api/docs/guides/steering)).

#### Integration
On an open Responses WebSocket: start with `response.create`; after `response.created`, send `response.steer` with `previous_response_id` and `input`. The server replies `response.steer.accepted`, later possibly `response.steer.pending` or `response.steer.failed`. The .NET SDK has no Responses WebSocket client ([steering guide](https://developers.openai.com/api/docs/guides/steering)).

#### Technical facts
All from the [steering guide](https://developers.openai.com/api/docs/guides/steering):
- It does not rewrite text already sent, undo actions or cancel tools that have started.
- An interrupted response ends as `incomplete` with reason `steered`.
- Token and tool-call limits apply separately to each response in the chain, and each is billed as a normal response.
- If the response is waiting for your function result or an approval, the steering stays queued until you return it.
- Queued steering lives only on the current connection and is lost on disconnect. Keep your own record of what you sent.
- Error codes include `steering_not_supported`, `response_not_found` and `too_many_pending_steers`.

#### Example uses
**Example 1: Correcting a long task as it runs.** A user watches an assistant draft a project plan and types "keep it to two weeks for one developer". The application sends this as `response.steer` and the plan continues with the constraint.
**Nuances.** It requires WebSocket mode. With plain HTTP the alternative is to cancel and resend.

### Multi-agent in the Responses API

**Status:** Beta. Available with GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Sol and all GPT-5.6 models; "item schemas may change" during the beta ([multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent)).

#### What it does
Within one Responses request, the model (the "root agent") can spawn subagents, give them tasks, exchange messages with them, wait for results and merge those into the final answer. OpenAI runs the orchestration. Your application does not implement it ([multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent)).

#### Integration
- Set `multi_agent.enabled: true` on `POST /v1/responses` and send the header `OpenAI-Beta: responses_multi_agent=v1` (or `betas` in the beta SDK, `client.beta.responses`) ([multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent)).
- Over HTTP, the response completes when every agent has finished or is waiting for one of your functions. You run the functions and send a new request.
- Over WebSocket, you inject each function result with `response.inject` while other agents keep working. OpenAI recommends this for tool-heavy work ([multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent)).

#### Technical facts
All from the [multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent):
- `max_concurrent_subagents` defaults to 3. There is no fixed upper bound, and no fixed limit on tree depth or the total number of subagents.
- Subagents share the request's model and tools. Any agent may call your functions.
- New output items are `multi_agent_call`, `multi_agent_call_output` and `agent_message` (encrypted). You must not execute or answer them.
- Unsupported while enabled: `reasoning.summary`, `max_tool_calls` and the `/responses/compact` endpoint. Automatic server-side compaction is switched on implicitly.
- Billing: no separate fee is documented. Adding subagents "can increase token usage".
- It suits independent, bounded workstreams. It does not suit strictly sequential tasks or work on shared mutable state.

#### Example uses
**Example 1: Parallel review of a large change.** A code-review service asks the model to review a pull request. The root agent spawns one subagent per area (security, tests, API compatibility) and merges their findings.
**Nuances.** It is a beta with changing schemas and higher token use. For a fixed, deterministic workflow, orchestrate separate requests yourself or use the Agents SDK (agents part).

### Reusable prompts (prompt objects, `/v1/prompts`)

**Status:** Deprecated; shutdown scheduled for Nov 30, 2026 (notice Jun 3, 2026). Replacement: keep prompts in application code ([deprecations](https://developers.openai.com/api/docs/deprecations), [migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object)).

A prompt object was a template created in the dashboard, with versions and variables, that a Responses request referenced through the `prompt` parameter instead of sending the text ([create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)). The migration guide says to move the text into a small prompts module, turn variables into typed function arguments, pass the resulting messages through `input`, and version them with git, review and tests. Static content should come first and dynamic content later, so prompt caching still works ([migration guide](https://developers.openai.com/api/docs/guides/prompting/migrate-from-prompt-object), [prompting guide](https://developers.openai.com/api/docs/guides/prompting)). Do not start new work on it: the shutdown is nine days after the date of this document.

### Daybreak in the Responses API (cyber access programs)

**Status:** Gated access programme requiring OpenAI approval; no GA/beta label in the docs. The aliases `gpt-daybreak-blue-latest` and `gpt-daybreak-red-latest` are deprecated, and `gpt-5.5-cyber-preview` shuts down on Feb 1, 2027 ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak), [all models](https://developers.openai.com/api/docs/models/all), [deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Daybreak is OpenAI's trusted-access programme for defensive cybersecurity. Approved organisations get fewer refusals on security work from general models (Daybreak Blue) and access to purpose-trained models such as GPT-6 Cyber and GPT-5.6 Cyber (Daybreak Red). Typical work is vulnerability research, reproduction in an authorised test environment and patch validation ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak), [changelog](https://developers.openai.com/api/docs/changelog)).

#### Integration
On `POST /v1/responses`, set `access_programs.cyber` to `standard`, `daybreak_blue` or `daybreak_red`, using a key from an approved, non-default project. The Agents API accepts the same setting per session ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)).

#### Technical facts
- **Which value for which model.** GPT-6 Sol and GPT-6 Luna take `daybreak_blue` with Blue or Red approval. GPT-6.2 Astra and Sol, GPT-6.1 Sol and Terra, and GPT-6 Astra also take `daybreak_blue` but need Red approval. GPT-6 Cyber and GPT-5.6 Cyber take `daybreak_red`, and GPT-6 Cyber needs an additional model approval ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)).
- **Requirements.** Red organisations must enforce SSO and MFA. GPT-6 Cyber also needs an IP allowlist and, under ZDR, Private Safety Processing ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)).
- **Default when omitted.** For `gpt-6.1-terra` and newer, omitting the parameter means `standard` ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)).
- **Errors.** `400 invalid_access_program`, `400 unsupported_access_program` and `403 access_program_not_enabled` ([Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)).
- **Price** (read 2026-11-21, per 1M tokens, short context). `gpt-6-cyber`: $20 input / $100 output. `gpt-5.6-cyber`: $12.50 / $75 ([pricing](https://developers.openai.com/api/docs/pricing)).
- **Models.** GPT-6 Cyber has a 1,050,000-token context; GPT-5.6 Cyber has 400,000 ([gpt-6-cyber](https://developers.openai.com/api/docs/models/gpt-6-cyber), [gpt-5.6-cyber](https://developers.openai.com/api/docs/models/gpt-5.6-cyber)).

#### Example uses
**Example 1: Validating a security patch.** A security team with Blue approval asks `gpt-6-sol` to design regression tests for a path-traversal fix, sending `access_programs: {"cyber": "daybreak_blue"}`.
**Nuances.** It is irrelevant for an ordinary product. Without approval the standard safeguards apply and the request with a Daybreak value fails with 403.

### Decisions API

**Status:** GA since Oct 22, 2026 (beta from Oct 6, 2026) ([Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
This is a separate endpoint that does not generate text. It evaluates text, images or JSON and returns typed answers: the probability that a condition is true (`predicate`), one option from a fixed list (`choice`), or a rating against ordered levels (`score`). OpenAI describes it as about 10x faster than the Responses API. It is meant for classification, routing and prioritisation ([Decisions guide](https://developers.openai.com/api/docs/guides/decisions)).

#### Integration
`POST /v1/decisions`, synchronous, with three fields: `model`, `input` (shared evidence: text or a list of messages and tool calls) and `questions`. The response holds an `answers` array keyed by each question's `name`. Usage reporting is at `GET /v1/organization/usage/decisions` ([Decisions guide](https://developers.openai.com/api/docs/guides/decisions)).

#### Technical facts
All from the [Decisions guide](https://developers.openai.com/api/docs/guides/decisions):
- The only supported model is `gpt-6-luna`.
- Up to 400 questions per request.
- Inputs are text, images (URL or Base64) and JSON (`input_json`). Files and audio are not supported.
- Price (read 2026-11-21): $0.10 per 1M uncached input tokens; output tokens are not charged. Prompt caching applies to a shared `input` prefix of at least 1,024 tokens.
- It supports ZDR and HIPAA use for eligible customers.
- Answers include probabilities and a `confidence` value, so you set your own thresholds.
- Questions that depend on an earlier answer need separate requests.

#### Example uses
**Example 1: Routing incoming messages.** A help desk sends each message with one `choice` question (billing, technical, sales) and one `predicate` question ("is the customer threatening to cancel?") and routes on the result.
**Nuances.** When you need extracted fields or an explanation, use Structured Outputs in the Responses API instead.

## Built-in tools, retrieval, files, embeddings and moderation

A "built-in" (or "hosted") tool is a capability you switch on by adding an entry to the `tools` array of a model request; the model decides when to call it. The current list of tools is on the [Using tools](https://developers.openai.com/api/docs/guides/tools) page: function calling, web search, remote MCP servers, Skills, shell, computer use, image generation, file search, tool search and Programmatic Tool Calling. Code Interpreter and Apply Patch have their own guides but are missing from that overview list. Tools can be configured in three places: on a Responses API request, on an Agents API agent (`agent.tools`), or in an Agents SDK agent definition ([Using tools](https://developers.openai.com/api/docs/guides/tools)). Function calling, the Agents API and the Agents SDK are described in other parts of this document.

Two things apply to every tool here:

- Tokens that a built-in tool feeds into the model are billed at the chosen model's per-token rates, on top of any per-call fee ([pricing](https://developers.openai.com/api/docs/pricing), read 2026-11-21).
- The "Usage notes" tables at the bottom of several tool guides still list "Responses, Chat Completions, Assistants" as API availability, even where the guide's own text says the tool is Responses-only, and even though the Assistants API was shut down on 2026-08-26 ([deprecations](https://developers.openai.com/api/docs/deprecations)). Where they conflict, this section follows the guide's text and flags the conflict.

### Web search tool

**Status:** no status label in the docs for `web_search`. The older `web_search_preview` tool type is described as legacy but still accepted ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)). The search-preview chat models `gpt-4o-search-preview` and `gpt-4o-mini-search-preview` were shut down on 2026-07-23 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Lets a model look things up on the internet while it answers and return text with inline source citations. With reasoning models it can run several searches, open pages and search within a page before answering. It can also return image results (photos of products, places, events) alongside text ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)).

#### Integration
- Responses API: `POST /v1/responses` with `tools: [{ "type": "web_search" }]`. Synchronous or SSE streaming; for runs that take minutes, the guide recommends background mode (asynchronous, retrieve the result later) ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)).
- Chat Completions: no tool; you call a dedicated search model, `gpt-5-search-api`, which always searches before it answers ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#limitations)).
- Agents API: built-in web search exists as an agent tool ([Agents API web search](https://developers.openai.com/api/docs/guides/agents-api/tools/web-search)).
- Realtime API: not listed; the Realtime tools guide covers only `function` and `mcp` tools ([Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)).
- The guide shows examples for the official SDKs (the page carries code tabs for several languages).

#### Technical facts
- Tool types in the Responses reference: `web_search` (also `web_search_2025_08_26`) and `web_search_preview` (also `web_search_preview_2025_03_11`) ([Responses reference](https://developers.openai.com/api/reference/resources/responses)).
- Models: the model pages list `web_search` as a supported tool for the current GPT-5.2 through GPT-6.2 families, among others; the guide recommends `gpt-6.2-astra` for new integrations ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [models](https://developers.openai.com/api/docs/models)).
- Output: a `web_search_call` item (action `search`, `open_page` or `find_in_page`) plus a message with `url_citation` annotations. If you display results, you must show the citations as visible, clickable links ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations)).
- Controls available only on `web_search` in Responses: `filters` (up to 100 allowed or 100 blocked domains), `external_web_access: false` (cache-only, no live fetch), `return_token_budget` (`default` or `unlimited`), `search_context_size` (`low`/`medium`/`high`), `user_location`, image search via `search_content_types` ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search)).
- Limit: the web search context window is capped at 128k tokens even if the model's own window is larger; `gpt-5-search-api` has a 200k window ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#limitations)).
- Rate limits: the same tiered limits as the underlying model ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#usage-notes)).
- Price (read 2026-11-21): $10.00 per 1,000 calls plus search content tokens at the model's rates; `web_search_preview` on non-reasoning models is $25.00 per 1,000 calls with free content tokens; `gpt-5-search-api` is $1.25 input / $10.00 output per 1M tokens ([pricing](https://developers.openai.com/api/docs/pricing)).
- Data: web search with live internet access is not HIPAA eligible; the cache-only mode can be covered under conditions ([data controls](https://developers.openai.com/api/docs/guides/your-data#web-search)).
- Pitfall: with `tool_choice: "auto"` the model may skip searching; force it with `tool_choice: "required"` when a search must happen ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#limitations)).

#### Example uses
**Example 1: Answers that depend on today's facts.** A support assistant for a travel service must answer questions about current entry rules. Each request enables `web_search` with `filters.allowed_domains` limited to a handful of government sites, and the application renders the returned citations as links.
**Nuances.** Every search action costs a tool-call fee on top of tokens, so a chatty assistant with search always on gets expensive; let the model decide, or route only some questions to it.

**Example 2: Finding reference pictures.** A catalogue editor wants candidate photos of a landmark. The request sets `search_content_types` to include `image` and reads `web_search_call.results[]` for image URLs and source pages.
**Nuances.** Image results arrive in the tool-call item, not in the message text, and you need to request them with `include` ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#image-search-results)). The docs do not say anything about the licence of returned images.

### Deep research

**Status:** the dedicated models are shut down. `o3-deep-research` and `o4-mini-deep-research` (and their 2025-06-26 snapshots) stopped working on 2026-07-23; the listed replacement is `gpt-5.6-sol` ([deprecations](https://developers.openai.com/api/docs/deprecations), [o3-deep-research model page](https://developers.openai.com/api/docs/models/o3-deep-research)).

Deep research no longer exists in the API as a separate model or tool. The retired model page points to the "Run longer web research" section of the web search guide, and the old guide address `https://developers.openai.com/api/docs/guides/deep-research` now serves the web search guide. The current way to get the same result is a reasoning model (the guide names `gpt-6.2-astra` with `high` or `xhigh` reasoning effort) plus the `web_search` tool, optionally `return_token_budget: "unlimited"`, run in background mode ([web search guide](https://developers.openai.com/api/docs/guides/tools-web-search#run-longer-web-research)). If the research must also read private data, the docs tell you to do the public web search and the private MCP lookups in separate requests, to avoid leaking private data through search queries ([MCP guide, prompt injection](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#risks-and-safety)). "Deep research" still appears in the docs as a ChatGPT feature that custom MCP servers can feed with `search` and `fetch` tools ([Building MCP servers](https://developers.openai.com/api/docs/mcp)).

### File search tool

**Status:** no status label in the docs ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search)).

#### What it does
Lets the model search your own uploaded documents during a response, using both meaning-based (semantic) and keyword search, and answer with citations to the files. The documents live in a "vector store", an index that OpenAI builds and hosts for you (see the next section). OpenAI runs the search; your code does nothing during the call ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search)).

#### Integration
`POST /v1/responses` with `tools: [{ "type": "file_search", "vector_store_ids": ["vs_..."] }]`. Synchronous or streamed. The guide says the tool is "available in the Responses API"; its usage table also lists Chat Completions and Assistants, which contradicts the text (see GAPS). Preparation is three calls: upload a file (`POST /v1/files`), create a vector store (`POST /v1/vector_stores`), attach the file and wait until its status is `completed` ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search#how-to-use)).

#### Technical facts
- Models: listed as a supported tool on current model pages from GPT-5.2 to GPT-6.2 ([models](https://developers.openai.com/api/docs/models)).
- Options: `max_num_results` (1 to 50), `filters` on file attributes, `ranking_options` (ranker, `score_threshold`, hybrid weights) ([Responses reference](https://developers.openai.com/api/reference/resources/responses)).
- Output: a `file_search_call` item and a message with file citations. The raw retrieved chunks are returned only if you ask for them with the `include` parameter ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search#include-search-results-in-the-response)).
- Supported files: text, code, `.pdf`, `.doc`, `.docx`, `.pptx`, `.html`, `.json`, `.md` and similar; no spreadsheets or images in the list ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search#supported-files)).
- Rate limits: 500 requests per minute on the Build tier, 1,000 on Launch and Grow ([file search guide](https://developers.openai.com/api/docs/guides/tools-file-search#usage-notes)).
- Price (read 2026-11-21): $2.50 per 1,000 tool calls (Responses API only) plus vector store storage at $0.10 per GB per day after the first free GB ([pricing](https://developers.openai.com/api/docs/pricing)).
- Not confirmed in the docs: the maximum number of vector stores one `file_search` tool entry may reference.

#### Example uses
**Example 1: Question answering over a manual.** A hardware maker uploads 300 PDF manuals into one vector store. The support chat enables `file_search`, and each answer cites the manual it came from.
**Nuances.** PDFs are indexed as text; the guide does not describe extraction of charts or scanned pages. For small documents it is simpler to pass the file directly as a model input (covered with the core text APIs).

**Example 2: One index, many tenants.** A SaaS product stores every customer's documents in one store and sets a `customer_id` attribute on each file. Each request passes a `filters` condition so the model only sees that customer's files.
**Nuances.** The isolation depends on your code always sending the filter; a separate vector store per customer is the stricter design.

### Vector stores and the Retrieval API

**Status:** no status label in the docs. The reference examples for vector stores still send the header `OpenAI-Beta: assistants=v2`, a leftover from the Assistants API ([vector stores reference](https://developers.openai.com/api/reference/resources/vector_stores)).

#### What it does
A vector store is a hosted search index: you add files, OpenAI splits them into chunks, computes embeddings (numeric representations of meaning) and indexes them. The Retrieval API is the search endpoint over a vector store that you can call directly, without a model, and get back ranked chunks. The same stores feed the file search tool ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval)).

#### Integration
All synchronous REST calls; adding files is asynchronous (poll the status, or use SDK helpers such as `create_and_poll`) ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#vector-store-file-operations)).
- Stores: `POST /v1/vector_stores`, `GET /v1/vector_stores`, `GET|POST|DELETE /v1/vector_stores/{id}`.
- Search: `POST /v1/vector_stores/{id}/search`.
- Files in a store: `POST|GET /v1/vector_stores/{id}/files`, `GET|POST|DELETE /v1/vector_stores/{id}/files/{file_id}`, plus a content endpoint.
- File batches: `POST /v1/vector_stores/{id}/file_batches`, retrieve, cancel, list files ([vector stores reference](https://developers.openai.com/api/reference/resources/vector_stores)).

#### Technical facts
- Search: 10 results by default, up to 50 (`max_num_results`); optional `rewrite_query` rewrites a conversational question into a search query; `filters` and `ranking_options` as for file search ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#performing-semantic-search)).
- File limits: 512 MB and 5,000,000 tokens per file ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#limits)).
- Chunking: default 800-token chunks with 400-token overlap; configurable with `chunking_strategy` (chunk size 100 to 4096 tokens, overlap at most half the chunk size) ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#chunking)).
- Attributes: up to 16 key-value pairs per file (keys up to 64 characters, string values up to 512), used in comparison and `and`/`or` compound filters ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#attributes)).
- Batches: up to 500 files per batch request; adding files is limited to 300 requests per minute per vector store, and 2,000 attached files per minute per organization ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#batch-operations), [Files reference](https://developers.openai.com/api/reference/resources/files/methods/create)).
- Expiration: `expires_after` with anchor `last_active_at` and a number of days; when a store expires its file entries are deleted and billing stops ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#expiration-policies)).
- Price (read 2026-11-21): storage only, $0.10 per GB per day beyond 1 GB free across all stores, measured on parsed chunks plus embeddings. No per-search fee is listed for the direct search endpoint ([pricing](https://developers.openai.com/api/docs/pricing), [retrieval guide](https://developers.openai.com/api/docs/guides/retrieval#pricing)).
- Retention: stored until you delete them; not eligible for Zero Data Retention. Deleted objects are removed from OpenAI's servers 30 days after deletion ([data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint)).
- Pitfalls: removing a file is eventually consistent, so its content can still show up in results for a short time; a filter on `filename` only works if you set that attribute yourself ([retrieval guide](https://developers.openai.com/api/docs/guides/retrieval)).
- Not confirmed in the docs: which embedding model vector stores use, and the maximum number of files per store.

#### Example uses
**Example 1: Search box without a model.** A documentation site wants a "search by meaning" field. The backend calls the search endpoint with the user's query and shows the top chunks with links, with no text generation at all.
**Nuances.** You pay only for storage, but you cannot choose the embedding model or see the vectors. If you need that control, compute vectors with the Embeddings API and use your own database.

**Example 2: Short-lived index per session.** A tool lets a user upload a contract and ask questions for an afternoon. The app creates a store with `expires_after` of one day so that storage is cleaned up automatically.
**Nuances.** Expiry removes the store's file entries; the underlying uploaded file objects have their own lifetime in the Files API.

### Code Interpreter and the Containers API

**Status:** no status label in the docs ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter)).

#### What it does
Code Interpreter lets the model write Python and run it in a sandboxed virtual machine hosted by OpenAI, look at the result and retry until it works. It is meant for data analysis, file conversion, charts and maths. The machine is a "container"; the Containers API lets you create, inspect and delete containers and move files in and out ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter)).

#### Integration
- Tool: `POST /v1/responses` with `tools: [{ "type": "code_interpreter", "container": { "type": "auto" } }]`, or with `container` set to the ID of a container you created ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#containers)).
- Containers API (synchronous REST): `POST|GET /v1/containers`, `GET|DELETE /v1/containers/{id}`, `POST|GET /v1/containers/{id}/files`, `GET|DELETE /v1/containers/{id}/files/{file_id}`, `GET /v1/containers/{id}/files/{file_id}/content` ([containers reference](https://developers.openai.com/api/reference/resources/containers)).
- The guide's usage table lists Responses, Chat Completions and Assistants; the examples use only Responses.

#### Technical facts
- Models: listed on model pages from GPT-5.2 to GPT-6.2 (not on `gpt-5.2-pro`, `gpt-5.4-pro`) ([models](https://developers.openai.com/api/docs/models)).
- Memory tiers: `1g` (default), `4g`, `16g`, `64g`, fixed for the life of the container ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#containers)).
- Lifetime: a container expires after 20 minutes without use; its data is then discarded and cannot be recovered, and an expired container cannot be reactivated ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#expiration)).
- Files: files given as model input are copied into the container automatically; files the model creates are cited as `container_file_citation` annotations and downloaded through the container file content endpoint ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#work-with-files)).
- Network: outbound access is off by default; a container can be created with a `network_policy` allowlist of domains and per-domain secrets ([containers create reference](https://developers.openai.com/api/reference/resources/containers/methods/create)).
- Rate limit: 100 requests per minute per organization ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter#usage-notes)).
- Price (read 2026-11-21): per container, $0.03 (1 GB), $0.12 (4 GB), $0.48 (16 GB), $1.92 (64 GB) per 20-minute session; since 2026-06-02 eligible sessions are billed by the minute with a 5-minute minimum ([pricing](https://developers.openai.com/api/docs/pricing), [changelog](https://developers.openai.com/api/docs/changelog)).
- Pitfall: the model knows the tool as "the python tool"; prompts that name it that way trigger it most reliably ([Code Interpreter guide](https://developers.openai.com/api/docs/guides/tools-code-interpreter)).

#### Example uses
**Example 1: Analysing an uploaded spreadsheet.** A finance user uploads a CSV of transactions and asks for monthly totals and a chart. The request passes the file ID in the container's `file_ids`; the app downloads the generated PNG from the container before it expires.
**Nuances.** Treat the container as temporary: anything not downloaded within 20 minutes of inactivity is lost.

**Example 2: Exact arithmetic inside a text workflow.** A pricing assistant must compute compound discounts without rounding mistakes. Code Interpreter is enabled so the model calculates in Python instead of "in its head".
**Nuances.** Each new container costs at least a 5-minute session; for a single formula a function tool in your own code is cheaper.

### Shell tool

**Status:** no status label in the docs. Hosted shell was launched on 2026-02-10 ([changelog](https://developers.openai.com/api/docs/changelog)). The older `local_shell` tool is retired; its support ended with the `codex-mini-latest` shutdown ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Gives the model a terminal. In hosted mode OpenAI runs the commands in a container (Debian 12 with Python, Node.js, Java, PHP, Ruby and Go preinstalled). In local mode the model only proposes commands; your own program runs them and sends back the output ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell)).

#### Integration
Responses API only; the guide states it is not available in Chat Completions. `tools: [{ "type": "shell", "environment": { "type": "container_auto" } }]` for a new hosted container, `container_reference` with a container ID to reuse one, or `local` for your own runtime. Results come as paired `shell_call` and `shell_call_output` items. The Agents SDK has a shell tool helper that takes your executor ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell)).

#### Technical facts
- Models: `hosted_shell` is listed on model pages from GPT-5.2 to GPT-6.2 ([models](https://developers.openai.com/api/docs/models)).
- Hosted limits: no interactive terminal sessions, no `sudo`; working directory `/mnt/data`, which is also where downloadable files must be written ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell#hosted-runtime-details)).
- Network: off by default. To enable it, an organization admin configures an allowlist in the dashboard and each request sets `network_policy`; a request naming a domain outside the organization list fails. `domain_secrets` inject credentials for allowed domains without showing them to the model ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell#network-access)).
- Price: hosted shell uses the same container pricing as Code Interpreter ([pricing](https://developers.openai.com/api/docs/pricing)). Local mode has no container fee; you pay tokens only.
- Retention: container data is deleted when the container expires or is deleted ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell#data-retention-and-container-lifecycle)).
- Pitfall (local mode): you are responsible for sandboxing, command allowlists, timeouts and logging ([shell guide](https://developers.openai.com/api/docs/guides/tools-shell#local-shell-mode)).

#### Example uses
**Example 1: File processing that needs real programs.** A media service asks the model to convert and inspect an uploaded archive using command-line tools. Hosted shell with `container_auto` runs the commands; the app downloads results from `/mnt/data` through the container files endpoints.

**Example 2: A coding agent on your own machine.** A developer tool lets the model explore a repository with `ls` and `grep` and run tests. Local mode is used so commands execute inside the developer's sandbox, usually together with Apply Patch.
**Nuances.** The docs warn that enabling network access opens the door to data theft through prompt injection; allow only domains you control or trust.

### Apply Patch tool

**Status:** no status label in the docs ([apply patch guide](https://developers.openai.com/api/docs/guides/tools-apply-patch)).

#### What it does
Lets the model propose file changes as structured diffs: create a file, update a file, delete a file. OpenAI does not touch your files. Your application applies each diff and reports success or failure, and the model continues from there ([apply patch guide](https://developers.openai.com/api/docs/guides/tools-apply-patch)).

#### Integration
`POST /v1/responses` with `tools: [{ "type": "apply_patch" }]`. The response contains `apply_patch_call` items; you reply with `apply_patch_call_output` items (`completed` or `failed`) in the next request. No input schema is needed. The Agents SDKs for Python and TypeScript ship a reference `applyDiff` implementation for the diff format (called V4A) ([apply patch guide](https://developers.openai.com/api/docs/guides/tools-apply-patch#implementing-the-patch-harness)).

#### Technical facts
- Models: the guide lists `gpt-5.2`, the GPT-5.4, 5.5 and 5.6 families, and the GPT-6, 6.1 and 6.2 families ([apply patch guide](https://developers.openai.com/api/docs/guides/tools-apply-patch#usage-notes)).
- Billing: no tool fee is listed; tokens only ([pricing](https://developers.openai.com/api/docs/pricing)).
- Pitfalls: you must validate paths (no escaping the allowed directory), decide whether a failed patch rolls back the others, and return a clear error text so the model can retry ([apply patch guide](https://developers.openai.com/api/docs/guides/tools-apply-patch#safety-and-robustness)).

#### Example uses
**Example 1: Automated small code fixes.** A CI helper gives the model a failing test log and the relevant files, receives patches, applies them in a scratch checkout, runs the tests and feeds failures back until they pass.
**Nuances.** The tool is only half of a coding agent: the model also needs a way to read files, typically the shell tool or file contents in the prompt.

### Skills

**Status:** no status label in the docs. Launched in the Responses API on 2026-02-10 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
A skill is a folder with a `SKILL.md` file (short description plus instructions) and optional scripts, reference files and templates. It packages a procedure, such as "how we build a quarterly report", so the model can load it when a task calls for it. The format follows the open Agent Skills standard. Skills are not a tool type of their own: they are attached to a shell environment ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills)).

#### Integration
- Upload: `POST /v1/skills` (multipart directory or a zip); new version `POST /v1/skills/{skill_id}/versions`; update the default version `POST /v1/skills/{skill_id}`; check a version `GET /v1/skills/{skill_id}/versions/{version}` ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills#create-a-skill)).
- Use: in the hosted shell tool, `tools[].environment.skills` with `{ "type": "skill_reference", "skill_id": ..., "version": ... }`, or an inline base64 zip. In local shell mode you supply the files on your own disk. In the Agents API, skills are found in "capability directories" inside the sandbox ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills)).

#### Technical facts
- Models: `skills` is listed on model pages from GPT-5.2 to GPT-6.2 ([models](https://developers.openai.com/api/docs/models)).
- Limits: zip up to 50 MB, up to 500 files per version, 25 MB per uncompressed file, exactly one `SKILL.md`; up to 32 capability directories per Agents API session ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills#limits-and-validation)).
- How the model sees it: only the name, description and path are added to the prompt; the full instructions are read when the model picks the skill. Skill text counts as user-level input, not system instructions ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills#skills-in-the-user-prompt)).
- OpenAI also offers curated skills referenced by ID, for example `openai-spreadsheets` ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills#curated-skills)).
- Retention: mounted skills live as long as the container ([data controls](https://developers.openai.com/api/docs/guides/your-data)).
- Billing: not confirmed in the docs: no separate price for storing skills is listed on the pricing page; hosted use incurs the container fee.
- Pitfalls: right after upload a version can return 404 for a short time; do not let end users attach arbitrary skills, because a skill is effectively privileged instructions and code ([skills guide](https://developers.openai.com/api/docs/guides/tools-skills#risks-and-safety)).
- Not confirmed: the API reference index has no `skills` resource page; the endpoints above come from the guide's examples.

#### Example uses
**Example 1: A repeatable document procedure.** A consultancy packages its slide-deck conventions and a generation script as a skill. Any request that mounts it in hosted shell can produce a deck that follows the house rules.
**Nuances.** A skill only helps when shell execution is available; for plain instructions without scripts, a system prompt is simpler.

### Computer use tool

**Status:** the `computer` tool is the current, generally available integration; the migration table in the docs labels it "GA integration". The preview model `computer-use-preview` and its tool type `computer_use_preview` belong to the legacy integration; the model was shut down on 2026-07-23 ([integration recipes, migration](https://developers.openai.com/api/docs/guides/tools-computer-use-integration#migration-from-computer-use-preview), [deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Lets a model operate a browser or desktop: it looks at screenshots (or page text) and returns mouse and keyboard actions, to fill forms, test user flows or complete tasks in applications that have no API. In the Responses API the environment is yours: OpenAI returns the actions, your code performs them and sends back a new screenshot ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)).

#### Integration
There is no longer a special computer-use model: mainline models carry the capability. The docs describe four routes:
- SDK helpers: `ComputerToolset` (screenshots plus mouse/keyboard through the `computer` tool) and `BrowserToolset` (page reading and selected browser operations exposed as function tools) in the official Python and Node SDKs. You write a "driver" that performs the actions; the SDK runs the request loop ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#use-the-sdk), [drivers reference](https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers)).
- Direct API with `tools: [{ "type": "computer" }]`: the response has `computer_call` items with a batched `actions[]` array (`click`, `double_click`, `drag`, `move`, `scroll`, `keypress`, `type`, `wait`, `screenshot`); you return `computer_call_output` with a screenshot and chain with `previous_response_id` ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#use-the-computer-tool)).
- Code execution: you give the model a function tool that accepts a script (Playwright or PyAutoGUI) and run it in your sandbox. The docs recommend this route for GPT-6 Astra ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#use-the-api-directly)).
- OpenAI-hosted browser: only through the Agents API, added 2026-09-29 ([Agents API computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use), [changelog](https://developers.openai.com/api/docs/changelog)).

Partner-hosted browsers and desktops (Browserbase, Browser Use, Daytona, E2B) are listed as ready environments ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#connect-a-hosted-environment)).

#### Technical facts
- Models: `computer_use` is listed on the pages of `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-pro`, `gpt-5.5`, and the GPT-5.6, 6, 6.1 and 6.2 families ([models](https://developers.openai.com/api/docs/models)). The migration table names `gpt-6.1-sol` as the model to move to; the deprecations page names `gpt-5.6-terra` as the replacement for `computer-use-preview` (see GAPS).
- Requirements for the SDK route: Python 3.11+ or Node.js 22.6+ ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#run-your-first-task)).
- Billing: tokens only; screenshots count as image input. No per-call fee appears in the tools pricing table. A partner environment bills separately ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#check-model-access-cost-and-data), [pricing](https://developers.openai.com/api/docs/pricing)).
- Data: screenshots and page text are sent to OpenAI; `store: false` does not remove every form of retention, and image inputs are scanned ([data controls](https://developers.openai.com/api/docs/guides/your-data#image-and-file-inputs)).
- Pitfalls: the conversation and the browser session are separate states, so continuing a response does not restore a login; screen content is untrusted and may contain instructions; purchases, deletions and sending of sensitive data should need human confirmation ([computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use#run-safely)).

#### Example uses
**Example 1: End-to-end test of a web flow.** A QA team has the model walk through sign-up on a staging site in an isolated browser, with a step limit, and the script verifies the final page itself.

**Example 2: Data entry into a legacy system with no API.** A back office copies order data into an old web panel. `BrowserToolset` exposes only read, type and click, and a confirmation callback approves each submit.
**Nuances.** It is slow and token-heavy compared with an API call. For public information that needs no interaction, the docs point to web search instead.

### Image generation tool (inside Responses)

**Status:** no status label for the tool. Transparent backgrounds are labelled preview. `gpt-image-1` was shut down on 2026-10-23 ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation)).

#### What it does
Lets a text model create or edit images in the middle of a conversation. The text model rewrites your request into a better image prompt, calls a GPT Image model, and can refine the picture over several turns. The standalone Images API is described in another part of this document ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation)).

#### Integration
`POST /v1/responses` with `tools: [{ "type": "image_generation" }]`; the result is an `image_generation_call` item with a base64 image and a `revised_prompt`. Streaming can deliver 1 to 3 partial images (`partial_images`). Multi-turn editing works through `previous_response_id` or an image ID ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation#multi-turn-editing)).

#### Technical facts
- Two models are involved: the top-level text model (the guide lists `chat-latest`, `gpt-5.2` through `gpt-6.2-sol`) and the image model set in the tool's `model` field: `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini` ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation#supported-models)).
- Not confirmed in the docs: whether the newer `gpt-image-2.6-sunburst` / `gpt-image-2.6-flare` work in the tool. The changelog entry releasing them names only the Images API endpoints, and the tool guide does not list them ([changelog](https://developers.openai.com/api/docs/changelog)).
- Options: size, quality (`low`/`medium`/`high`/`auto`, plus `xhigh` and `max` on the 2.5 models), format, compression, background, and `action` (`auto`, `generate`, `edit`) ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation#tool-options)).
- Billing: by image-model tokens; see the image rows of the [pricing page](https://developers.openai.com/api/docs/pricing). Cached-input rates for GPT Image 2 and 2.5 apply only to images generated through the Responses API.
- For apps with end users, send a stable `safety_identifier` on the request ([image generation tool guide](https://developers.openai.com/api/docs/guides/tools-image-generation#usage)).

#### Example uses
**Example 1: Conversational image editing.** A design assistant lets a user say "make the background lighter" several times; each turn references the previous response so the model edits the same image.
**Nuances.** If you only need one image from one prompt with no conversation, the standalone Images API is the more direct call.

### MCP servers and connectors

**Status:** remote MCP tool: no status label (in the Responses API since 2025-05-20). Built-in connectors (`connector_id`): deprecated for models released after 2026-09-01, still supported on earlier models, no shutdown date given. Secure MCP Tunnel: released 2026-05-19 "for enterprise customers", no other label ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
MCP (Model Context Protocol) is an open standard for exposing tools to AI models over a network. With the `mcp` tool you give the model the address of an MCP server; OpenAI's servers fetch the list of tools and call them on the model's behalf, so your application does not relay each call as it does with function calling. Three variants exist:
- Remote MCP server: any public server, given by `server_url`.
- Secure MCP Tunnel: a private or on-premises server reached through a small program (`tunnel-client`) that you run inside your network and that only makes outbound HTTPS connections; given by `tunnel_id` ([Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)).
- Legacy connectors: OpenAI-maintained wrappers for Dropbox, Gmail, Google Calendar, Google Drive, Microsoft Teams, Outlook Calendar, Outlook Email and SharePoint, given by `connector_id` plus an OAuth token your app obtains ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#connectors)).

#### Integration
- Responses API: `tools: [{ "type": "mcp", "server_label": ..., "server_url": ..., "require_approval": ... }]`. Output items: `mcp_list_tools`, `mcp_call`, and `mcp_approval_request` (answered with an `mcp_approval_response` item in a follow-up request). Supported transports: Streamable HTTP and HTTP/SSE ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#how-it-works)).
- Realtime API: `mcp` tools can be set on a session or a single response ([Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)).
- Agents API and Agents SDK have their own MCP configuration ([Agents API MCP connections](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp)).
- Not in Chat Completions according to the guide's text, which names only the Responses API; the usage table lists Chat Completions as well (see GAPS).

#### Technical facts
- Approvals: by default every call needs your approval (`require_approval` defaults to `always`); you can set `never` or exempt named tools. `allowed_tools` limits which tools are imported ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#approvals)).
- Authentication: an OAuth access token in `authorization`. It is not stored and must be sent with every request ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#authentication)).
- Price: no fee per call; you pay for the tokens of imported tool definitions and call results ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#how-it-works)). No price for Secure MCP Tunnel is given in the docs.
- Rate limits: 1,000 requests per minute on Build, 2,000 on Launch and Grow ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#usage-notes)).
- Tunnel limits: 600 requests per minute per tunnel and calling app, 10 MiB per request or response, 120-second deadline per request, 1,000 queued requests, 1,000 tunnels per organization ([Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#limits)).
- Data: the server is a third party; whatever the model sends is subject to that party's retention and residency. With `store=true`, call data is kept in the response log for 30 days ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#risks-and-safety)).
- Pitfall: a malicious or compromised server can extract anything in the model's context. The docs advise official servers run by the service owner, approvals for sensitive actions, and logging ([MCP guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp#risks-and-safety)).
- Building your own server: the [Building MCP servers](https://developers.openai.com/api/docs/mcp) guide shows a Python server over a vector store with `search` and `fetch` tools. The [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server) page is about connecting a server to ChatGPT as a plugin, which is a ChatGPT feature rather than an API service.

#### Example uses
**Example 1: Acting in a third-party service.** A billing assistant connects to a payment provider's official MCP server with the customer's OAuth token and can look up invoices; creating a refund requires an approval that the app shows to a human.

**Example 2: Internal data without opening the firewall.** A company runs an MCP server over its internal wiki. `tunnel-client` runs next to it, and Responses requests reference the `tunnel_id`.
**Nuances.** The tunnel adds a queue and a 120-second ceiling per call. Setup needs tunnel permissions in the organization settings.

### Tool search

**Status:** no status label in the docs. Added to the Responses API on 2026-03-05 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
When an application has dozens or hundreds of tools, sending all definitions with every request wastes tokens. With tool search you mark tools as deferred; the model sees only names and short descriptions and loads the full definitions of the ones it needs. Loaded tools are appended at the end of the context, so the cached prefix of the prompt stays valid ([tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search)).

#### Integration
Responses API: add `{ "type": "tool_search" }` to `tools` and set `defer_loading: true` on functions, on functions inside a namespace, or on an MCP server entry. Two modes: hosted (OpenAI searches the tools declared in the request) and client-executed (`execution: "client"`; the model emits a `tool_search_call`, and your app returns a `tool_search_output` with the tools to load). In the Agents API, MCP tools are deferred automatically ([tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search)).

#### Technical facts
- Models: only `gpt-5.4` and later ([tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search)); model pages list it for `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-pro`, `gpt-5.5` and the 5.6 to 6.2 families ([models](https://developers.openai.com/api/docs/models)).
- Recommendation: group tools into namespaces of fewer than 10 functions with clear descriptions; savings are larger for namespaces and MCP servers than for single functions, where only the parameter schema is deferred ([tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search#use-namespaces-where-possible)).
- Billing: no fee listed; the effect is fewer input tokens ([pricing](https://developers.openai.com/api/docs/pricing)).
- Pitfall: changing the loaded tool set later breaks the prompt cache from that point ([tool search guide](https://developers.openai.com/api/docs/guides/tools-tool-search#understand-what-gets-loaded)).

#### Example uses
**Example 1: An assistant with a large tool catalogue.** An operations assistant has 120 functions across CRM, billing and shipping. They are grouped into namespaces and deferred; a typical request loads three or four definitions instead of 120.
**Nuances.** Discovery adds a step and can miss the right tool; with a handful of tools, plain function calling is better.

### Programmatic Tool Calling

**Status:** no status label in the docs. Introduced with GPT-5.6 on 2026-07-09 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Instead of calling tools one at a time and reading every result, the model writes a short JavaScript program that calls several tools, loops, filters and combines results, and returns only the final outcome. OpenAI runs the program in an isolated JavaScript runtime. This keeps bulky intermediate data out of the model's context ([Programmatic Tool Calling guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)).

#### Integration
Responses API: add `{ "type": "programmatic_tool_calling" }` and set `allowed_callers` on each tool (`direct`, `programmatic` or both). The response can contain `program`, `function_call` (with a `caller` field) and `program_output` items. Functions still run in your application: the program pauses, you return `function_call_output` with the unchanged `caller`, and you repeat until a final message arrives. In the Agents API it is on by default ([Programmatic Tool Calling guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)).

#### Technical facts
- Tools callable from a program: `function`, `custom`, `mcp`, `apply_patch`, `shell` (local and hosted), `code_interpreter` ([Programmatic Tool Calling guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling#supported-tools)).
- Runtime: fresh V8 instance per program; no Node.js, no packages, no network, no filesystem, no state between programs ([Programmatic Tool Calling guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling#understand-the-runtime-environment)).
- Models: the guide says to check the model page; the GPT-5.6 guide introduces it for GPT-5.6. Not confirmed in the docs: a precise list of supporting models (model pages do not list it under supported tools).
- Billing: not confirmed in the docs: no separate price is listed on the pricing page.
- Data: works with Zero Data Retention without a persistent container ([Programmatic Tool Calling guide](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling#understand-the-runtime-environment)).
- Pitfalls: define `output_schema` on functions so the generated code can rely on field names; keep writes and approval-sensitive actions as direct calls; it cannot be combined with async tools ([async tool calling guide](https://developers.openai.com/api/docs/guides/async-tool-calling#compatibility)).

#### Example uses
**Example 1: Aggregating many lookups.** A stock-planning assistant must compare inventory and demand for 200 products. One program calls `get_inventory` and `get_demand` for each, computes shortages and returns the ten worst cases; the model never sees the 400 raw results.
**Nuances.** The docs advise measuring against plain tool calling first: it pays off only when code can reduce the data without model judgment at each step.

### Async tool calling

**Status:** no status label in the docs. Announced with GPT-6 Astra on 2026-09-03 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Normally a function call pauses the model until your application returns the result. With `async: true` on a function or custom tool definition, the model keeps working (answers other parts of the request, starts other calls) and receives the result later. Your application still runs the tool; OpenAI does not run or manage your background jobs. This is different from background mode, which runs the whole response asynchronously ([async tool calling guide](https://developers.openai.com/api/docs/guides/async-tool-calling)).

#### Integration
Responses API. Add `async: true` to the tool definition; when the job finishes, send the output in a later request using the original `call_id` and the latest `previous_response_id`. Patterns such as a "wait for these tasks" tool or an "ask the user" tool are ordinary functions that you define; they are not built in ([async tool calling guide](https://developers.openai.com/api/docs/guides/async-tool-calling#add-a-wait-tool)).

#### Technical facts
- Models: GPT-6 Astra and later ([async tool calling guide](https://developers.openai.com/api/docs/guides/async-tool-calling#compatibility)).
- Applies only to function and custom tools, not to hosted built-in tools; not for use from Programmatic Tool Calling; in multi-agent mode do not combine it with parallel tool calls ([async tool calling guide](https://developers.openai.com/api/docs/guides/async-tool-calling#compatibility)).
- Pitfall: your app must keep a registry linking each job to its `call_id` for the whole conversation, and return an explicit "no answer" result if a job is cancelled or times out.

#### Example uses
**Example 1: Slow lookups that should not block the answer.** A travel planner starts two price queries that each take 20 seconds and meanwhile writes the parts of the itinerary that do not depend on them, then compares prices when both results are in.

### Files API

**Status:** no status label in the docs ([Files reference](https://developers.openai.com/api/reference/resources/files)).

#### What it does
Stores files on OpenAI's side so other services can refer to them by ID: as model input, as content for vector stores, as Code Interpreter input, as Batch input and output, as fine-tuning and evaluation data ([Files reference](https://developers.openai.com/api/reference/resources/files/methods/create)).

#### Integration
Synchronous REST: `POST /v1/files` (multipart upload with a `purpose`), `GET /v1/files`, `GET /v1/files/{id}`, `GET /v1/files/{id}/content`, `DELETE /v1/files/{id}` ([Files reference](https://developers.openai.com/api/reference/resources/files)).

#### Technical facts
- Purposes: `assistants`, `batch`, `fine-tune`, `vision`, `user_data`, `evals`; use `user_data` for files passed as model input ([Files reference](https://developers.openai.com/api/reference/resources/files/methods/create), [file inputs guide](https://developers.openai.com/api/docs/guides/file-inputs)).
- Limits: 512 MB per file, 2.5 TB per project, 1,000 upload requests per minute per user; Batch input files up to 200 MB ([Files reference](https://developers.openai.com/api/reference/resources/files/methods/create)).
- Separate limit when a file is used as direct model input: under 50 MB per file and 50 MB in total per request ([file inputs guide](https://developers.openai.com/api/docs/guides/file-inputs#usage-considerations)).
- Retention: kept until you delete them, except `purpose=batch` files, which expire after 30 days by default. `expires_after` sets automatic deletion between 1 hour and 30 days after creation. Not eligible for Zero Data Retention ([Files reference](https://developers.openai.com/api/reference/resources/files/methods/create), [data controls](https://developers.openai.com/api/docs/guides/your-data)).
- Billing: not confirmed in the docs: the pricing page lists no fee for plain file storage; storage fees are listed only for vector stores and ChatKit uploads ([pricing](https://developers.openai.com/api/docs/pricing)).
- The reference text still mentions the Assistants API, which was shut down on 2026-08-26 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### Example uses
**Example 1: Reusing a document across requests.** An app uploads a 30-page PDF once with `purpose=user_data` and an expiry of one day, then references the file ID in several model requests instead of resending the bytes.
**Nuances.** Files without an expiry stay forever; a small project should set `expires_after` or delete files to avoid piling up personal data.

### Uploads API

**Status:** no status label in the docs. Released 2024-07-17 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Uploads a large file in pieces. You open an Upload, send Parts (in parallel if you like), then complete it, and the result is an ordinary File object usable everywhere a file ID is accepted ([Uploads reference](https://developers.openai.com/api/reference/resources/uploads)).

#### Integration
Synchronous REST: `POST /v1/uploads` (declare `bytes`, `filename`, `mime_type`, `purpose`), `POST /v1/uploads/{id}/parts`, `POST /v1/uploads/{id}/complete` (with the order of parts), `POST /v1/uploads/{id}/cancel` ([Uploads reference](https://developers.openai.com/api/reference/resources/uploads)).

#### Technical facts
- Limits: up to 8 GB per Upload, 64 MB per Part; an unfinished Upload expires one hour after creation ([Uploads reference](https://developers.openai.com/api/reference/resources/uploads/methods/create)).
- Purposes accepted here: `assistants`, `batch`, `fine-tune`, `vision` (no `user_data` or `evals` in the reference) ([Uploads reference](https://developers.openai.com/api/reference/resources/uploads/methods/create)).
- Contradiction: the Files reference says individual files can be up to 512 MB while an Upload accepts 8 GB; the docs do not explain which services accept a file above 512 MB (see GAPS).

#### Example uses
**Example 1: Sending a multi-gigabyte training file.** A team uploads a large fine-tuning dataset in 64 MB parts from a slow connection, retrying only the failed parts.

### Embeddings

**Status:** no status label on the model pages for `text-embedding-3-small`, `text-embedding-3-large` or `text-embedding-ada-002`; none of them appears in the deprecations list as scheduled for shutdown ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Turns a piece of text into a list of numbers (a vector) such that texts with similar meaning get vectors that are close together. You store the vectors yourself and compare them to build search, clustering, recommendations, duplicate detection or simple classification ([embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)).

#### Integration
`POST /v1/embeddings` with `model` and `input` (a string or an array of strings); synchronous. Also available through the Batch API ([embeddings reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create), [changelog](https://developers.openai.com/api/docs/changelog)).

#### Technical facts
- Models and vector length: `text-embedding-3-small` (1,536 numbers by default), `text-embedding-3-large` (3,072), and the older `text-embedding-ada-002`. The `dimensions` parameter shortens the vector on the `-3` models ([embeddings guide](https://developers.openai.com/api/docs/guides/embeddings#how-to-get-embeddings)).
- Limits: 8,192 tokens per input, up to 2,048 inputs per request, 300,000 tokens in total per request ([embeddings reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create)).
- Price per 1M input tokens (read 2026-11-21): small $0.02, large $0.13, ada-002 $0.10 ([pricing](https://developers.openai.com/api/docs/pricing)).
- Rate limits for `text-embedding-3-small`: Free tier 100 requests and 40,000 tokens per minute; Build tier 5,000 requests and 1,000,000 tokens per minute ([model page](https://developers.openai.com/api/docs/models/text-embedding-3-small)).
- Retention: no application state is stored; abuse-monitoring logs for 30 days; eligible for Zero Data Retention ([data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint)).
- Text only; no image embedding model is listed. Vectors from different models are not comparable, so changing model means re-embedding everything.

#### Example uses
**Example 1: Semantic search in your own database.** A marketplace embeds every listing once, stores vectors in its database's vector index, embeds each user query and returns the nearest listings, combined with ordinary filters such as price.
**Nuances.** You build and run the index yourself; vector stores do the same as a hosted service at the cost of control.

**Example 2: Grouping similar texts.** A product team embeds 20,000 free-text survey answers and clusters the vectors to find recurring themes, then asks a text model to name each cluster.

### Moderation

**Status:** no status label for `omni-moderation-latest`. The older `text-moderation-latest` and `text-moderation-stable` models were shut down on 2025-10-27 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Classifies text and images for harmful content in fixed categories: harassment, hate, illicit activity, self-harm, sexual content, violence (with sub-categories). It returns a yes/no flag and a score between 0 and 1 for each category; your application decides what to do with it ([moderation guide](https://developers.openai.com/api/docs/guides/moderation)).

#### Integration
- Standalone: `POST /v1/moderations` with `model: "omni-moderation-latest"` and text and/or image inputs; synchronous ([moderations reference](https://developers.openai.com/api/reference/resources/moderations/methods/create)).
- Inline (since 2026-06-04): pass a top-level `moderation` object in a Responses or Chat Completions request and receive scores for both the input and the generated output in the same response, without a second call ([moderation guide](https://developers.openai.com/api/docs/guides/moderation#moderate-generated-content)).

#### Technical facts
- Price: the moderation endpoint is free ([moderation guide](https://developers.openai.com/api/docs/guides/moderation), [pricing](https://developers.openai.com/api/docs/pricing)). Not confirmed in the docs: whether inline moderation adds any charge to a generation request.
- Limits: images up to 20 MB; no audio. Rate limits: Free tier 250 requests and 10,000 tokens per minute, Build tier 500 requests and 20,000 tokens per minute ([moderation guide](https://developers.openai.com/api/docs/guides/moderation), [model page](https://developers.openai.com/api/docs/models/omni-moderation-latest)).
- Image support covers only self-harm, sexual and violence categories; the rest are text-only and return 0 for image-only input ([moderation guide](https://developers.openai.com/api/docs/guides/moderation#review-supported-categories)).
- Retention: nothing is stored, including no abuse-monitoring logs ([data controls](https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint)).
- Pitfalls: inline moderation does not block anything, the model still generates; in streaming the scores arrive only after the full output; the underlying model is upgraded over time, so score thresholds may need recalibration ([moderation guide](https://developers.openai.com/api/docs/guides/moderation)).
- A separate image classifier for child sexual abuse material, `omni-moderation-csam-latest`, was added on 2026-11-16 for approved organizations ([CSAM classifier guide](https://developers.openai.com/api/docs/guides/csam-classifier)); it is covered with the safety classifiers in another part.

#### Example uses
**Example 1: Screening user posts before publication.** A community forum sends each new post and attached image to the moderation endpoint; flagged posts go to a human review queue instead of being published.
**Nuances.** The categories are fixed and general. Rules specific to your product (spam, off-topic, advertising) need your own classifier or a text model with instructions.

**Example 2: Checking generated answers in one call.** A chatbot adds the `moderation` object to each generation request and hides the answer when the output is flagged.

## Delivery modes, processing modes and cost levers

This part covers how a request to a text model is delivered (streaming, WebSocket, background, webhooks, batch), at which speed and price tier it is processed (`service_tier`), and the features that lower cost or latency without changing the model (prompt caching, predicted outputs, token counting, compaction). All prices were read on 2026-11-21 from the [pricing page](https://developers.openai.com/api/docs/pricing).

Quick orientation, relative to Standard processing (`service_tier: "default"`):

| Mode | How selected | Price effect | Time behaviour |
| --- | --- | --- | --- |
| Standard | `service_tier: "default"` (or `auto` with default project setting) | baseline | synchronous |
| Fast mode (formerly Priority processing) | `service_tier: "fast"` or `"priority"` | about 2x on GPT-5.6 and GPT-6 families, 1.7x-2.5x on older models | up to 2.5x faster |
| Ultrafast mode | `service_tier: "ultrafast"` | 6x list price (3x promotional on GPT-6.2 until 2027-02-28) | fastest tier |
| Flex processing | `service_tier: "flex"` | Batch rates (50% lower) | slower, may return 429; beta being wound down |
| Background, `2h` / `8h` window | `background: true` + `background_options.completion_window` | 30% / 40% lower | targets completion within the window |
| Batch API | `POST /v1/batches` | 50% lower | within 24 hours |
| Reserved Tier / Scale Tier | sales contract | pay for reserved capacity | capacity priority |

Sources for the table: [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode), [Ultrafast mode](https://developers.openai.com/api/docs/guides/ultrafast-mode), [Flex processing](https://developers.openai.com/api/docs/guides/flex-processing), [Background mode](https://developers.openai.com/api/docs/guides/background), [Batch API](https://developers.openai.com/api/docs/guides/batch), [Reserved Tier](https://developers.openai.com/api/docs/guides/reserved-tier), [pricing](https://developers.openai.com/api/docs/pricing).

### Streaming (server-sent events)

**Status:** no status label in the docs ([streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses)); it is a long-standing request option, not listed in [deprecations](https://developers.openai.com/api/docs/deprecations).

#### What it does
By default the API generates the whole answer and returns it in one HTTP response. With streaming the server sends the answer piece by piece over server-sent events (SSE, a one-way HTTP stream), so an application can show text while the model is still writing ([streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses)). It changes when the user sees output; it does not change price or total generation time.

#### Integration
- `POST /v1/responses` with `stream: true`; the response is an SSE stream of typed "semantic events" such as `response.created`, `response.output_text.delta`, `response.completed` and `error` ([streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses), [event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events)).
- `POST /v1/chat/completions` with `stream: true` works the same way with its own chunk format; `stream_options.include_usage` adds a final usage chunk before `data: [DONE]` ([Chat Completions reference](https://developers.openai.com/api/reference/resources/chat)).
- The guide shows official SDK support in TypeScript, Python, Go, Java, C# and Ruby, where each event is a typed object ([streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses)).

#### Technical facts
- The Responses streaming reference defines roughly 59 event types (lifecycle, output items, text deltas, function-call arguments, built-in tool progress); each event carries a `sequence_number` ([event reference](https://developers.openai.com/api/reference/resources/responses/streaming-events)).
- Billing is the same as for a non-streamed request; the pricing page has no streaming surcharge ([pricing](https://developers.openai.com/api/docs/pricing)).
- By default, delta events carry an `obfuscation` field with random padding to hide payload sizes from network observers; `stream_options.include_obfuscation: false` removes it to save bandwidth ([Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).
- Pitfall: partial output is harder to moderate, and moderation scores requested together with generation arrive only after the full output ([streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses)).
- Pitfall: streaming improves time to first visible text only; reasoning or tool work before the answer still delays it ([latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)).
- Combinations: works with Fast and Ultrafast; works with background mode only for the default `soonest` window; a Batch moderation request rejects `stream=true` ([background guide](https://developers.openai.com/api/docs/guides/background), [batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Other endpoints (audio transcription, image generation) have their own streaming event sets; they are described with those services.

#### Example uses
**Example 1: Chat window that types as the model writes.** A support assistant answers in several paragraphs. The backend calls `POST /v1/responses` with `stream: true`, forwards each `response.output_text.delta` to the browser, and finalises the message on `response.completed`.
**Nuances.** If the product must check the text before showing it, buffer enough text for that check first ([latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)).

**Example 2: Progress display for a tool-using run.** An internal research tool runs web search and code execution. The UI listens to output-item and tool-call events to show "searching", "running code" instead of a blank screen, and shows the final text only at the end.

### WebSocket mode for the Responses API

**Status:** no status label in the docs; launched Feb 23, 2026 per the [changelog](https://developers.openai.com/api/docs/changelog) ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).

#### What it does
Instead of one HTTP request per model turn, the application keeps one persistent WebSocket connection to `/v1/responses` and sends each turn as a `response.create` event containing only the new input plus `previous_response_id`. This removes per-turn overhead in workflows with many model-tool round trips; the guide reports up to roughly 40% faster end-to-end execution for runs with 20 or more tool calls ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)). One connection can also carry several parallel conversations and fork a conversation.

#### Integration
- WebSocket connection to `/v1/responses`; client event `response.create` mirrors the body of `POST /v1/responses`, except that `stream` is implicit and `background` is not supported; server events are the normal streaming events ([WebSocket events reference](https://developers.openai.com/api/reference/resources/responses/websocket-events)).
- Native support in the Python, JavaScript, Ruby, Go and Java SDKs with minimum versions listed in the guide; C# is not mentioned ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).
- `response.create` with `generate: false` warms up request state (tools, instructions) without producing output ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).
- [Mid-turn steering](https://developers.openai.com/api/docs/guides/steering) (`response.steer`, adding instructions while a response is running) exists only on this transport and only for the GPT-6 family.

#### Technical facts
- A connection lasts at most 60 minutes; then reconnect ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).
- Per connection: up to 16 in-flight responses (more are queued) and up to 32 named `stream_id` lanes; requests in one lane run first-in-first-out, different lanes run concurrently ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).
- Data: previous-response state is kept only in connection memory, so the mode is compatible with `store=false` and Zero Data Retention (ZDR). With `store=false`, an ID that fell out of the cache returns `previous_response_not_found`, and after a reconnect the full context must be re-sent ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).
- Billing: no separate price; tokens are billed at the rate of the model and service tier. Not confirmed in the docs: any explicit statement about WebSocket-specific billing; the [pricing page](https://developers.openai.com/api/docs/pricing) lists none.
- Combinations: recommended transport for Ultrafast mode ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode)); works with server-side compaction and with the standalone compact endpoint ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)); does not combine with background mode ([WebSocket events reference](https://developers.openai.com/api/reference/resources/responses/websocket-events)).

#### Example uses
**Example 1: Coding agent with dozens of tool calls.** An agent reads files, runs tests and edits code in a loop. The orchestrator opens one socket, sends each tool result as a new `response.create` with `previous_response_id`, and reconnects before the 60-minute limit.
**Nuances.** For a simple chat with one model call per user message, plain SSE streaming is simpler and the latency gain is small.

**Example 2: Exploring two alternatives in parallel.** After a shared analysis step, the application forks the conversation onto two `stream_id` lanes ("cheap plan", "fast plan") and lets both run concurrently on the same connection.
**Nuances.** With `store=false` a fork depends on the parent still being in the connection cache; wait for the fork's `response.in_progress` before advancing the source lane ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)).

### Background mode (including discounted completion windows)

**Status:** background mode itself has no status label in the docs; the discounted `2h` and `8h` completion windows are in public beta since Nov 17, 2026 ([background guide](https://developers.openai.com/api/docs/guides/background), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Background mode runs a Responses API request asynchronously: the call returns at once with a response ID, and the application collects the result later by webhook or polling. It is meant for long-running requests and multi-step agent runs where holding an HTTP connection open is fragile ([background guide](https://developers.openai.com/api/docs/guides/background)). A completion window tells the API how soon the result is needed; accepting a 2-hour or 8-hour target earns a discount.

#### Integration
- `POST /v1/responses` with `background: true`; optional `background_options.completion_window` = `soonest` (default), `2h` or `8h`, and `background_options.continuation_id` to link follow-up requests of one run ([Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).
- Result: subscribe to the `response.completed` webhook (and failed / incomplete / cancelled events) or poll `GET /v1/responses/{id}` while status is `queued` or `in_progress`; cancel with the cancel endpoint ([background guide](https://developers.openai.com/api/docs/guides/background)).
- With the default window, a background response can also be streamed (`stream: true`) and resumed after a dropped connection by passing the last `sequence_number` as `starting_after` ([background guide](https://developers.openai.com/api/docs/guides/background)).

#### Technical facts
- Price: `soonest` has no discount; `2h` is 30% and `8h` is 40% below Standard model token rates, on every eligible request including follow-ups ([background guide](https://developers.openai.com/api/docs/guides/background), [pricing](https://developers.openai.com/api/docs/pricing), read 2026-11-21).
- Models for discounted windows: GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Terra and GPT-6 Luna ([background guide](https://developers.openai.com/api/docs/guides/background)). Not confirmed in the docs: a list of models that support plain background mode.
- Time: for `2h` and `8h` the API "targets" completion within the window from the moment it accepts the request, and retries eligible capacity errors itself; the target applies to that one response, follow-ups get higher queue priority when they reuse window, `continuation_id`, model and project ([background guide](https://developers.openai.com/api/docs/guides/background)). The guide words this as a target, not a guarantee.
- Discounted windows require Standard processing (`service_tier: "default"`; with `auto` only if Standard is selected) and no streaming ([background guide](https://developers.openai.com/api/docs/guides/background)).
- Rate limits: `2h`/`8h` requests share the Batch/Background queued-input-token limit with the Batch API; `soonest` uses the regular limits ([rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)).
- Data: background mode stores response data temporarily even with `store=false` or ZDR; with the default window that is roughly 10 minutes on disk, and the response is kept for the standard period only if `store=true` is set explicitly. ZDR projects can use `2h`/`8h`; `store` is then treated as `false` ([your data](https://developers.openai.com/api/docs/guides/your-data)).
- Pitfalls: prompt cache entries written by `2h`/`8h` requests cannot be reused by ordinary Standard requests; a response created without streaming cannot be streamed later; a prior response may expire before the follow-up, so save input and output if the run may continue ([background guide](https://developers.openai.com/api/docs/guides/background)).

#### Example uses
**Example 1: On-demand long report.** A user clicks "generate market report"; the backend starts a background response with the default window, shows a progress page, and renders the report when the `response.completed` webhook arrives.

**Example 2: Overnight document review with a tool step.** A nightly job sends each contract with an `8h` window and a `continuation_id`. When the model asks for a referenced document via a function call, the job runs the lookup and sends a follow-up with the same window and ID, still at the 40% discount.
**Nuances.** For many independent requests known up front, the Batch API is cheaper (50%) and the docs point to it for that case ([background guide](https://developers.openai.com/api/docs/guides/background)).

### Webhooks

**Status:** no status label in the docs; added Jun 24, 2025 per the [changelog](https://developers.openai.com/api/docs/changelog) ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)).

#### What it does
A webhook is an HTTP POST that OpenAI sends to a URL you control when something finishes on its side, so the application does not have to poll. Events cover background responses, batches, fine-tuning jobs, eval runs, incoming realtime and live calls, and safety notices ([webhook events reference](https://developers.openai.com/api/reference/resources/webhooks)).

#### Integration
- Endpoints are created per project in the dashboard (name, public URL, event types); creation returns a signing secret shown once ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)). Not confirmed in the docs: a public REST endpoint for creating webhook endpoints programmatically.
- Delivery follows the Standard Webhooks specification; verify the signature with the SDK helper `client.webhooks.unwrap()` or a Standard Webhooks library ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks), [unwrap reference](https://developers.openai.com/api/reference/resources/webhooks/methods/unwrap)).
- Event types: `response.completed|cancelled|failed|incomplete`, `batch.completed|cancelled|expired|failed`, `fine_tuning.job.succeeded|failed|cancelled`, `eval.run.succeeded|failed|canceled`, `realtime.call.incoming`, `live.call.incoming`, `live.transport.incoming|connected`, `safety.*` ([webhook events reference](https://developers.openai.com/api/reference/resources/webhooks)). Agents API sessions have their own [session webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks).

#### Technical facts
- The receiver must answer with a `2xx` within a few seconds; otherwise OpenAI retries with exponential backoff for up to 72 hours. `3xx` redirects are not followed ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)).
- Duplicates are possible; use the `webhook-id` header as an idempotency key ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)).
- The event carries an ID (for example `event.data.id` of the response), not the result; fetch the result with a normal API call ([background guide](https://developers.openai.com/api/docs/guides/background)).
- Price: no charge is listed for webhooks on the [pricing page](https://developers.openai.com/api/docs/pricing).
- Pitfall: the URL must be publicly reachable, which complicates local development; test events can be sent from the dashboard ([webhooks guide](https://developers.openai.com/api/docs/guides/webhooks)).

#### Example uses
**Example 1: Finish notification for background work.** A service starts background responses and stores their IDs. Its webhook handler verifies the signature, enqueues a job and returns 200; the job retrieves the response and updates the record.

**Example 2: Batch pipeline without polling.** A nightly batch is submitted; on `batch.completed` the handler downloads the output file, and on `batch.expired` or `batch.failed` it alerts an operator.
**Nuances.** If the application cannot expose a public endpoint, polling by ID remains fully supported ([background guide](https://developers.openai.com/api/docs/guides/background)).

### Batch API

**Status:** no status label in the docs; released April 2024 per the [changelog](https://developers.openai.com/api/docs/changelog) ([batch guide](https://developers.openai.com/api/docs/guides/batch)).

#### What it does
The Batch API takes a file of independent requests, runs them asynchronously and returns a file of results. In exchange for waiting up to 24 hours, the requests cost 50% less and do not consume the normal per-minute rate limits ([batch guide](https://developers.openai.com/api/docs/guides/batch)).

#### Integration
- Upload a `.jsonl` file through the Files API (one request per line with a unique `custom_id`), then `POST /v1/batches` with the file ID, the target endpoint and `completion_window: "24h"` (the only allowed value). Follow with `GET /v1/batches/{id}`, `GET /v1/batches`, `POST /v1/batches/{id}/cancel`, and download `output_file_id` / `error_file_id` ([batch guide](https://developers.openai.com/api/docs/guides/batch), [batches reference](https://developers.openai.com/api/reference/resources/batches)).
- Asynchronous; completion by polling or `batch.*` webhooks ([webhook events reference](https://developers.openai.com/api/reference/resources/webhooks)).
- Supported target endpoints: `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/completions`, `/v1/moderations`, `/v1/images/generations`, `/v1/images/edits` ([batch create reference](https://developers.openai.com/api/reference/resources/batches/methods/create)).

#### Technical facts
- Price: 50% below synchronous rates, for example `gpt-6.2-sol` $1.00 input / $5.00 output per 1M tokens against $2.00 / $10.00 Standard (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)); cached-input discounts are listed in the Batch table for current models.
- Limits: 50,000 requests and 200 MB per batch file; one model per file; 2,000 batches created per hour; a queued-input-token limit per model shared with `2h`/`8h` background requests; no output-token limit ([batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Time: a batch not finished within 24 hours becomes `expired`; finished requests are returned and billed, the rest are cancelled. Cancelling can take up to 10 minutes ([batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Models: "most models", per the guide; check the model page. Batch image generation is documented for the GPT Image models ([batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Data: `/v1/batches` stores application state until deleted and is not ZDR eligible; output and error files expire 30 days after creation by default, adjustable from 1 hour to 30 days with `output_expires_after` ([your data](https://developers.openai.com/api/docs/guides/your-data), [batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Pitfall: output order may differ from input order; match by `custom_id` ([batch guide](https://developers.openai.com/api/docs/guides/batch)).
- Contradiction: a changelog entry announces Batch support for `POST /v1/videos`, but the batch guide and reference do not list that endpoint ([changelog](https://developers.openai.com/api/docs/changelog)).

#### Example uses
**Example 1: Classifying a large archive.** A company wants a topic label on 300,000 old support tickets. It writes several JSONL files of `/v1/responses` requests to a small model, submits them, and merges the results by `custom_id` the next day.

**Example 2: Embedding a document repository.** Before launching search, all documents are embedded through `/v1/embeddings` batches, staying under the limit of 50,000 inputs per batch.

**Example 3: Regression evaluation of a prompt change.** A fixed test set is run against old and new prompts as two batches; cost is halved and production rate limits are untouched.
**Nuances.** Requests in a batch cannot depend on each other's results; multi-step flows need background mode. Under ZDR requirements Batch is not eligible ([your data](https://developers.openai.com/api/docs/guides/your-data)).

### Flex processing

**Status:** beta, being wound down. Not available on GPT-6.2 Astra / Sol and will not be added to future models; the retirement date is not yet published ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing), [changelog](https://developers.openai.com/api/docs/changelog) entry of Nov 17, 2026). The listed replacement for waiting workloads is the discounted background completion window.

#### What it does
Flex is a cheaper, slower tier for ordinary synchronous Responses or Chat Completions requests: same call, lower price, longer and less predictable response time, and occasional refusal when capacity is short ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing)).

#### Integration
`service_tier: "flex"` on `POST /v1/responses` or `POST /v1/chat/completions`; synchronous. Raise the SDK timeout above the 10-minute default (the guide uses 15 minutes) ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing)).

#### Technical facts
- Price: Batch API rates (50% below Standard), plus prompt caching discounts ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing), [pricing](https://developers.openai.com/api/docs/pricing), read 2026-11-21).
- Models in the Flex price table: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`, `gpt-6-sol`, the GPT-5.6 family, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.2`, `gpt-5.1`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `o3` ([pricing](https://developers.openai.com/api/docs/pricing)).
- No time guarantee. When capacity is missing the API returns `429 Resource Unavailable` and does not charge; retry with backoff or fall back to `service_tier: "auto"` ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing)).
- Data: same endpoint rules as Standard requests; EU data residency with Flex is listed for GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Sol and GPT-6 Luna ([data residency](https://developers.openai.com/api/docs/guides/data-residency)).
- A change of service tier between requests breaks prompt cache reuse ([cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics)).

#### Example uses
**Example 1: Low-priority enrichment on an older model.** An existing job on `gpt-5.4-mini` adds summaries to records during the day; it uses Flex with exponential backoff and a Standard fallback after several 429s.
**Nuances.** Do not build new work on Flex: new models do not have it. Use the Batch API or a `2h`/`8h` background window instead ([Flex guide](https://developers.openai.com/api/docs/guides/flex-processing)).

### Fast mode (formerly Priority processing)

**Status:** no beta or preview label in the docs. Priority processing (launched Jun 27, 2025) was renamed Fast mode on Jul 30, 2026; `service_tier: "priority"` still works and means the same thing ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode), [changelog](https://developers.openai.com/api/docs/changelog)). One part is deprecated: GPT-5.2, GPT-5.4 and GPT-5.4 mini with EU data residency and `fast`/`priority`, shutdown Jan 11, 2027 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Fast mode processes a request faster (up to 2.5x) and with more consistent latency, for a per-token premium and with no commitment ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)). It is the pay-as-you-go option for user-facing traffic where latency matters.

#### Integration
- `service_tier: "fast"` (or `"priority"`) on `POST /v1/responses` or `POST /v1/chat/completions`, or set the project's default service tier to Fast in the dashboard; synchronous or streamed ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- The response's `service_tier` field shows the tier actually used; for GPT-5.6 and earlier it reads `priority` even when `fast` was requested ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).

#### Technical facts
- Price (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)): exactly 2x Standard for the GPT-6 and GPT-5.6 families (for example `gpt-6.2-sol` $4.00 / $20.00 per 1M input / output against $2.00 / $10.00); 2.5x for `gpt-5.5`; about 1.7x-2x for GPT-5.x, GPT-4.1, GPT-4o and `o3`. Cached-input discounts still apply ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- Models: those in the Fast price table, including all current GPT-6.x and GPT-5.6 models; not available for fine-tuned models or embeddings ([pricing](https://developers.openai.com/api/docs/pricing), [Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- Rate limits are shared with Standard. A separate ramp-rate limit applies: if traffic grows too quickly, some requests are downgraded to Standard speed and price, visible as `service_tier: "default"` in the response. Rule of thumb: above 1M input tokens per minute, grow by at most 50% per 15 minutes ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- Time guarantee: none for pay-as-you-go. A latency SLA with service credits may exist in eligible Enterprise agreements for GPT-5.6 and earlier; Fast mode for GPT-6 Astra has no latency SLA ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- Data: compatible with data residency, ZDR and a BAA, with per-model regional limits ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).
- Combinations: cannot be combined with discounted background windows (those need Standard) and is discouraged for bulk jobs ([background guide](https://developers.openai.com/api/docs/guides/background), [Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).

#### Example uses
**Example 1: Interactive assistant during business hours.** A customer-facing chat sets `service_tier: "fast"` on the answer-generating call only, keeps background summarisation on Standard, and logs the returned `service_tier` to see how often requests were downgraded.
**Nuances.** Compare measured latency against Standard on your own prompts before paying double; a smaller model can be the cheaper way to the same speed ([latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)).

### Ultrafast mode

**Status:** no explicit status label in the guide. Announced Aug 13, 2026 as a limited preview for GPT-5.6 Sol; since Sep 29 and Oct 8, 2026 it is available to all API users for GPT-6 Astra and GPT-6.1 Sol, subject to rate limits ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Ultrafast is the fastest service tier: it shortens the time between generated output tokens on a few flagship models, at a much higher price ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode)).

#### Integration
- `service_tier: "ultrafast"` with `model` set to `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6-astra` or `gpt-6.1-sol`; over WebSocket mode (recommended, so network overhead does not eat the gain) or plain HTTP on `POST /v1/responses` ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode)).
- Also selectable in the Agents API through `agent.service_tier` ([changelog](https://developers.openai.com/api/docs/changelog)). Not confirmed in the docs: Ultrafast on Chat Completions; the guide shows only the Responses API.

#### Technical facts
- Price (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)): 6x Standard for `gpt-6-astra` ($60 / $300 per 1M input / output) and `gpt-6.1-sol` ($12 / $60). For GPT-6.2 Astra and Sol: 3x Standard through Feb 28, 2027, then 6x from Mar 1, 2027.
- Separate rate limits from Standard and Fast. Defaults for `gpt-6.1-sol`: 1M / 4M / 40M tokens per minute on the Build / Launch / Grow usage tiers; for `gpt-6-astra`: 500K / 1M / 5M ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode)).
- Data residency: GPT-6.2 models US only; GPT-6.1 Sol US, EU and global; GPT-6 Astra US and global only ([Ultrafast guide](https://developers.openai.com/api/docs/guides/ultrafast-mode)).
- No latency guarantee is stated in the guide.
- Contradiction: the Responses API reference still describes `ultrafast` as access-controlled and available for `gpt-5.6-sol`, while the guide and the price table list the four models above and not `gpt-5.6-sol` ([Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).

#### Example uses
**Example 1: Live pair-programming agent.** A coding assistant performs many short tool calls while the developer watches. It keeps one WebSocket open, sends every turn with `service_tier: "ultrafast"` on `gpt-6.1-sol`, and falls back to Fast when the Ultrafast rate limit is hit.
**Nuances.** At 6x the token price this fits only where waiting is the main cost. Fast mode at 2x, or a smaller model, is the usual first step ([latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)).

### Reserved Tier

**Status:** no status label in the docs; available to Enterprise customers through sales ([Reserved Tier guide](https://developers.openai.com/api/docs/guides/reserved-tier)).

#### What it does
Reserved Tier guarantees API capacity for one model up to an amount reserved in dollars per minute. When demand for that model is high, requests inside the reservation are prioritised over pay-as-you-go traffic on the same shared infrastructure ([Reserved Tier guide](https://developers.openai.com/api/docs/guides/reserved-tier)).

#### Integration
A commercial arrangement, not an API call: purchased via sales and managed under Capacity Management in the dashboard. The reservation automatically covers eligible Standard and Fast mode requests for that model ([Reserved Tier guide](https://developers.openai.com/api/docs/guides/reserved-tier)).

#### Technical facts
- Models: "select Astra, Sol, Terra, and Luna models"; the rate limits guide points to Reserved Tier for GPT-5.6 and later ([Reserved Tier guide](https://developers.openai.com/api/docs/guides/reserved-tier), [rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)).
- Billing: the reserved capacity is paid for even when unused; usage above it is billed at normal pay-as-you-go rates under normal rate limits ([Reserved Tier guide](https://developers.openai.com/api/docs/guides/reserved-tier)). Not confirmed in the docs: prices, minimum commitment or term.
- Not confirmed in the docs: any latency SLA attached to Reserved Tier.

#### Example uses
**Example 1: Planned traffic spike.** A retailer expects a tenfold peak during a sale week and reserves capacity for its main model for that period so that checkout assistance is not slowed by platform-wide demand.
**Nuances.** Out of reach and unnecessary for a small project; pay-as-you-go limits and Fast mode cover it.

### Scale Tier (older capacity product)

**Status:** not documented as a guide in the API docs; referenced as an existing Enterprise product for "eligible models", with Reserved Tier named for GPT-5.6 and later ([rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)). No entry in [deprecations](https://developers.openai.com/api/docs/deprecations).

#### What it does
Scale Tier sells bundles of tokens-per-minute capacity for more predictable throughput. The docs mention it only in passing: it is separate from Fast mode, Fast mode usage does not draw on Scale Tier bundles, and spill-over traffic does not move to Fast mode automatically ([Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)).

#### Integration
Sales contract. The value `"scale"` exists in the `service_tier` enum of the Responses API ([Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)).

#### Technical facts
- Listed as supported with data residency in all listed regions ([data residency](https://developers.openai.com/api/docs/guides/data-residency)).
- Not confirmed in the docs: prices, eligible models, terms. The description lives on an external marketing page that is outside the allowed sources.

#### Example uses
**Example 1: Existing Enterprise contract on an older model.** An organisation that already holds Scale Tier bundles for a GPT-5.x model keeps them; for a GPT-5.6 or later model the docs direct it to Reserved Tier.

### Prompt caching (with cache lifetime options, prewarming and diagnostics)

**Status:** no status label for prompt caching itself; it is enabled by default on supported models. Prompt Cache Diagnostics is generally available since Sep 8, 2026; the 12-hour lifetime was added Oct 20, 2026 ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching), [changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
When several requests start with the same content (instructions, tool definitions, earlier conversation), the model can reuse the internal state computed for that shared beginning, called the prefix. Reused input tokens are billed at a much lower cached-input rate (up to 95% off) and the response starts sooner ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)). It needs no setup, but since GPT-5.6 it has explicit controls and a price for writing to the cache.

#### Integration
- Automatic on `POST /v1/responses` and `POST /v1/chat/completions`; the result is visible in `usage.input_tokens_details.cached_tokens` and `cache_write_tokens` ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- GPT-5.6 and later: `prompt_cache_options.mode` (`implicit` or `explicit`), `prompt_cache_breakpoint` markers on content blocks, `prompt_cache_options.ttl` (`"30m"` default or `"12h"`), `prompt_cache_options.prewarm: true` to fill the cache without generating output, and `prompt_cache_options.comparison_response_id` for diagnostics. The guide documents `12h`, prewarm and diagnostics for the Responses API; the Chat Completions reference lists only `mode` and `ttl` ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching), [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat)).
- Earlier models: implicit caching only, `prompt_cache_retention` (`in_memory` or `24h`) and a stable `prompt_cache_key` to route related requests to the same cache ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

#### Technical facts
- Price on GPT-5.6 and later: a cache write costs 1.25x the normal input rate for the 30-minute lifetime and 2.5x for 12 hours (a replacement rate, not a surcharge); a read costs 0.1x, or 0.05x on GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Sol and GPT-6.1 Terra. Example: `gpt-6.2-sol` input $2.00, cached $0.10, 30m write $2.50, 12h write $5.00 per 1M tokens (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing); rules in the [prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)). Earlier models have no write charge and a model-specific cached rate.
- Minimum cacheable prefix: 1,024 tokens on GPT-5.6 and later; varies with request settings on earlier models. Up to four cache writes per request ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Lifetime: 30 minutes or 12 hours minimum on GPT-5.6 and later; on earlier models about 5-10 minutes of inactivity (`in_memory`) or up to 24 hours (`24h`, the only option on `gpt-5.5`). The cache cannot be cleared manually ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- What breaks reuse: a different model, service tier, tool list or order, output schema, reasoning effort, verbosity, edited earlier input, or compaction. The guide [Keep the prefix unchanged](https://developers.openai.com/api/docs/guides/keep-prefix-unchanged) describes append-only alternatives (`configuration_update`, `additional_tools`) and warns that newer models also drop earlier reasoning items after a prefix change.
- Pitfall on GPT-6.2: top-level `instructions` are appended after the input and always billed uncached; put reusable instructions in the first `developer` message ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Pitfall after migrating to GPT-5.6+: implicit mode caches through the end of the latest message, so a static prefix followed by different user text is not reused unless an explicit breakpoint follows the static part ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Rate limits: cached tokens still count toward tokens-per-minute limits ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).
- Data: the cache holds encrypted key-value tensors, not prompt text, for at most 24 hours; all caching features are ZDR compatible; caches are not shared between organisations or across regional processing boundaries ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching), [your data](https://developers.openai.com/api/docs/guides/your-data)).
- Diagnostics: free, Responses API only, GPT-5.6 and later; returns `cache_hit`, `cache_miss` with a reason such as `tools_changed` or `input_changed`, `comparison_response_not_found` or `unavailable`; best effort, reports only the first cause, and diagnostic records expire after a short unspecified period ([cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics)).
- Combinations: works with Batch, Flex, Fast and Ultrafast (each price table has cached and write columns); entries from `2h`/`8h` background requests are not reusable by ordinary requests ([pricing](https://developers.openai.com/api/docs/pricing), [background guide](https://developers.openai.com/api/docs/guides/background)).

#### Example uses
**Example 1: Grader with a fixed rubric.** An automated judge sends the same long rubric and examples with a different item each time. Explicit mode with one breakpoint after the rubric writes the rubric once and leaves the changing item uncached, avoiding write charges for content that never repeats.

**Example 2: Long multi-turn agent session.** Each turn appends messages and tool results without rewriting earlier ones, so the reusable prefix grows; implicit mode handles breakpoints, and the team watches the cache-hit rate in the Prompt Caching dashboard.

**Example 3: Finding out why the bill went up.** After a release the cached share drops. The developer sends a request with `comparison_response_id` set to the previous turn and reads `prompt_cache_diagnostics.reason`: a timestamp added to the first developer message changed the prefix.
**Nuances.** Caching pays only with reuse: one write plus one read costs 1.35x one normal pass against 2x uncached, but a write that is never read costs 25% more than no caching ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

### Predicted Outputs

**Status:** no status label on the feature, but it is effectively legacy: it works only on GPT-4o, GPT-4o mini, GPT-4.1, GPT-4.1 mini and GPT-4.1 nano through Chat Completions ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs)). `gpt-4.1-nano` was shut down on Oct 23, 2026, and the remaining four are deprecated with shutdown on Jan 14, 2027 ([deprecations](https://developers.openai.com/api/docs/deprecations)). Not confirmed in the docs: support on any newer model, or a replacement feature.

#### What it does
When most of the output is known in advance, typically a file being rewritten with small edits, the application passes the expected text as a prediction and the model generates the matching parts much faster ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs)). It lowers latency, not cost.

#### Integration
`POST /v1/chat/completions` with the `prediction` parameter (the expected content); synchronous or streamed. Not available in the Responses API ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs), [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat)).

#### Technical facts
- Billing: predicted tokens that do not appear in the final output (`rejected_prediction_tokens`) are charged at output-token rates, so a poor prediction raises cost ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs)).
- Not supported together with: function calling (`tools`), `n` > 1, `logprobs`, positive presence or frequency penalties, audio, non-text modalities, `max_completion_tokens` ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs)).
- The predicted text may appear anywhere in the output and still help ([predicted outputs guide](https://developers.openai.com/api/docs/guides/predicted-outputs)).

#### Example uses
**Example 1: Small edit in a large file.** An editor plugin asks the model to rename one property in a 500-line source file and passes the current file as the prediction; the regenerated file returns in a fraction of the usual time.
**Nuances.** Given the Jan 14, 2027 shutdown of the supported models, do not start new work on this feature. On current models the documented routes to lower latency are Fast or Ultrafast mode, shorter outputs and prompt caching ([latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)).

### Token counting (input tokens endpoint)

**Status:** no status label in the docs ([token counting guide](https://developers.openai.com/api/docs/guides/token-counting)).

#### What it does
The endpoint returns how many input tokens a Responses API request would consume, without running the model. It counts everything the model would receive, including images, files, tool definitions and the formatting tokens around messages, which a local tokenizer cannot estimate reliably ([token counting guide](https://developers.openai.com/api/docs/guides/token-counting)).

#### Integration
`POST /v1/responses/input_tokens`, synchronous, with the same body shape as `POST /v1/responses` (model, input, instructions, tools, conversation or `previous_response_id`); returns `{ "object": "response.input_tokens", "input_tokens": <n> }` ([input tokens reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens)). The guide shows it through the official SDKs ([token counting guide](https://developers.openai.com/api/docs/guides/token-counting)).

#### Technical facts
- Counts input only. Output is not predictable in advance; reported output usage also includes reasoning and hidden formatting tokens, and `max_output_tokens` caps all of them ([token counting guide](https://developers.openai.com/api/docs/guides/token-counting)).
- Images are counted by size and detail level; files by the model's processed input ([token counting guide](https://developers.openai.com/api/docs/guides/token-counting)).
- Not confirmed in the docs: whether the call is free and which rate limit applies; neither the guide nor the [pricing page](https://developers.openai.com/api/docs/pricing) states it.
- Not confirmed in the docs: a counting endpoint for Chat Completions; the guide covers the Responses format only.

#### Example uses
**Example 1: Guard before an expensive call.** An application lets users attach PDFs. Before sending, it counts tokens; above 272K input tokens the request would be billed at long-context rates ([pricing](https://developers.openai.com/api/docs/pricing)), so the app asks the user to trim or confirms the cost.

**Example 2: Deciding when to compact.** A long-running agent counts its context every few turns and triggers compaction when it nears the chosen budget.

### Compaction

**Status:** no status label in the docs. The standalone endpoint was released Dec 11, 2025 and server-side compaction Feb 10, 2026 ([changelog](https://developers.openai.com/api/docs/changelog), [compaction guide](https://developers.openai.com/api/docs/guides/compaction)).

#### What it does
A long conversation eventually exceeds the context window or becomes slow and costly. Compaction replaces earlier conversation content with an encrypted, opaque "compaction item" that carries the needed state and reasoning forward in far fewer tokens ([compaction guide](https://developers.openai.com/api/docs/guides/compaction)). It is the OpenAI-managed alternative to truncating or summarising history yourself.

#### Integration
Three ways, all in the Responses API ([compaction guide](https://developers.openai.com/api/docs/guides/compaction)):
- Server-side, automatic: add `context_management` with a `compact_threshold` to `POST /v1/responses`; when the context crosses the threshold the server compacts during the same response and emits the compaction item in the output.
- Explicit trigger: append `{"type": "compaction_trigger"}` as the last input item of a `POST /v1/responses` request.
- Standalone: `POST /v1/responses/compact` takes a full context window and returns a compacted window to use as the next `input` ([compact reference](https://developers.openai.com/api/reference/resources/responses/methods/compact)).

#### Technical facts
- The compaction item is not human-readable. The output of `/responses/compact` must be passed on unchanged and unpruned ([compaction guide](https://developers.openai.com/api/docs/guides/compaction)).
- The window sent to `/responses/compact` must itself still fit the model's context window ([compaction guide](https://developers.openai.com/api/docs/guides/compaction)).
- Data: the standalone endpoint is stateless and ZDR-friendly; server-side compaction retains no data when `store=false` ([compaction guide](https://developers.openai.com/api/docs/guides/compaction), [your data](https://developers.openai.com/api/docs/guides/your-data)).
- Cost trade-off: compaction changes the prefix, so the next request reuses less prompt cache, but fewer input tokens can still be cheaper overall. Unlike manual edits of history, OpenAI compaction keeps later reasoning items ([prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching), [keep the prefix unchanged](https://developers.openai.com/api/docs/guides/keep-prefix-unchanged)).
- Pitfalls: `/responses/compact` rejects histories that contain `configuration_update` items, and the standalone and explicit-trigger variants do not restore tools added mid-conversation with `additional_tools`; automatic server-side compaction preserves both ([compaction guide](https://developers.openai.com/api/docs/guides/compaction)).
- Not confirmed in the docs: how a compaction pass is billed, and a list of supported models; the changelog names support model by model, for example GPT-5.4 mini and nano ([changelog](https://developers.openai.com/api/docs/changelog)).
- Works in WebSocket mode: server-side compaction continues with `previous_response_id`; after a standalone compact, start a new chain with the returned window ([WebSocket mode guide](https://developers.openai.com/api/docs/guides/websocket-mode)). The Agents API runs its own compaction (covered in the agents part).

#### Example uses
**Example 1: Day-long agent session.** A data-analysis agent accumulates hundreds of tool results. The application sets `compact_threshold` and keeps chaining with `previous_response_id`; compaction happens when needed and the session continues.

**Example 2: Stateless service under ZDR.** A service that stores conversation history itself and sends it in full each turn calls `/responses/compact` when its token count passes a budget, stores the returned window in place of the old history, and continues from it.
**Nuances.** For conversations that stay well inside the context window, leaving history untouched keeps prompt caching effective and is usually cheaper.

### Related guidance pages without their own service

- [Cost optimization](https://developers.openai.com/api/docs/guides/cost-optimization): a short index page pointing to fewer tokens, smaller models, the Batch API, background completion windows and Flex.
- [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization): seven principles (faster model or tier, fewer output tokens, fewer input tokens, fewer requests, parallel work, streaming and progress display, not using a model where code suffices).
- Regional processing (data residency) is a cost factor too: a 10% price uplift applies on regional endpoints for models released on or after March 5, 2026 ([pricing](https://developers.openai.com/api/docs/pricing)); details are in "Common to the whole API".

## Voice, audio, realtime, images and video

The audio part of the API was reorganised during 2026. Three facts shape everything below:

- For a new conversational voice app the docs now tell you to start with **GPT-Live**, a separate product with its own endpoint (`/v1/live/sessions`), and to use the **Realtime API** only "when you need its session and tool model" ([Audio and voice](https://developers.openai.com/api/docs/guides/audio)).
- Almost every older audio model is deprecated: all three text-to-speech models (shutdown Jan 6, 2027), `whisper-1` and the `gpt-4o-*-transcribe` family (shutdown Feb 26, 2027), and the first generation of `gpt-realtime` / `gpt-audio` models (shutdown Jan 20, 2027) ([Deprecations](https://developers.openai.com/api/docs/deprecations)).
- Video generation is gone: the Videos API and Sora 2 models were shut down on Sep 24, 2026 with no replacement ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

The docs describe three voice-agent architectures: GPT-Live (voice model in front, separate backend does the thinking), the Realtime API (one model listens, reasons, calls tools and speaks), and a "chained" pipeline you assemble yourself from speech-to-text, a text agent and text-to-speech ([Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)).

### GPT-Live (Live API)

**Status:** GA. `gpt-live-1` became generally available on Sep 10, 2026; `gpt-live-1.1` was released on Nov 19, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)). It is the recommended starting point for new conversational voice apps ([Audio and voice](https://developers.openai.com/api/docs/guides/audio)).

#### What it does
GPT-Live runs a spoken conversation that is **full duplex**: the model listens while it speaks, so the user can interrupt or add details at any time. The voice model does not do the reasoning or tool use itself. It hands that work to a backend, which is called **delegation**, and keeps talking while the backend works ([Getting started with GPT-Live](https://developers.openai.com/api/docs/guides/live)). There are two delegation modes: **Responses delegation**, where OpenAI calls a Responses API model you choose and passes it the conversation context, and **client delegation**, where your application runs any model, agent or service and returns the result ([Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)). The mode is fixed when the session is created.

How it differs from the Realtime API: in Realtime one model interprets audio, decides and calls tools; in GPT-Live the voice model and the "brain" are separate and chosen independently ([Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)). The two share transports but their handshakes, credentials and event formats are not interchangeable ([Audio and voice](https://developers.openai.com/api/docs/guides/audio)).

#### Integration
- **WebRTC (recommended, also for server-to-server):** your server sends the browser's SDP offer and the session configuration to `POST /v1/live/sessions` with the project API key and returns the SDP answer; audio travels on media tracks, JSON events on a data channel ([WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)).
- **WebSocket:** connect to `wss://api.openai.com/v1/live/sessions`, send `session.start` first, wait for `session.started`; audio is base64 inside JSON events ([WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)).
- **SIP (phone calls):** inbound calls arrive as a `live.transport.incoming` webhook and are answered with `POST /v1/live/sessions/{session_id}/accept` or `/reject`; outbound calls are placed with `POST /v1/live/sessions` and `transport.type: "sip"`; `/refer` transfers and `/hangup` ends a call ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)). Outbound SIP calling has been open to all organizations since Nov 2, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)).
- **Sideband:** a second WebSocket at `wss://api.openai.com/v1/live/sessions/{session_id}/attach` lets your server watch and steer a WebRTC or SIP session ([Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls)).
- **Stored sessions:** `POST /v1/live/sessions/{id}/fork` (or the same path over WebSocket) starts a new session from a saved one, and `GET /v1/live/sessions/{id}/content` downloads the recording as stereo WAV ([Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)).
- **SDKs:** the guides show Live examples for the official Node.js, Python, Go, Java and Ruby SDKs and say you need "an SDK version with Live support" ([WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)). OpenAI also publishes a sample app, [OpenAI Live Console](https://github.com/openai/openai-live-console).
- **Partner integrations:** LiveKit, Twilio, Telnyx, Bandwidth and Daily/Pipecat maintain their own GPT-Live connectors; a Realtime integration is not automatically compatible ([GPT-Live partner integrations](https://developers.openai.com/api/docs/guides/live-partner-integrations)).

#### Technical facts
- Models: `gpt-live-1.1` (current, better multilingual pronunciation and transcription) and `gpt-live-1`; audio and text in, audio and text out; no image or video input to the voice model ([gpt-live-1.1](https://developers.openai.com/api/docs/models/gpt-live-1.1), [gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1)).
- Billing is by session duration, per second: $0.05 per active minute and $0.02 per standby minute (read 2026-11-21); backend model and tool usage is billed separately at normal rates ([Pricing](https://developers.openai.com/api/docs/pricing)). Creating a WebRTC session bills 15 seconds up front, credited against the running session ([Cost optimization](https://developers.openai.com/api/docs/guides/voice-latency-cost)).
- Standby (WebRTC only) pauses inference during silence and resumes on speech; `idle_timeout_s` is 5 to 60 seconds ([Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)).
- Rate limits are counted in concurrent sessions (for `gpt-live-1`: 50 / 300 / 500 on the Build / Launch / Grow tiers; the Free tier is not supported) ([gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1)).
- Limits: instructions up to 16,384 tokens; context window 128,000 tokens with automatic summarisation of older history ([Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)). A connected SIP call is limited to 2 hours and ringing to 3 minutes ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)). Not confirmed in the docs: a numeric maximum duration for WebRTC/WebSocket sessions (the docs only list an `expired` close reason).
- WebSocket audio formats: PCM16 at 24 kHz (default) or 16 kHz, or G.711 μ-law/A-law at 8 kHz; one format for both directions, fixed at startup ([WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)).
- Tools under Responses delegation: web search, file search, Code Interpreter, hosted shell, image generation, MCP, function tools, computer use and others; it is a subset of the standalone Responses API ([Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)).
- Data: abuse-monitoring retention 30 days; session recordings are kept only with `store: true` (30 days) and storing/forking is unavailable under Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data), [Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)).
- Pitfalls: there is no event marking the end of a spoken response and transcript deltas carry no turn boundaries, so the client tracks playback and groups captions itself; model, voice, initial instructions and delegation mode cannot change mid-session ([Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration), [WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)).
- A migration guide covers two paths: from the Realtime API (split the prompt between voice model and backend, rename audio events, drop manual turn commits) and from a text agent or chained pipeline (keep the agent, attach it through client delegation) ([Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration)).

#### Example uses
**Example 1: Voice front end for an existing support agent.** A company already runs a text agent that looks up orders. It adds a GPT-Live session with client delegation: the voice model talks to the caller, hands lookups to the existing agent, and reads back the verified result while the caller can keep talking.
**Nuances.** With client delegation the delegation event carries metadata, not the task text; the application must build the backend request from transcripts and its own state ([Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation)).

**Example 2: Outbound appointment-reminder calls.** A clinic's server places calls through its SIP trunk with `POST /v1/live/sessions`, attaches a sideband to follow call progress and keypad presses, and uses Responses delegation with a function tool that books the slot.
**Nuances.** The trunk must support TLS signalling and SRTP media, and the 200 response does not mean the call was answered; watch `transport.answered` / `transport.failed` ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)).

**Example 3: Repeatable voice evaluations.** A team records one reference conversation with `store: true`, then forks it many times and feeds the same next caller utterance to compare backend settings ([Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)).

### Realtime API (speech-to-speech sessions)

**Status:** GA (the changelog records "now generally available"; the beta deprecation notice is dated Sep 15, 2025); the current models are `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`, released Jul 6, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)). The old beta interface (header `OpenAI-Beta: realtime=v1`) was shut down on May 12, 2026 ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
A Realtime session is a stateful, low-latency connection to one multimodal model that takes audio directly, keeps the conversation state on the server, calls tools and answers in speech, with no separate speech-to-text or text-to-speech step ([Getting started with the Realtime API](https://developers.openai.com/api/docs/guides/realtime), [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)). It also accepts text and image input and can return text only. The same API family hosts dedicated transcription and translation sessions, described in their own sections below.

#### Integration
- **WebRTC** for browsers and mobile. Two ways to set it up: the "unified interface", where your server posts the browser's SDP plus session config to `POST /v1/realtime/calls`, or an ephemeral key minted with `POST /v1/realtime/client_secrets` that the browser uses directly ([WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc)). A client secret lives 10 minutes by default, configurable from 10 seconds to 2 hours ([Create client secret](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create)).
- **WebSocket** for servers: `wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1` with a standard API key ([WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)).
- **SIP** for inbound phone calls: point a SIP trunk at `sip:$PROJECT_ID@sip.api.openai.com;transport=tls` (EU and India regional hosts exist), receive a webhook, then call `POST /v1/realtime/calls/{call_id}/accept`, `/reject`, `/refer` or `/hangup` ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip), [Calls reference](https://developers.openai.com/api/reference/resources/realtime/subresources/calls)). Outbound SIP calling is offered through the Live API, not the Realtime call-creation endpoint ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)).
- **Server-side controls (sideband):** a server WebSocket at `wss://api.openai.com/v1/realtime?call_id=...` joins an existing WebRTC or SIP session to update instructions and answer tool calls privately ([Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls)).
- **SDKs:** the Agents SDK offers `RealtimeAgent` / `RealtimeSession` as the high-level browser starting point ([Getting started with the Realtime API](https://developers.openai.com/api/docs/guides/realtime)); the WebSocket guide shows official Ruby, Java, Go and .NET SDK connections (the .NET types are marked experimental) ([WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets)).
- The reference also lists `POST /v1/realtime/sessions` and `POST /v1/realtime/transcription_sessions` for minting ephemeral tokens; the migration notes direct you to `client_secrets` instead ([Realtime reference](https://developers.openai.com/api/reference/resources/realtime), [Getting started with the Realtime API](https://developers.openai.com/api/docs/guides/realtime)). Not confirmed in the docs: whether those two older endpoints carry a deprecation date.

#### Technical facts
- Current models: `gpt-realtime-2.1` and `gpt-realtime-2.1-mini`, both reasoning models with configurable reasoning effort, 128,000-token context, 32,000 max output tokens, text/audio/image input ([gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1), [gpt-realtime-2.1-mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)). `gpt-realtime-2` and `gpt-realtime-1.5` are still listed without a deprecation mark ([gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2), [gpt-realtime-1.5](https://developers.openai.com/api/docs/models/gpt-realtime-1.5)).
- Deprecated, shutdown Jan 20, 2027: `gpt-realtime`, `gpt-realtime-mini` (replacements `gpt-realtime-2.1` / `-mini`). Already shut down on May 7, 2026: the `gpt-4o-realtime-preview` family ([Deprecations](https://developers.openai.com/api/docs/deprecations)).
- Billing is by tokens per response, across text, audio and image; the whole conversation is re-sent as input on every turn, so later turns cost more; prompt caching applies automatically. User audio is 1 token per 100 ms, assistant audio 1 token per 50 ms ([Cost optimization](https://developers.openai.com/api/docs/guides/voice-latency-cost)). Rates for `gpt-realtime-2.1`: audio $32 in / $64 out, text $4 in / $24 out per 1M tokens; the mini is $10 / $20 audio and $0.60 / $2.40 text (read 2026-11-21) ([Pricing](https://developers.openai.com/api/docs/pricing)).
- Maximum session duration: 60 minutes ([Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)).
- Voice activity detection (VAD, automatic detection of when the user starts and stops speaking) is on by default. Two modes: `server_vad` (silence-based) and `semantic_vad` (decides from the words whether the user has finished); it can be switched off for push-to-talk ([Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)).
- Tools: function tools that your code executes, and MCP tools that the Realtime API calls itself on a remote MCP server (`server_url`), with optional approval steps; set per session or per response. `connector_id` (built-in connectors) is deprecated for models released after Sep 1, 2026 ([Realtime with tools](https://developers.openai.com/api/docs/guides/realtime-mcp)).
- Built-in voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`; the voice cannot change after the first audio output in a session ([Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)).
- Data: 30 days abuse-monitoring retention, no application state stored, eligible for Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Pitfalls: over WebSocket the client must handle interruption itself (stop playback and send `conversation.item.truncate`), while WebRTC and SIP do it on the server ([Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)); input transcription is billed separately from the conversation model ([Cost optimization](https://developers.openai.com/api/docs/guides/voice-latency-cost)).
- Connection-time optimisation: WARP (WebRTC Abridged Roundtrip Protocol) shortens session start for both Realtime and GPT-Live; it needs client support or browser origin trials ([WebRTC with WARP](https://developers.openai.com/api/docs/guides/realtime-webrtc-warp)).

#### Example uses
**Example 1: In-browser voice assistant with tools.** A web app mints a client secret on its server, connects the browser over WebRTC, and gives the model two function tools. The model hears the user, calls a function, and speaks the answer in one session.
**Nuances.** For a new app with a separate reasoning backend the docs point to GPT-Live first ([Audio and voice](https://developers.openai.com/api/docs/guides/audio)). Long sessions get expensive because history is re-billed each turn; truncation settings or the mini model reduce that ([Cost optimization](https://developers.openai.com/api/docs/guides/voice-latency-cost)).

**Example 2: Inbound phone line with human transfer.** A SIP trunk routes calls to the project; the server accepts each call with a session config, monitors it over the sideband WebSocket, and uses the `refer` endpoint to transfer to a human agent's number ([Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)).

**Example 3: Speech generation in a cloned or built-in voice.** Since the dedicated TTS models are deprecated, an app opens a Realtime session with `gpt-realtime-2.1-mini`, sends the text as a user message and asks for audio-only output ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)). See the Text-to-speech section.

### Realtime transcription (live speech-to-text)

**Status:** No status label in the docs for the feature; the recommended model `gpt-live-transcribe` was released Jul 28, 2026 and carries no preview mark ([Changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
A transcription session takes audio that is still arriving (microphone, call, media stream) and returns text deltas as speech comes in, plus a final transcript per audio turn. No assistant speaks back ([Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)).

#### Integration
Server WebSocket to `wss://api.openai.com/v1/realtime?intent=transcription` (no `model` in the URL), then `session.update` with `type: "transcription"` and the model; send audio with `input_audio_buffer.append` and close each turn with `input_audio_buffer.commit`. Browsers use WebRTC ([Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)).

#### Technical facts
- Models: `gpt-live-transcribe` (recommended, low-latency deltas); `gpt-transcribe` for "committed-turn" transcription that starts after the turn is committed and also returns detected languages (WebSocket only); `gpt-realtime-whisper` remains for existing integrations but is not recommended for new ones ([Transcription](https://developers.openai.com/api/docs/guides/transcription)).
- Price: `gpt-live-transcribe` and `gpt-realtime-whisper` $0.017 per minute of audio (read 2026-11-21) ([Pricing](https://developers.openai.com/api/docs/pricing)).
- `gpt-live-transcribe` does not support server VAD: turn detection must be omitted and your client decides when a turn ends ([Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)).
- It returns no word timestamps, speaker labels or confidence scores ([Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)).
- Accuracy helpers: `prompt` (free context), `keywords` (literal terms), `languages` (list of expected languages); a `delay` setting from `minimal` to `xhigh` trades latency for accuracy ([Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)).
- Completion events from different turns may arrive out of order; match them by `item_id` ([Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)).

#### Example uses
**Example 1: Live captions for a webinar.** A media server streams 24 kHz PCM audio over WebSocket, shows deltas as captions and stores the final transcript per turn, with product names passed as `keywords`.
**Nuances.** If the recording already exists, file transcription is cheaper ($0.0045 vs $0.017 per minute, read 2026-11-21, [Pricing](https://developers.openai.com/api/docs/pricing)) and needs no persistent connection.

### Realtime translation (live speech-to-speech translation)

**Status:** No status label in the docs; released May 7, 2026 with `gpt-realtime-translate` ([Changelog](https://developers.openai.com/api/docs/changelog)). It is the listed replacement for the deprecated `/v1/audio/translations` ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
A translation session acts as an interpreter: you stream source speech in and receive translated speech plus transcript deltas while the speaker is still talking. There is no assistant, no tools and no `response.create`; output follows the audio stream continuously ([Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation)).

#### Integration
Dedicated endpoint: WebSocket `wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate` for servers, or WebRTC for browsers with a short-lived key from `POST /v1/realtime/translations/client_secrets` ([Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation), [Realtime reference](https://developers.openai.com/api/reference/resources/realtime)). The target language is set in `audio.output.language` ([Translation client events](https://developers.openai.com/api/reference/resources/realtime/translation-client-events)).

#### Technical facts
- Model: `gpt-realtime-translate`, audio in, audio and text out; billed $0.034 per minute of audio (read 2026-11-21) ([gpt-realtime-translate](https://developers.openai.com/api/docs/models/gpt-realtime-translate)).
- One session produces one target language; several target languages or two-way conversation need one session per language/direction ([Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation)).
- Keep sending audio, including silence; when the stream ends send `session.close` and wait for `session.closed`, or pending output is lost ([Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation)).
- Not confirmed in the docs read: the list of supported language pairs.

#### Example uses
**Example 1: Listen-along translation of a conference talk.** A media worker sends the stage audio into one session per audience language and publishes each translated audio track and its captions.

**Example 2: Two-way interpreted call.** A support call between an English and a Spanish speaker uses two sessions, one per direction, with each participant's audio kept on a separate track ([Realtime translation](https://developers.openai.com/api/docs/guides/realtime-translation)).
**Nuances.** It only streams. To translate a finished recording into text, the remaining route until Feb 26, 2027 is the deprecated `/v1/audio/translations`; after that, transcribe the file and translate the text with a text model (this last step is my suggestion, not a path named in the docs).

### Speech-to-text for files (`/v1/audio/transcriptions`)

**Status:** Endpoint active; the recommended model `gpt-transcribe` was released Jul 28, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)). The models `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` and `gpt-4o-transcribe-diarize` are deprecated with shutdown on Feb 26, 2027 ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
You upload a finished audio file and get its transcript in the original language, either as one JSON response or streamed as the model works through the file ([File transcription](https://developers.openai.com/api/docs/guides/speech-to-text)).

#### Integration
`POST /v1/audio/transcriptions`, multipart upload, synchronous. With `stream=true` the response is a server-sent event stream of `transcript.text.delta` events ending in `transcript.text.done`; no Realtime session is needed ([File transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)). Supported by the official SDKs (`client.audio.transcriptions`).

#### Technical facts
- File limit 25 MB; formats `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav`, `webm`. Longer recordings must be compressed or split by you ([File transcription](https://developers.openai.com/api/docs/guides/speech-to-text)).
- `gpt-transcribe`: $0.0045 per minute (read 2026-11-21), returns text plus detected languages, accepts `prompt`, `keywords` and `languages` (a list; do not also send the old singular `language`) ([gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe), [File transcription](https://developers.openai.com/api/docs/guides/speech-to-text)).
- Capability gap: the docs name only deprecated models for three features. Speaker labels (diarization) need `gpt-4o-transcribe-diarize`; word/segment timestamps and `srt`/`vtt` subtitle output need `whisper-1`. The guide warns that "changing only the model ID doesn't preserve every capability" ([Transcription](https://developers.openai.com/api/docs/guides/transcription)). Not confirmed in the docs: a non-deprecated model that provides diarization or timestamps after Feb 26, 2027.
- Diarization details (deprecated model): `diarized_json` response format, `chunking_strategy` required for audio over 30 seconds, up to four known-speaker reference clips of 2 to 10 seconds ([File transcription](https://developers.openai.com/api/docs/guides/speech-to-text)).
- Data: no abuse-monitoring retention and no stored state for this endpoint; eligible for Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Rate limits for `gpt-transcribe`: 5,000 requests/min on the Build tier ([gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe)).

#### Example uses
**Example 1: Transcribing recorded interviews.** A research tool uploads each recording (under 25 MB), passes participant and product names as `keywords`, and stores the JSON transcript.

**Example 2: Meeting minutes with speaker names.** An existing integration uses `gpt-4o-transcribe-diarize` with `diarized_json` to label who said what.
**Nuances.** This works only until Feb 26, 2027 and the docs list no successor with speaker labels, so a new project should not build on it without a fallback ([Transcription](https://developers.openai.com/api/docs/guides/transcription)).

### Audio translations endpoint (`/v1/audio/translations`)

**Status:** Deprecated; shutdown Feb 26, 2027 (notice Aug 26, 2026). Listed replacement: [`/v1/realtime/translations`](https://developers.openai.com/api/docs/guides/realtime-translation) ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

`POST /v1/audio/translations` takes an audio file and returns English text only; it works only with `whisper-1` ([Create translation](https://developers.openai.com/api/reference/resources/audio/subresources/translations/methods/create)). The replacement is not a drop-in: it is a streaming session that outputs translated speech and transcript deltas, so migration means a new integration ([File transcription](https://developers.openai.com/api/docs/guides/speech-to-text)).

### Text-to-speech (`/v1/audio/speech`)

**Status:** All three models that the endpoint accepts (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` and its snapshots) are deprecated; shutdown Jan 6, 2027, notice Oct 1, 2026, replacement `gpt-realtime-2.1-mini` ([Deprecations](https://developers.openai.com/api/docs/deprecations)). The docs do not state that the endpoint itself is deprecated, but they list no model for it after that date.

#### What it does
The Speech endpoint turns up to 4,096 characters of text into spoken audio in a chosen voice, as a file or as a chunked stream that can be played while it is generated ([Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)).

**The current recommended way to do TTS** is a different workflow: open a Realtime API session with `gpt-realtime-2.1-mini`, add a user message containing the text, and send `response.create` with `output_modalities: ["audio"]`; session instructions tell the model to read the text aloud. The TTS guide says explicitly that this "is a change of API workflow" and that `gpt-realtime-2.1-mini` is not accepted by `/v1/audio/speech` ([Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech), [Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).

#### Integration
- Legacy (until Jan 6, 2027): `POST /v1/audio/speech`, JSON body, synchronous; the response is binary audio with chunked transfer, or SSE audio events with `stream_format: "sse"` (not for `tts-1`/`tts-1-hd`). In the official SDKs as `client.audio.speech.create` ([Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)).
- Replacement: a Realtime session over WebRTC or WebSocket, see the Realtime API section.

#### Technical facts
- Legacy output formats: `mp3` (default), `opus`, `aac`, `flac`, `wav`, `pcm`; 13 built-in voices, a smaller set for `tts-1`/`tts-1-hd`; `instructions` to steer tone works only with `gpt-4o-mini-tts` ([Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)).
- Legacy prices (read 2026-11-21): `tts-1` $15 and `tts-1-hd` $30 per 1M characters; `gpt-4o-mini-tts` $0.60 per 1M text input tokens and $12 per 1M audio output tokens ([Pricing](https://developers.openai.com/api/docs/pricing)). The Realtime replacement bills audio output at $20 per 1M tokens for `gpt-realtime-2.1-mini` ([Pricing](https://developers.openai.com/api/docs/pricing)).
- OpenAI's usage policies require telling end users that the voice is AI-generated ([Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)).
- Pitfall of the replacement: a Realtime model is a conversational model instructed to read text, not a dedicated synthesiser. Not confirmed in the docs: any guarantee that it reads the text verbatim, a file-output mode (audio arrives as a stream you must record yourself), or output formats such as MP3.
- Data (legacy endpoint): 30 days abuse-monitoring retention, eligible for Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).

#### Example uses
**Example 1: Narrating articles (legacy path).** A blog generates an MP3 per article with `gpt-4o-mini-tts`, splitting text into chunks of at most 4,096 characters.
**Nuances.** This stops working on Jan 6, 2027; plan the Realtime-based replacement or another provider before building on it.

**Example 2: Spoken prompts in an app (current path).** A language-learning app opens a Realtime WebSocket session with `gpt-realtime-2.1-mini`, sends each sentence as a text message, requests audio-only output and plays the returned audio deltas.

### Custom voices and voice consents

**Status:** Two parts with different status. Prompt-to-voice (a voice created from a text description) is GA for all API customers since Oct 16, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)). Voices cloned from a recording are limited to eligible customers who arrange access through sales ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).

#### What it does
Lets an application speak in its own voice instead of a built-in one. A voice is either generated from a written description ("adult, mid-range pitch, calm, American English") or cloned from a short sample recording, in which case the speaker must also record a fixed consent phrase ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).

#### Integration
REST, synchronous: `POST /v1/audio/voices` (JSON with `type: "prompt"`, or a recording plus consent ID), `DELETE /v1/audio/voices/{voice_id}`, and `POST/GET/DELETE /v1/audio/voice_consents` for consent recordings ([Audio reference](https://developers.openai.com/api/reference/resources/audio)). The voice is then referenced as `{ "id": "voice_..." }` wherever a voice name is accepted.

#### Technical facts
- Prompt-generated voices work only with GPT-Live, not with the Speech, Realtime or Chat Completions APIs; creating one is free, up to 100 per organization ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).
- Recording-based voices work with GPT-Live, the Speech API, the Realtime API and Chat Completions audio output; at most 20 per organization; samples of 60 seconds or less, uploads up to 10 MiB ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).
- The consent recording must contain exactly one of the published phrases (16 languages, Polish included); any deviation fails ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).
- `gpt-live-1` supports custom voices with English accents ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)). Not confirmed in the docs: the same statement for `gpt-live-1.1`.
- Voice creation is not compatible with Zero Data Retention; voices are stored until deleted ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Rules: no imitation of named people, no children's voices, listeners must be told the speech is AI-generated ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).

#### Example uses
**Example 1: A brand voice for a voice assistant.** A product team describes the voice in text, creates it once, stores the returned ID and uses it in every GPT-Live session.
**Nuances.** The response contains no audio preview; listening means running a billed GPT-Live session ([Custom voices](https://developers.openai.com/api/docs/guides/custom-voices)).

### Audio in Chat Completions (`gpt-audio` models)

**Status:** GA model `gpt-audio-1.5` (described on its page as generally available, no deprecation mark) ([gpt-audio-1.5](https://developers.openai.com/api/docs/models/gpt-audio-1.5)). `gpt-audio` and `gpt-audio-mini` are deprecated, shutdown Jan 20, 2027; `gpt-4o-audio-preview` was shut down May 7, 2026 ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Adds audio to the ordinary request/response chat endpoint: you can send a recorded audio clip as part of a message, ask for a spoken answer, or both, in one bounded request without a live session ([Audio in Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions)).

#### Integration
`POST /v1/chat/completions` with `modalities: ["text", "audio"]` and an `audio` object (voice, format); input audio goes in as a base64 `input_audio` content part and output audio comes back base64-encoded. Synchronous, streaming supported; available through the official SDKs' chat completions methods ([Audio in Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions)).

#### Technical facts
- This is Chat Completions only: the docs say the Responses API currently covers text and image input with text output ([Audio in Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions)).
- `gpt-audio-1.5`: 128,000-token context, 16,384 max output tokens, function calling supported; audio $32 in / $64 out and text $2.50 in / $10 out per 1M tokens (read 2026-11-21) ([gpt-audio-1.5](https://developers.openai.com/api/docs/models/gpt-audio-1.5)).
- The mini is deprecated with `gpt-audio-1.5` as its only listed replacement, so the cheap tier disappears on Jan 20, 2027 ([Deprecations](https://developers.openai.com/api/docs/deprecations)).
- Audio output state is kept for 1 hour to allow multi-turn conversations ([Your data](https://developers.openai.com/api/docs/guides/your-data)).

#### Example uses
**Example 1: Voice messages in a chat app.** A messaging bot receives a recorded voice note, sends it as `input_audio`, and gets a text answer; no transcription step is needed.
**Nuances.** For a pure transcript `gpt-transcribe` is far cheaper; for a live conversation use GPT-Live or the Realtime API ([Audio and voice](https://developers.openai.com/api/docs/guides/audio)).

### Images API (generation and editing)

**Status:** Active. Newest models `gpt-image-2.6-sunburst` and `gpt-image-2.6-flare` were released Nov 4, 2026; `gpt-image-2.5-sunburst` / `-flare` on Sep 8, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)). Deprecated: `gpt-image-1-mini`, `gpt-image-1.5`, `chatgpt-image-latest` (shutdown Dec 1, 2026) and `gpt-image-2` (shutdown Feb 10, 2027). Already shut down: `gpt-image-1` (Oct 23, 2026), `dall-e-2` and `dall-e-3` (May 12, 2026) ([Deprecations](https://developers.openai.com/api/docs/deprecations)). The variations endpoint is retired.

#### What it does
Generates an image from a text prompt, or edits existing images guided by a prompt, optional reference images, a mask, or a drawn annotation layer ("markup"). The 2.6 models add a `complexity` setting (how much the model plans before rendering), vector SVG output and animated GIF output ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)). The same models are also reachable as the image generation tool inside the Responses API, covered in the tools section.

#### Integration
- `POST /v1/images/generations` (JSON) and `POST /v1/images/edits` (multipart or JSON with `image_url` / `file_id` references). Synchronous; the image comes back base64-encoded ([Images reference](https://developers.openai.com/api/reference/resources/images)).
- Streaming: `stream: true` with `partial_images` 0 to 3 returns partial previews as server-sent events before the final image ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- `POST /v1/images/variations` "is retired and no longer available"; use edits with a prompt instead ([Create image variation](https://developers.openai.com/api/reference/resources/images/methods/create_variation)).
- Batch API is supported for GPT-Image-2.5 and GPT Image 2 at half price ([gpt-image-2.5-flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)). Not confirmed in the docs: Batch support for the 2.6 models (their model pages do not list it).
- Official SDKs: `client.images.generate` / `client.images.edit`.

#### Technical facts
- Choosing a model: Sunburst for detailed work and precise edits, Flare for speed ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Sizes: recommended `1024x1024`, `1536x1024`, `1024x1536`; custom `WIDTHxHEIGHT` allowed with both sides multiples of 16, aspect ratio between 1:3 and 3:1, no edge over 3840 px, total pixels between 655,360 and 8,294,400 ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Quality: `low`, `medium`, `high`, `xhigh`, `max`, `auto`. Output formats: `png` (default), `jpeg`, `webp`, plus `svg` (generations only) and `gif`; transparent background needs `png` or `webp` ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Edits accept up to 16 input images; mask and image under 50 MB each; `n` from 1 to 10 images per request ([Images reference](https://developers.openai.com/api/reference/resources/images), [Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Billing is by tokens: for the 2.5 and 2.6 models $30 per 1M image output tokens, $8 per 1M image input tokens, $5 per 1M text input tokens (read 2026-11-21); each partial image adds 100 output tokens. The token count per image depends on model, size and quality, so use the calculator in the guide ([Pricing](https://developers.openai.com/api/docs/pricing), [Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Moderation: all prompts and outputs are filtered; the `moderation` parameter is `auto` (default) or `low` (less restrictive). Blocked requests return `moderation_blocked` with a coarse `moderation_details` object ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Organization verification may be required before GPT Image models can be used ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).
- Limits and pitfalls: complex prompts can take up to 2 minutes; text placement and consistency of recurring characters are imperfect ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)). Rate limits for 2.5 Flare on the Build tier are 20 images per minute ([gpt-image-2.5-flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)).
- Data: 30 days abuse-monitoring retention, nothing stored as application state; Zero Data Retention is listed for the 2.5 models, `gpt-image-2`, `gpt-image-1.5` and `gpt-image-1-mini` ([Your data](https://developers.openai.com/api/docs/guides/your-data)). Not confirmed in the docs: ZDR for the 2.6 models (not in that list).

#### Example uses
**Example 1: Product images on a new background.** A shop sends a product photo to the edits endpoint with a prompt and a mask over the background, and receives a `webp` image at 1536x1024.

**Example 2: A logo as editable vector.** A design tool requests `output_format: "svg"` from the generations endpoint and saves the returned XML.
**Nuances.** SVG works only on generations, with `n` = 1 and no streaming, and is billed twice: the image model for a reference image and an authoring model for the SVG tokens ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).

**Example 3: Progressive preview in a chat UI.** An app streams with `partial_images: 2` to show the picture forming while the user waits.
**Nuances.** For multi-turn "now change this" editing in a conversation, the Responses API image generation tool is the better fit ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)).

### Video generation (Videos API, Sora 2)

**Status:** Shut down on Sep 24, 2026 (notice Mar 24, 2026). Replacement: "No one-to-one replacement" ([Deprecations](https://developers.openai.com/api/docs/deprecations)).

The Videos API (`/v1/videos` and its sub-endpoints) and the models `sora-2` and `sora-2-pro` with all snapshots no longer accept requests. The guide, the model page and the reference are kept online "for historical reference" and each opens with the shutdown notice ([Video generation with Sora](https://developers.openai.com/api/docs/guides/video-generation), [sora-2](https://developers.openai.com/api/docs/models/sora-2), [Videos reference](https://developers.openai.com/api/reference/resources/videos)). The changelog has entries for the launch and the March 2026 expansion but none for the shutdown itself ([Changelog](https://developers.openai.com/api/docs/changelog)).

No video capability remains in the API as documented: there is no video generation endpoint, the current docs index lists no video guide, and `gpt-live-1` lists video as an unsupported modality ([gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1)). The nearest thing is animated GIF output from the GPT-Image-2.6 models ([Image generation](https://developers.openai.com/api/docs/guides/image-generation)). Videos could be downloaded for 48 hours after generation before the shutdown; the docs make no promise of access afterwards ([Your data](https://developers.openai.com/api/docs/guides/your-data)).

### Content provenance checks

**Status:** No status label in the docs. File checks (image, audio, PDF) are documented as generally usable; text checks are limited to approved organizations ([Content provenance](https://developers.openai.com/api/docs/guides/content-provenance)).

#### What it does
An API that tells you whether a file carries OpenAI's own provenance signals: C2PA Content Credentials (signed metadata, in images and PDFs) and a SynthID watermark (embedded in images and audio). It is meant for content review, labelling and trust-and-safety workflows ([Content provenance](https://developers.openai.com/api/docs/guides/content-provenance)).

#### Integration
`POST /v1/content_provenance_checks`, multipart upload of one file, synchronous: the result comes back in the same response. Requires SDK versions Python 2.52.0, Go 3.49.0 or Ruby 0.75.0 or later ([Content provenance](https://developers.openai.com/api/docs/guides/content-provenance)).

#### Technical facts
- Each signal returns `detected` or `not_detected` with issuer and generation time when available ([Content provenance](https://developers.openai.com/api/docs/guides/content-provenance)).
- It is not a general AI detector: it does not detect other companies' models, and `not_detected` does not prove a file is not from OpenAI (metadata may be stripped, the watermark degraded, or the content made by a legacy model) ([Content provenance](https://developers.openai.com/api/docs/guides/content-provenance)).
- Not confirmed in the docs read: price, file size limits and rate limits (the pricing page has no entry for it).

#### Example uses
**Example 1: Labelling uploads on a media platform.** A moderation pipeline sends each uploaded image to the endpoint and adds an "AI-generated" label when either signal is detected.
**Nuances.** Treat the result as one-directional evidence: a positive is meaningful, a negative is not.

### Decisions voice connection (GPT-Live with the Decisions API)

**Status:** Released Oct 15, 2026 as a feature of GPT-Live; no separate status label. The Decisions API itself has been GA since Oct 22, 2026 ([Changelog](https://developers.openai.com/api/docs/changelog)).

Decisions is an API service in its own right, not an audio service: `POST /v1/decisions` evaluates text, images and JSON and returns typed answers (a probability, a choice from a fixed set, or a rubric score), which the docs describe as about 10x faster than the Responses API; `gpt-6-luna` is the only supported model ([Decisions](https://developers.openai.com/api/docs/guides/decisions)). It belongs to another section of this overview.

The voice connection is a configuration of a GPT-Live session, not a separate endpoint. It lets Live call Decisions directly instead of going through your app, in two ways: as native delegation (`session.delegation`), where Live asks Decisions to pick among actions you defined, or as triggers (`session.triggers`) that fire on input or output transcript deltas, so the app can react while the user is still speaking ([Connect voice to Decisions](https://developers.openai.com/api/docs/guides/decisions-voice)).

**Example 1: In-car voice controls.** The driver says "I feel a little cold"; Live asks Decisions to choose among temperature up/down/none and defogger on/off/none, and the app applies the result without a full reasoning call ([Connect voice to Decisions](https://developers.openai.com/api/docs/guides/decisions-voice)).
**Nuances.** The delegation type is fixed for the session; questions can be changed mid-session with `session.update` ([Connect voice to Decisions](https://developers.openai.com/api/docs/guides/decisions-voice)).

## Agent-building products

OpenAI's docs offer three places where an agent loop (model call, tool call, repeat until done) can run: the Agents API (OpenAI runs the loop), the Agents SDK (the loop runs in your application), and the Responses API (you build the loop yourself). The [Agents overview](https://developers.openai.com/api/docs/guides/agents) compares them and adds ChatKit as the embedded chat UI. This part covers those products and the ChatGPT-side products documented next to them.

### Agents SDK

**Status:** No status label in the docs. The libraries are open source (MIT) and still on 0.x versions: Python `v0.25.0`, released 2026-11-18 ([openai-agents-python](https://github.com/openai/openai-agents-python)), and `@openai/agents` 0.22.0, released 2026-11-12 ([openai-agents-js](https://github.com/openai/openai-agents-js)). Both repositories had commits within a day or two of 2026-11-21.

#### What it does
A code library, not a hosted service. You define agents (a model, instructions, tools) in TypeScript or Python, and the SDK's runner executes the agent loop inside your own process: it calls the model, runs the tool calls, switches between agents and returns a result ([Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)). Your server owns deployment, tool implementations, state storage and approval decisions ([Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)).

#### Integration
No endpoint of its own. Install `pip install openai-agents` or `npm install @openai/agents zod` ([quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart)); the SDK then calls the Responses API (or Chat Completions) with your API key. Runs can be awaited or streamed as events; an optional Responses WebSocket transport exists for many repeated model round trips ([Models and providers](https://developers.openai.com/api/docs/guides/agents/models)). There are only two official languages: TypeScript and Python ([Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)).

#### Technical facts
- **Agent definition:** name, instructions (static or a callback), model and model settings, tools, handoffs, structured output type, guardrails, MCP servers; a local run context carries your own objects (user, database client) without showing them to the model ([Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents)).
- **Orchestration:** two patterns. A *handoff* passes the conversation to a specialist agent that then owns the reply; *agents as tools* (`agent.asTool()` / `agent.as_tool()`) keeps a manager agent in charge ([Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration)).
- **Guardrails and human review:** input, output and tool guardrails run automatic checks; approvals pause a run before a tool executes, return `interruptions` plus a serialisable `state`, and the same run resumes later. Input guardrails run only for the first agent in a chain and output guardrails only for the agent that produces the final answer ([Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)).
- **State between turns:** four options: replay history yourself, an SDK `session` backed by your storage, a `conversationId` (OpenAI Conversations API), or `previousResponseId` (Responses API chaining). The docs advise one strategy per conversation ([Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents)). The result object exposes the final output, history, last agent and pending interruptions ([Results and state](https://developers.openai.com/api/docs/guides/agents/results)).
- **Tracing:** on by default on the server-side path; each run records model calls, tool calls, handoffs, guardrails and custom spans, visible in the Traces dashboard ([Integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability)).
- **MCP:** hosted MCP tools (OpenAI calls a public remote server) or SDK-managed servers over stdio or streamable HTTP for local and private servers ([Integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability)).
- **Sandbox agents:** `SandboxAgent` gives the agent an isolated Unix-like workspace with shell, file editing, skills, memory and context compaction. A `Manifest` describes the starting files, Git repos and storage mounts (S3, GCS, R2, Azure Blob, Box). Sandbox clients exist for Unix-local, Docker, Blaxel, Cloudflare, Databricks, Daytona, E2B, Modal and Vercel. The TypeScript SDK needs a Python 3 interpreter on the host for the Unix-local client ([Sandbox agents](https://developers.openai.com/api/docs/guides/agents/sandboxes)).
- **Voice:** `RealtimeAgent`/`RealtimeSession` for speech-to-speech over the Realtime API, and a chained pipeline (speech-to-text, agent, text-to-speech) ([Voice agents](https://developers.openai.com/api/docs/guides/voice-agents)). The Python README lists a `VoicePipeline` behind the `openai-agents[voice]` extra ([openai-agents-python](https://github.com/openai/openai-agents-python)).
- **Model providers:** the READMEs call the SDK provider-agnostic; the Python one names the Responses and Chat Completions APIs "as well as 100+ other LLMs" ([openai-agents-python](https://github.com/openai/openai-agents-python)). The guide recommends starting new workflows with `gpt-6.2-astra` and setting the model explicitly instead of relying on the SDK default ([Models and providers](https://developers.openai.com/api/docs/guides/agents/models)).
- **Runtime requirements:** Python 3.10 or newer ([openai-agents-python](https://github.com/openai/openai-agents-python)); Node.js 22 or later, Deno or Bun, with Cloudflare Workers support marked experimental ([openai-agents-js](https://github.com/openai/openai-agents-js)).
- **Billing:** the SDK is free; you pay for the model and tool calls it makes ([pricing](https://developers.openai.com/api/docs/pricing)). Not confirmed in the docs: any charge for stored traces.

#### Example uses
**Example 1: Support desk with specialists.** A triage agent reads each customer message and hands off to a billing agent or a technical agent. The refund tool requires approval: the run pauses, your back office shows the pending call to an employee, and the run resumes from the stored state after the decision.
**Nuances.** Approvals are paused runs, not new turns; store the serialised state if the review takes hours ([Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)).

**Example 2: Report from a folder of documents.** A nightly job mounts a storage bucket with contracts into a Docker sandbox, a `SandboxAgent` runs scripts over the files and writes a CSV and a Markdown summary that the job copies out.
**Nuances.** You run and pay for the sandbox yourself. If you would rather not operate the loop or the compute, the Agents API below does both ([Agents overview](https://developers.openai.com/api/docs/guides/agents)).

### Agents API

**Status:** Public beta, released 2026-09-10 ([changelog](https://developers.openai.com/api/docs/changelog)). Requests need the header `OpenAI-Beta: agents=v1` ([quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)).

#### What it does
A hosted agent runtime. OpenAI runs the "Codex harness" (the same agent loop that powers its Codex coding agent) and manages sessions, tool orchestration, context compaction (summarising old work so the conversation fits the model's context window) and recovery. Your application creates a session, sends tasks and receives events; the agent can work in a sandbox where it runs commands, edits files, calls MCP servers and produces files ([overview](https://developers.openai.com/api/docs/guides/agents-api/overview)). It is the successor in spirit to the Assistants API, which shut down on 2026-08-26 ([changelog](https://developers.openai.com/api/docs/changelog)), though the docs name the Responses and Conversations APIs as the Assistants replacement.

#### Integration
- **Endpoints** ([API reference](https://developers.openai.com/api/reference/resources/beta/subresources/agents)): `POST/GET/DELETE /v1/agents` (saved agent configurations); `POST /v1/agents/sessions` and `GET/POST/DELETE /v1/agents/sessions/{id}`; `POST` and `GET /v1/agents/sessions/{id}/events` (send input, stream output); `.../items`, `.../turns`, `.../subagents`, `.../artifacts`, `.../traces`; `/v1/agents/environments` with `/files` and `/templates`; `/v1/agents/automations` with `/invocations`, `/pause`, `/resume`; `/v1/vaults` with `/credentials`.
- **Call style:** asynchronous. A turn (one cycle of work) runs in the background; you follow it over an SSE event stream (`stream: true` on creation or the events endpoint) or receive webhooks for session state changes ([sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks)). Self-hosted sandboxes connect to OpenAI over an outbound WebSocket ([self-hosted sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted)).
- **SDKs:** the `beta.agents` namespace in the official Python, TypeScript, Go, Java and Ruby SDKs, plus cURL ([quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)).
- **Key permissions:** `api.agents.read`, `api.agents.write` and `api.responses.write`; add `api.vaults.read`/`api.vaults.write` for vaults ([quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [sandbox security](https://developers.openai.com/api/docs/guides/agents-api/environments/security)).

#### Technical facts
- **Concepts:** an *agent* is the model, instructions, tools and MCP servers; an *environment* is an optional sandbox; a *session* is a durable instance of an agent; *events* are live updates and *items* are the saved messages and tool calls ([overview](https://developers.openai.com/api/docs/guides/agents-api/overview)).
- **Models:** the docs' examples use `gpt-6-astra` throughout. Not confirmed in the docs: a list of models the Agents API supports. The session `service_tier` can be set, including `ultrafast` on supported models ([changelog](https://developers.openai.com/api/docs/changelog)).
- **Sessions:** a message to an idle session starts a turn; a message during a turn steers it. Send an `Idempotency-Key` header per message. Streams do not replay missed events: after a disconnect you rebuild state from saved items. `agent.session.idle` does not mean success; check for `agent.session.turn.completed`, `.failed` or `.cancelled`, and a completed turn can still contain failed tool calls ([sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events)).
- **Size limits:** instructions plus tool configuration under 4 MiB; input plus output schema under 4 MiB; a tool result under 4 MiB ([configuration](https://developers.openai.com/api/docs/guides/agents-api/configuration), [sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions)).
- **Environments:** `none` (no files or shell, only remote MCP and function tools), `openai_hosted`, or `self_hosted` ([architecture](https://developers.openai.com/api/docs/guides/agents-api/architecture)).
- **OpenAI-hosted sandbox:** Linux workspace at `/workspace` with Python and Node.js; sizes `small` (1 vCPU, 1 GB), `medium` (2 vCPU, 4 GB, default) and `large` (4 vCPU, 16 GB); network `enabled`, `disabled` or `restricted` to 1-100 exact host names; packages, files, setup commands and environment variables are configurable; the sandbox can be deleted after an hour without activity or keep-alives ([OpenAI-hosted sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted)).
- **Self-hosted and third-party sandboxes:** you run `codex exec-server` (the executor) in your own compute with a restricted "environment key"; it needs outbound access to `api.openai.com` and `wss://codex-cloud-environments.chatgpt.com`. Provider guides exist for AWS Lambda MicroVMs, Blaxel, Cloudflare, Databricks, Daytona, DigitalOcean, E2B, Modal, Oracle Cloud, Render and Vercel ([self-hosted sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted)). The API waits up to five minutes for an executor to connect, and deleting a session does not stop your compute ([sandbox lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle)).
- **Pre-warming:** `POST /v1/agents/environments` prepares a hosted sandbox before a session exists. Pre-warming is free; an unattached environment expires after 5 minutes; one shared environment accepts up to 128 sessions; after 20 idle minutes it can be suspended with a checkpoint kept for 7 days ([pre-warm sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/prewarmed)).
- **Files and artifacts:** up to 50 input files per request; inline files 5 MiB each and 10 MiB total; Files API files 50 MiB each. Files the agent writes under `/workspace/outputs` are published as immutable artifacts when the turn completes (200 MiB per file, 500 MiB per turn) and stay downloadable after the sandbox expires. Self-hosted files are not published this way ([files and artifacts](https://developers.openai.com/api/docs/guides/agents-api/environments/files)).
- **Tools:** function tools (your code runs them: the session enters `requires_action`, you post an `agent.session.input.tool_result`) ([functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions)); web search with `live` or `cached` mode and up to 100 allowed domains ([web search](https://developers.openai.com/api/docs/guides/agents-api/tools/web-search)); MCP servers reached from OpenAI, from the environment over HTTP, or started over stdio ([MCP connections](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp)); computer use in an OpenAI-hosted browser, where your application must approve every new website origin and handle sign-in ([computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use)); plugins, which are packages of skills and MCP configuration loaded from a directory or an uploaded ZIP ([plugins](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins)); and programmatic tool calling and tool search ([Agents overview](https://developers.openai.com/api/docs/guides/agents)).
- **Vaults:** credential stores attached with `vault_ids`. They hold bearer tokens or OAuth grants for MCP servers called from OpenAI, or secrets for a hosted sandbox, where code sees only a placeholder and a proxy inserts the real value for approved hosts. They do not supply credentials to self-hosted environments or function tools ([vaults](https://developers.openai.com/api/docs/guides/agents-api/tools/vaults)).
- **Multi-agent:** `agent.multi_agent.enabled: true` lets the agent start subagents with their own context; the default limit is 6 concurrent subagents; they share the environment and cannot use function tools ([multi-agent](https://developers.openai.com/api/docs/guides/agents-api/multi-agent)).
- **Automatic review:** `review: "auto_review"` has an OpenAI-managed reviewer model approve or deny risky shell commands, file changes, permission requests and MCP calls. It needs project-level access and its tokens are billed on top ([automatic review](https://developers.openai.com/api/docs/guides/agents-api/sessions/approvals)). With `review: "none"` those actions are not sent to your application for manual approval.
- **Scheduled automations:** a five-field cron expression with a time zone, or a one-time `run_at`, starts a new session or continues an existing one; the `automations` tool lets an agent schedule its own follow-ups. A completed delivery only means the session accepted the task ([scheduled automations](https://developers.openai.com/api/docs/guides/agents-api/sessions/automations)).
- **Webhooks:** `agent.session.created`, `.action_required`, `.in_progress`, `.idle`, `.failed`, plus `agent.environment.ready`/`.failed` for pre-warmed environments ([webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks), [pre-warm sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/prewarmed)).
- **Tracing and usage:** tracing is on by default; traces appear in the dashboard under Logs → Agents and can be exported as OTLP JSON from `GET /v1/agents/sessions/{id}/traces` if export is enabled for the organization ([tracing](https://developers.openai.com/api/docs/guides/agents-api/tracing)). Turn and session `usage` is best-effort, can be `null` and is not a bill ([observability](https://developers.openai.com/api/docs/guides/agents-api/observability)).
- **Errors:** request errors come as HTTP statuses (for example 409 for state conflicts, 424 `mcp_server_startup_failed`, 429 `files_api_rate_limit_exceeded`); turn failures are read from the turn, for example `context_length_exceeded` or `session_budget_exceeded` ([errors](https://developers.openai.com/api/docs/guides/agents-api/errors)). Not confirmed in the docs: numeric rate limits for the Agents API.
- **Billing:** model usage at the model's API rates, OpenAI tools at their standard rates, hosted sandboxes at container rates ([overview](https://developers.openai.com/api/docs/guides/agents-api/overview)): 1 GB $0.03, 4 GB $0.12, 16 GB $0.48, 64 GB $1.92 per 20-minute container session (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)). Since 2026-10-09 hosted sandbox compute is billed only during active turns ([changelog](https://developers.openai.com/api/docs/changelog)). An agent makes many model calls per task, so cost is the sum over all calls, including subagents ([observability](https://developers.openai.com/api/docs/guides/agents-api/observability)).
- **Data:** session state is retained until you delete it; `/v1/agents` is not eligible for Zero Data Retention, even with a self-hosted sandbox, and data residency is available only in the United States ([overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [data controls](https://developers.openai.com/api/docs/guides/your-data)).

#### Example uses
**Example 1: Data analysis on an uploaded file.** A web app lets a user upload a spreadsheet and ask a question. The backend creates a session with an OpenAI-hosted sandbox, passes the file, streams progress to the browser and downloads the chart the agent saved under `/workspace/outputs`.
**Nuances.** Pre-warm the sandbox while the user is still typing to cut waiting time; it is free until attached ([pre-warm sandboxes](https://developers.openai.com/api/docs/guides/agents-api/environments/prewarmed)).

**Example 2: Morning briefing on a schedule.** An automation with the cron expression `0 9 * * MON-FRI` starts a new session each working day. The agent reads a ticket system through an MCP server whose token sits in a vault, and a webhook on `agent.session.idle` tells the backend to fetch the summary and mail it.
**Nuances.** The API adds a small random delay to recurring runs, and your application sends the notification itself ([scheduled automations](https://developers.openai.com/api/docs/guides/agents-api/sessions/automations)).

**Example 3: Agent inside a private network.** A company runs the executor in its own container so the agent can reach an internal Git server and database, while OpenAI still runs the model loop.
**Nuances.** Model inference and session state still live at OpenAI, so this does not make the service ZDR-eligible ([overview](https://developers.openai.com/api/docs/guides/agents-api/overview)). For a single model call with a tool or two, the Responses API is simpler and cheaper to reason about.

### Bedrock Managed Agents

**Status:** No status label in the OpenAI docs; it is an AWS service ([Bedrock Managed Agents](https://developers.openai.com/api/docs/guides/agents-api/bedrock-managed-agents)).

#### What it does
An adaptation of the Agents API offered by AWS. The OpenAI agent harness and model inference run in Amazon Bedrock, and commands run in Amazon Bedrock AgentCore Runtime or self-hosted compute.

#### Integration
Called on an Amazon Bedrock service endpoint with AWS IAM credentials and SigV4 signing, not with an OpenAI API key ([Bedrock Managed Agents](https://developers.openai.com/api/docs/guides/agents-api/bedrock-managed-agents)).

#### Technical facts
- The page warns that shared concepts do not mean identical API contracts or features; models, tools, regions, limits and pricing come from AWS documentation ([Bedrock Managed Agents](https://developers.openai.com/api/docs/guides/agents-api/bedrock-managed-agents)).

#### Example uses
**Example 1: Agents for an AWS-only organisation.** A team whose procurement and data rules require AWS billing and IAM runs the same session-based agent pattern without an OpenAI account.

### Agent Builder

**Status:** Deprecated, notice 2026-06-03, shutdown 2026-11-30 ([deprecations](https://developers.openai.com/api/docs/deprecations)). That is nine days after this overview was written; do not start work on it.

#### What it does
A visual canvas in the platform dashboard for composing multi-step agent workflows from nodes (start, agent, file search, guardrails, MCP, if/else, while, human approval, transform, set state), with preview runs and versioned publishing ([Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder), [node reference](https://developers.openai.com/api/docs/guides/node-reference)). A published workflow had an ID that ChatKit could point at.

#### Integration
No public API of its own. Replacement: the Agents SDK or ChatGPT Workspace Agents ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### Technical facts
- **Migration:** in the Code dialog choose Agents SDK and copy the TypeScript or Python export; run it in your own application, or paste it into the ChatGPT workspace-agent builder (needs a Business, Enterprise or Edu workspace). The export does not convert the workflow graph and behaviour may differ, especially for strongly deterministic workflows ([migration guide](https://developers.openai.com/api/docs/guides/agent-builder/migrate-from-agent-builder)).
- **ChatKit dependency:** ChatKit chats backed by an Agent Builder workflow need to move to a self-hosted ChatKit server ([ChatKit](https://developers.openai.com/api/docs/guides/chatkit)).

#### Example uses
**Example 1: Rescuing an existing workflow.** A team with a published homework-helper workflow exports it as Python before the shutdown date and hosts it with the Agents SDK behind its existing ChatKit front end.

### AgentKit

**Status:** No current product page. The name survives in two places only: the pricing table has an "Agent Kit" row for ChatKit upload storage ([pricing](https://developers.openai.com/api/docs/pricing)), and a 2026-05-19 changelog entry lists AgentKit among products supported by Secure MCP Tunnel ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
An umbrella name for the agent tooling launched together with Agent Builder and ChatKit. No guide in the docs defines it or lists its parts today. Not confirmed in the docs: what AgentKit officially includes as of 2026-11-21.

#### Integration
None of its own; use the Agents SDK, the Agents API and ChatKit.

#### Technical facts
- The only price under this name is ChatKit file and image upload storage: $0.10 per GB-day with 1 GB free per account per month (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)).

#### Example uses
**Example 1: Reading old material.** When a 2025-2026 tutorial says "AgentKit", map it to the current products: Agent Builder (deprecated), ChatKit, and the Agents SDK.

### ChatKit

**Status:** Beta. The API reference lists it under the beta resources and calls use the header `OpenAI-Beta: chatkit_beta=v1` ([ChatKit sessions reference](https://developers.openai.com/api/reference/resources/beta/subresources/chatkit/subresources/sessions/methods/create)). It is not deprecated: the Agent Builder notice says ChatKit remains available ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
A ready-made chat interface you embed in a web page: message list, streaming answers, file attachments, display of tool activity, and interactive widgets inside the conversation ([ChatKit](https://developers.openai.com/api/docs/guides/chatkit)). It is the UI layer only; the agent behind it is either an existing Agent Builder workflow (ending 2026-11-30) or your own server.

#### Integration
- **Self-hosted (the path for new work):** you run a ChatKit server with the `chatkit-python` package, implement a `respond` method that streams events (helpers connect it to the Agents SDK), and supply your own stores for threads and files. The front end points its `apiURL` at your endpoint ([advanced integrations](https://developers.openai.com/api/docs/guides/custom-chatkit)).
- **OpenAI-hosted (legacy):** `POST /v1/chatkit/sessions` creates a session for a workflow ID and returns a short-lived client secret for the browser; `POST /v1/chatkit/sessions/{id}/cancel`; `GET /v1/chatkit/threads`, `GET /v1/chatkit/threads/{id}`, `GET .../items`, `DELETE /v1/chatkit/threads/{id}` ([ChatKit reference](https://developers.openai.com/api/reference/resources/beta/subresources/chatkit)).
- **Libraries:** `@openai/chatkit-react` plus a script from OpenAI's CDN ([chatkit-js](https://github.com/openai/chatkit-js)) and the Python server package ([chatkit-python](https://github.com/openai/chatkit-python)), both Apache-2.0.

#### Technical facts
- **Session defaults (hosted):** expiry 10 minutes, maximum 600 seconds; 10 requests per minute per session; uploads off by default, with defaults of 10 files and 512 MB per file when enabled. A unique `user` value per end user is required ([ChatKit sessions reference](https://developers.openai.com/api/reference/resources/beta/subresources/chatkit/subresources/sessions/methods/create), [ChatKit](https://developers.openai.com/api/docs/guides/chatkit)).
- **Widgets:** containers (`Card`, `ListView`) holding components such as badges, buttons, forms and text, defined as JSON and designed in a Widget Builder ([widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)).
- **Actions:** a widget control can trigger server or client code without a user message; form values arrive in the payload. Treat payloads as untrusted input, and expect only basic native form validation ([actions](https://developers.openai.com/api/docs/guides/chatkit-actions)).
- **Theming and options:** light or dark theme, header, start screen prompts, composer and attachments are configurable ([advanced integrations](https://developers.openai.com/api/docs/guides/custom-chatkit), [theming](https://developers.openai.com/api/docs/guides/chatkit-themes)).
- **Billing:** upload storage $0.10 per GB-day, 1 GB free (read 2026-11-21, [pricing](https://developers.openai.com/api/docs/pricing)); model calls at normal rates.
- **Data:** `/v1/chatkit/threads` content is kept until deleted and is not ZDR-eligible ([data controls](https://developers.openai.com/api/docs/guides/your-data)). With a self-hosted server the threads live in your own store.
- **Maintenance signal:** the latest releases are `@openai/chatkit-react` 1.6.1 from 2026-07-31 and `chatkit-python` v1.6.5 from 2026-05-19, with no commits since ([chatkit-js](https://github.com/openai/chatkit-js), [chatkit-python](https://github.com/openai/chatkit-python)).

#### Example uses
**Example 1: Help chat in a customer portal.** A SaaS product embeds ChatKit; its own FastAPI server runs an Agents SDK agent, stores threads in its database and returns an order-status card widget with a "cancel order" button handled as a server action.
**Nuances.** The server side is documented for Python only. If you only need a plain text chat, a hand-built UI on the Responses API avoids a beta dependency.

### Workspace Agents API

**Status:** No status label for triggering; run-status polling is marked beta (header `OpenAI-Beta: workspace_agent_runs=v1`) ([trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)).

#### What it does
Lets a backend start a published ChatGPT workspace agent (an agent built and shared inside a ChatGPT Business, Enterprise or Edu workspace) without anyone opening ChatGPT. It is a separate, small API on a different host from the OpenAI API ([trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)).

#### Integration
`POST https://api.chatgpt.com/v1/workspace_agents/{id}/trigger` with `input` and an optional `conversation_key`; the event is queued and the response is `202 Accepted` with a link to the ChatGPT conversation. `GET https://api.chatgpt.com/v1/workspace_agents/{id}/runs/{run_id}` polls status ([trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)). No official SDK is mentioned.

#### Technical facts
- **Authentication:** a Workspace Agent access token created in ChatGPT under Admin > Access tokens, after an admin allows personal access tokens. A platform API key does not work here ([authentication](https://developers.openai.com/workspace-agents/authentication)).
- **Main limitation:** the agent's response cannot be retrieved through the API; you get a conversation link and, in beta, a status (`queued`, `in_progress`, `suspended`, `completed`, `failed`) ([trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)).
- **Retries:** an optional `Idempotency-Key` header prevents duplicate trigger events ([trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)).
- Not confirmed in the docs: pricing and rate limits.

#### Example uses
**Example 1: Complaint intake.** When a complaint form is submitted, the backend triggers a workspace agent that drafts a case summary in ChatGPT for the team, using the customer ID as `conversation_key` so later events land in the same conversation.
**Nuances.** Because output stays in ChatGPT, this fits human-in-ChatGPT workflows. For a result your code consumes, use the Agents API.

### GPTs and GPT Actions (ChatGPT product)

**Status:** No status label in the docs; the GPT release notes page was last updated on 2024-05-13 ([GPT release notes](https://developers.openai.com/api/docs/gpts/release-notes)).

#### What it does
A GPT is a customised version of ChatGPT with its own instructions, knowledge files and connections. A GPT Action lets that GPT call an external REST API described by an OpenAPI schema ([GPT Actions](https://developers.openai.com/api/docs/actions/introduction)). Neither is an API service in the narrow sense: they are configured in ChatGPT and you cannot call a GPT from the OpenAI API.

#### Integration
You expose an HTTPS API and an OpenAPI specification; ChatGPT calls you. Authentication is none, API key or OAuth ([production notes](https://developers.openai.com/api/docs/actions/production)).

#### Technical facts
- 45-second timeout per call; payloads under 100,000 characters; text only; no custom headers; TLS 1.2+ on port 443; `x-openai-isConsequential` forces user confirmation ([production notes](https://developers.openai.com/api/docs/actions/production)).

#### Example uses
**Example 1: Internal lookup inside ChatGPT.** Staff ask a company GPT about stock levels and an action queries the warehouse API.

### Plugins for ChatGPT and Codex (formerly Apps SDK)

**Status:** No status label found. The former Apps SDK address redirects to the plugins docs ([plugins](https://developers.openai.com/plugins)).

#### What it does
A plugin is a package people install in ChatGPT and Codex from a shared directory. It can contain skills (reusable instructions), an MCP server that exposes tools, optional UI shown in ChatGPT, and lifecycle hooks ([plugin architecture](https://developers.openai.com/plugins/concepts/plugins)). This is not the 2023 "ChatGPT plugins" product. It is a distribution channel into ChatGPT, not an API service you call.

#### Integration
You build and host a remote MCP server, package it, and submit it to the directory ([plugins index](https://developers.openai.com/plugins/llms.txt), [building MCP servers](https://developers.openai.com/api/docs/mcp)). The same plugin format can be loaded into Agents API sessions ([Agents API plugins](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins)).

#### Technical facts
- Public listing requires review against the plugin guidelines ([plugins index](https://developers.openai.com/plugins/llms.txt)).

#### Example uses
**Example 1: Your product inside ChatGPT.** A booking service publishes a plugin so ChatGPT users can search availability and reserve through its MCP tools.

### Codex (API-adjacent)

**Status:** A separate product with its own docs ([Codex docs index](https://developers.openai.com/codex/llms.txt)). The only Codex-specific API model still listed, `gpt-5.3-codex`, is deprecated with shutdown on 2027-04-01 and replacement `gpt-6-sol` ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
OpenAI's coding agent: a CLI, IDE extension, desktop surface and cloud tasks. It matters here because the Agents API runs the same harness, and the self-hosted executor is the Codex CLI ([Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview)).

#### Integration
Programmatic routes are the Codex SDK (TypeScript, Node.js 18+, controls local Codex threads), `codex exec` for scripts and CI, a GitHub Action, and the open-source app-server protocol for custom clients ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [app server](https://learn.chatgpt.com/docs/app-server)). `codex exec` accepts an API key through `CODEX_API_KEY` ([non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).

#### Technical facts
- **Models:** `gpt-5.3-codex` has a 400,000-token context window and costs $1.75 input / $14 output per 1M tokens (read 2026-11-21, [model page](https://developers.openai.com/api/docs/models/gpt-5.3-codex)). `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini` and `gpt-5.2-codex` were shut down on 2026-07-23, and `codex-mini-latest` on 2026-02-12 ([deprecations](https://developers.openai.com/api/docs/deprecations)). New work uses the general GPT-6 family.
- **Plans:** Codex is included in ChatGPT plans ([Codex docs index](https://developers.openai.com/codex/llms.txt)).

#### Example uses
**Example 1: Automated code review in CI.** A pipeline runs `codex exec` in a read-only sandbox on each pull request and posts the final message as a comment.

## Model optimization, evaluation and safety services

Read this part with the calendar in hand. As of 2026-11-21 most of what used to be the "optimization" area of the platform is being closed: the hosted Evals platform (with datasets, graders for evals and the dataset-backed prompt optimizer) is read-only and shuts down on 2026-11-30, and self-serve fine-tuning is closed to new customers and stops accepting new training jobs on 2027-01-06 ([deprecations](https://developers.openai.com/api/docs/deprecations)). The safety area moved the other way: several new services appeared in 2026 (safety enforcement webhooks, misalignment monitoring, a CSAM image classifier).

### Evals API and dashboard (hosted evaluations)

**Status:** Deprecated, currently read-only, shutdown 2026-11-30. The [deprecations page](https://developers.openai.com/api/docs/deprecations) lists "Evals dashboard, API, and graders for eval workflows" with status "Read-only", shutdown date Nov 30, 2026 and notice date Jun 3, 2026. The guides add the intermediate step: Evals became read-only for existing users on October 31, 2026 ([Working with evals](https://developers.openai.com/api/docs/guides/evals)).

#### What it does
An "eval" is a repeatable test of model output: a schema for test rows, one or more graders (automatic checks) and runs that generate a model answer for each row and score it. OpenAI hosted this as a dashboard plus an API ([Working with evals](https://developers.openai.com/api/docs/guides/evals)). OpenAI now recommends Promptfoo, an open-source command-line tool and library that the docs describe as "part of OpenAI", for the same job ([Get started with Promptfoo](https://developers.openai.com/api/docs/guides/promptfoo-codex), [migration cookbook](https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo)).

#### Integration
- Endpoints still in the reference: `POST /v1/evals`, `GET /v1/evals`, `GET /v1/evals/{eval_id}`, `POST /v1/evals/{eval_id}` (update), `DELETE /v1/evals/{eval_id}`; runs under `/v1/evals/{eval_id}/runs` (create, list, retrieve, cancel, delete) and `GET .../runs/{run_id}/output_items` ([Evals reference](https://developers.openai.com/api/reference/resources/evals)).
- Call style: asynchronous. A run is queued, then polled, or you subscribe to the webhook events `eval.run.succeeded`, `eval.run.failed`, `eval.run.canceled` ([Working with evals](https://developers.openai.com/api/docs/guides/evals)).
- SDKs: the guide shows `client.evals` calls in the official TypeScript, Python, Java and Ruby SDKs and curl ([Working with evals](https://developers.openai.com/api/docs/guides/evals)).
- Replacement: Promptfoo runs locally or in CI from a `promptfooconfig.yaml` file; it needs Node.js 22.22.0 or newer (a pip wrapper exists and also needs Node) ([Get started with Promptfoo](https://developers.openai.com/api/docs/guides/promptfoo-codex)).

#### Technical facts
- What "read-only" covers exactly is not spelled out. The guides say only that "existing evals content remains available during the transition window" and that Evals "will become read-only for existing users on October 31, 2026" ([Working with evals](https://developers.openai.com/api/docs/guides/evals)). Not confirmed in the docs: which endpoints now reject calls (creating evals, creating runs), and the reference pages still document the write endpoints without any notice ([Evals reference](https://developers.openai.com/api/reference/resources/evals)).
- What happens on 2026-11-30: the platform "is scheduled to shut down" ([Working with evals](https://developers.openai.com/api/docs/guides/evals)). Not confirmed in the docs: whether stored evals and run results are deleted or exportable afterwards. The migration cookbook describes recreating each evaluation by hand and states it "does not require an OpenAI Evals export feature" ([migration cookbook](https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo)).
- The guides link to an anchor `#2026-06-03-evals-platform` on the deprecations page, but the page (as fetched) has no detailed section under it, only the table row ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- Data sources an eval could use: uploaded JSONL files, stored logs filtered by metadata (`logs`; the older `stored_completions` type is marked deprecated in favor of it), and Responses data ([Evals reference](https://developers.openai.com/api/reference/resources/evals)).
- Retention: `/v1/evals` data is not used for training, abuse-monitoring logs are kept 30 days, application state is kept until deleted, and the endpoint is not eligible for Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Billing: not confirmed in the docs. The [pricing page](https://developers.openai.com/api/docs/pricing) has no line for evals or graders; the Promptfoo guide notes that evals which call a model incur normal API charges ([Get started with Promptfoo](https://developers.openai.com/api/docs/guides/promptfoo-codex)).
- Promptfoo migration pitfalls: similarity scores may not match numerically between the two systems, and any recreated grader, especially a model-as-judge one, should be validated before it is trusted for regression decisions ([migration cookbook](https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo)).
- The conceptual guide on how to design evals stays useful regardless of tooling, although it carries the same deprecation banner ([Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)).

#### Example uses
**Example 1: Regression check before switching models.** A team classifies support tickets into three categories and wants to move to a newer model. They keep 200 labelled tickets, run both models over them and compare the share of exact label matches. Today this is set up in Promptfoo (prompt, two providers, one assertion per test case) and run in CI.
**Nuances.** Starting this on the hosted Evals API makes no sense now: it is read-only and disappears on 2026-11-30 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

**Example 2: Saving existing eval definitions before the shutdown.** A team that already has evals in the dashboard reads each eval's test criteria and data through the `GET` endpoints and rewrites them as Promptfoo assertions.
**Nuances.** There is no documented export; the cookbook's path is manual recreation ([migration cookbook](https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo)).

### Datasets (dashboard evaluation workspace)

**Status:** Deprecated together with the Evals platform: read-only since 2026-10-31, shutdown 2026-11-30 ([Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)). Released Oct 6, 2025 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Datasets is a dashboard tool for quick prompt testing: you upload a CSV or type rows, attach a prompt, generate outputs, annotate them (Good/Bad, free-text critique, custom columns) and add graders ([Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)).

#### Integration
Dashboard only. The docs describe no dataset endpoint; they point to the Evals API for programmatic work ([Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)).

#### Technical facts
- Graders available in the dashboard: string check, text similarity, score model, label model, Python code ([Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)).
- Datasets work with saved dashboard prompts, and those reusable prompt objects (`/v1/prompts`) are deprecated with the same shutdown date, 2026-11-30 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### Example uses
No model use is worth starting: with nine days left and the tool read-only, the realistic action is to copy out any rows and annotations you still need.

### Evaluating external (non-OpenAI) models

**Status:** Part of the Evals platform, same fate: read-only since 2026-10-31, shutdown 2026-11-30 ([Evaluate external models](https://developers.openai.com/api/docs/guides/external-models)). Released Oct 6, 2025 as "Third-Party Model Support" ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
It let the hosted Evals tools run the same test against models from other providers: third-party models served through OpenRouter (Google, Anthropic on AWS Bedrock, Together, Fireworks) without your own key, or any custom endpoint compatible with Chat Completions with your key ([Evaluate external models](https://developers.openai.com/api/docs/guides/external-models)).

#### Integration
Configured in the dashboard by an organization admin; no separate endpoint ([Evaluate external models](https://developers.openai.com/api/docs/guides/external-models)).

#### Technical facts
- Third-party models required usage tier "Build" or higher; OpenAI covered inference up to a monthly cap per tier ($25 Build, $100 Launch, $200 Grow, read 2026-11-21) ([Evaluate external models](https://developers.openai.com/api/docs/guides/external-models)).
- Tool calls were not supported, and data sent this way goes to third parties under different terms ([Evaluate external models](https://developers.openai.com/api/docs/guides/external-models)).

#### Example uses
**Example 1: Comparing providers on one test set.** This is now a Promptfoo job: its starter example compares models from different providers on the same test cases ([Get started with Promptfoo](https://developers.openai.com/api/docs/guides/promptfoo-codex)).

### Graders

**Status:** Deprecated. The guide says OpenAI "is deprecating graders as part of the evals and fine-tuning workflows they support" ([Graders](https://developers.openai.com/api/docs/guides/graders)). Graders for eval workflows shut down with Evals on 2026-11-30; for graders used in fine-tuning the deprecations page points to the fine-tuning timeline, which ends job creation on 2027-01-06 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
A grader is a JSON-defined scoring rule that compares a model answer with a reference and returns a grade from 0 to 1. It was the building block of evals (as "testing criteria") and of reinforcement fine-tuning (as the reward) ([Graders](https://developers.openai.com/api/docs/guides/graders)).

#### Integration
- Standalone endpoints: `POST /v1/fine_tuning/alpha/graders/run` (run a grader on a sample) and `POST /v1/fine_tuning/alpha/graders/validate` (check a definition); synchronous ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning)). The path contains `alpha`; the docs give no other status label.
- Inside evals, graders are passed as `testing_criteria` when creating an eval ([Working with evals](https://developers.openai.com/api/docs/guides/evals)).
- SDKs: grader types are present in the official SDKs (the Ruby 1.0 migration guide mentions `MultiGrader`) ([Ruby SDK migration](https://developers.openai.com/api/docs/guides/ruby-sdk-migration)).

#### Technical facts
- Types in the guide: string check (`eq`, `neq`, `like`, `ilike`), text similarity (`fuzzy_match`, `bleu`, `gleu`, `meteor`, `cosine`, `rouge-*`), score model (a model returns a number), Python code ([Graders](https://developers.openai.com/api/docs/guides/graders)). The reference additionally defines a label model grader (a model picks a label) and a multi grader (combines several graders with a formula) ([Graders reference](https://developers.openai.com/api/reference/resources/graders)).
- Templates refer to `{{ item.* }}` (a test row) and `{{ sample.* }}` (the model output: `output_text`, `output_json`, `output_tools`, `choices`, `output_audio`) ([Graders](https://developers.openai.com/api/docs/guides/graders)).
- Model graders accept only a fixed list of older models: `gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`, `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14`, `o1-2024-12-17`, `o3-mini-2025-01-31`, `o3-2025-04-16`, `o4-mini-2025-04-16` ([Graders](https://developers.openai.com/api/docs/guides/graders)). Pitfall: several of these (`gpt-4.1-nano`, `o1`, `o3-mini`, `o4-mini`) were shut down on 2026-10-23, `o3` shuts down 2026-12-11 and the rest on 2027-01-14 ([deprecations](https://developers.openai.com/api/docs/deprecations)). The grader guide was not updated to say so.
- Python graders: code under 256 kB, no network, 2 minutes per execution, 2 GB memory, 1 GB disk, 2 CPU cores ([Graders](https://developers.openai.com/api/docs/guides/graders)).
- The `cosine` similarity operation uses `text-embedding-3-large` and is available only in evals ([Graders](https://developers.openai.com/api/docs/guides/graders)).
- Not confirmed in the docs: whether the two `alpha/graders` endpoints stay callable after 2026-11-30 or after 2027-01-06, and how grader runs are billed.

#### Example uses
**Example 1: Checking a model-as-judge prompt against human grades.** Before trusting an automatic judge, a team takes answers that experts already scored and runs the score-model grader on them to see whether the judge ranks them the same way ([Graders](https://developers.openai.com/api/docs/guides/graders)).
**Nuances.** With the service being closed, the same check belongs in Promptfoo assertions today ([migration cookbook](https://developers.openai.com/cookbook/examples/evaluation/moving-from-openai-evals-to-promptfoo)).

### Trace grading and agent evals

**Status:** No status label and no deprecation banner on the two pages ([Trace grading](https://developers.openai.com/api/docs/guides/trace-grading), [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)). Released Oct 6, 2025 as "Trace Evals" ([changelog](https://developers.openai.com/api/docs/changelog)). It depends on the Evals dashboard and graders, which shut down on 2026-11-30 ([deprecations](https://developers.openai.com/api/docs/deprecations)). Not confirmed in the docs: whether trace grading survives that date.

#### What it does
A trace is the full record of one agent run: model calls, tool calls, guardrails and handoffs between agents. Trace grading attaches scores or labels to traces so you can find where an agent chose the wrong tool or broke an instruction; "trace evals" run those graders over many traces ([Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)).

#### Integration
Dashboard workflow: Logs > Traces, pick a trace, create a grader, then "Grade all" opens the evaluation dashboard ([Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)). Traces come from applications built with the Agents SDK, and from Agent Builder workflows during its transition window ([Trace grading](https://developers.openai.com/api/docs/guides/trace-grading)). The docs describe no dedicated API endpoint for trace grading.

#### Technical facts
- The second step of the workflow lands in the Evals dashboard, so it inherits the read-only state and the shutdown ([Trace grading](https://developers.openai.com/api/docs/guides/trace-grading), [deprecations](https://developers.openai.com/api/docs/deprecations)).
- Agent Builder, one of the two trace sources, is itself deprecated with shutdown 2026-11-30 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### Example uses
**Example 1: Finding why an agent fails.** A developer inspects traces of a multi-step agent to see whether a handoff happened when it should have. Viewing traces is the part that does not depend on Evals; scoring them at scale did.
**Nuances.** For repeatable agent tests going forward the docs' only named tool is Promptfoo, which is described as evaluating "AI applications and agents" ([Get started with Promptfoo](https://developers.openai.com/api/docs/guides/promptfoo-codex)).

### Prompt optimizer

**Status:** Deprecated. The dataset-backed prompt optimizer is closed "as part of the Evals platform": read-only since 2026-10-31, shutdown 2026-11-30 ([Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)). Released Oct 6, 2025 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
A dashboard chat tool that rewrites a prompt. Paired with a dataset, it used your annotations, critiques and grader results to produce an improved prompt in a new tab ([Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)).

#### Integration
Dashboard only; the docs describe no endpoint ([Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)).

#### Technical facts
- Needed at least three rows with responses, each with at least one grader result or human annotation ([Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)).
- The optimized prompt can do worse than the original on specific inputs, so manual review was required ([Prompt optimizer](https://developers.openai.com/api/docs/guides/prompt-optimizer)).
- Not confirmed in the docs: whether the plain chat form of the optimizer (without a dataset) remains after 2026-11-30; the banner names only the "dataset-backed" one.

#### Example uses
No model use is worth starting now: the tool depends on datasets, which are read-only.

### Prompt generation (Playground "Generate" button)

**Status:** No status label in the docs; no deprecation notice on the page ([Prompt generation](https://developers.openai.com/api/docs/guides/prompt-generation)).

#### What it does
The Generate button in the Playground drafts a prompt, a function definition or a JSON schema from a short task description. The guide publishes the "meta-prompts" and "meta-schemas" OpenAI uses for that, so you can reproduce the technique with an ordinary model call ([Prompt generation](https://developers.openai.com/api/docs/guides/prompt-generation)).

#### Integration
A dashboard feature, not an API service. To automate it you send the published meta-prompt as instructions in a normal text-generation request (see "Responses API").

#### Technical facts
- Separate meta-prompts exist for text and audio outputs and for editing an existing prompt ([Prompt generation](https://developers.openai.com/api/docs/guides/prompt-generation)).
- Schema generation cannot itself use strict Structured Outputs, so the output is cleaned and validated afterwards ([Prompt generation](https://developers.openai.com/api/docs/guides/prompt-generation)).

#### Example uses
**Example 1: First draft of a system prompt.** A developer describes a task in one sentence and lets the Playground produce a structured prompt to edit by hand.

### Fine-tuning (overall)

**Status:** Restricted access, being wound down. The deprecations page lists "Self-serve fine-tuning job creation" with status "Restricted access" and date Jan 6, 2027 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

#### What it does
Fine-tuning trains a private copy of an OpenAI base model on your examples, producing a model ID that starts with `ft:` and is called like any other model ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)). The documented methods today are supervised, vision and direct preference optimization ([Model optimization](https://developers.openai.com/api/docs/guides/model-optimization)).

#### Integration
- Jobs: `POST /v1/fine_tuning/jobs`, `GET /v1/fine_tuning/jobs`, `GET /v1/fine_tuning/jobs/{id}`, `GET .../events`, `GET .../checkpoints`, `POST .../cancel`, `POST .../pause`, `POST .../resume` ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning)).
- Checkpoint permissions (sharing a fine-tuned model with other projects of the same organization): `POST`, `GET` and `DELETE` on `/v1/fine_tuning/checkpoints/{fine_tuned_model_checkpoint}/permissions`; these need an admin API key ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning)).
- Call style: asynchronous job, polled or followed through webhook events `fine_tuning.job.succeeded`, `fine_tuning.job.failed`, `fine_tuning.job.cancelled` ([Webhooks reference](https://developers.openai.com/api/reference/resources/webhooks)). Training data is a JSONL file uploaded with purpose `fine-tune` ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- SDKs: `client.fine_tuning.jobs` in the official SDKs ([Fine-tuning best practices](https://developers.openai.com/api/docs/guides/fine-tuning-best-practices)); a dashboard UI also exists ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).

#### Technical facts
- Timeline ([deprecations](https://developers.openai.com/api/docs/deprecations)):
  - May 7, 2026: organizations that never ran fine-tuning can no longer create jobs.
  - July 2, 2026: job creation also closed to organizations that have not run inference on a fine-tuned model in the past 60 days.
  - Jan 6, 2027: active existing customers can no longer create new jobs.
- Inference on existing fine-tuned models continues until the base model is shut down; fine-tuned versions follow the base model's schedule ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- That schedule is short. `gpt-4.1-nano-2025-04-14` and its fine-tunes were shut down on 2026-10-23; `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4o-2024-08-06` and `gpt-4o-mini-2024-07-18` shut down on 2027-01-14, replacement `gpt-6-luna` ([deprecations](https://developers.openai.com/api/docs/deprecations)). So every fine-tunable model named in the guides stops working eight days after job creation ends. No newer fine-tunable base model is named in the docs.
- Prices: the [pricing page](https://developers.openai.com/api/docs/pricing) has a "Fine-tuning" heading with the closing notice, but the page as read on 2026-11-21 contains no price rows under it. Not confirmed in the docs: current training and inference prices.
- Retention: `/v1/fine_tuning/jobs` data is not used to train OpenAI models, application state is kept until deleted, not eligible for Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Checkpoints: one per training epoch, only the last three are kept, each usable as a model ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- Safety gate: a finished model is tested in 13 safety categories and blocked from deployment if it fails; results appear as `moderation_checks` events ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- The job reference still accepts `babbage-002` and `davinci-002` as model values although new training on them ended Oct 28, 2024 ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning), [deprecations](https://developers.openai.com/api/docs/deprecations)).

#### Example uses
**Example 1: Keeping an existing fine-tuned classifier alive.** A company with an `ft:gpt-4.1-mini` model keeps calling it, but must plan a move to a current base model with a longer prompt or few-shot examples before 2027-01-14.
**Nuances.** A new project cannot use fine-tuning at all: job creation has been closed to organizations without prior fine-tuning since May 7, 2026 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

### Supervised fine-tuning (SFT)

**Status:** Restricted to eligible existing customers until 2027-01-06 "unless the base model shuts down earlier" ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).

#### What it does
You supply example conversations with the correct assistant answer, and the model learns to reproduce that style or format. The docs name classification, nuanced translation, fixed output formats and fixing instruction-following failures as the best fits ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).

#### Integration
`POST /v1/fine_tuning/jobs` with `model`, `training_file`, and `method` of type `supervised` (the default) ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).

#### Technical facts
- Models: `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14` (the nano model is already shut down) ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- Data: JSONL in chat-completions format, minimum 10 examples; the docs suggest starting with 50 and report typical gains at 50-100 ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- Examples may contain function calls and structured JSON outputs ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)).
- Hyperparameters `n_epochs`, `batch_size`, `learning_rate_multiplier` default to `auto`; `suffix` (up to 64 characters) names the model; a Weights & Biases integration exists ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning)).

#### Example uses
**Example 1: Fixed-format extraction.** An existing customer trains `gpt-4.1-mini` on a few hundred input-output pairs so it emits one strict JSON shape with a short prompt.
**Nuances.** The result is usable only until 2027-01-14, when the base model shuts down ([deprecations](https://developers.openai.com/api/docs/deprecations)).

### Vision fine-tuning

**Status:** Same wind-down as fine-tuning overall; the page says existing users can train "for the coming months" ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).

#### What it does
Supervised fine-tuning where the training examples contain images, to improve image classification or instruction following on visual inputs ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).

#### Integration
Same job endpoint; images go inside the JSONL messages as URLs or base64 data URLs ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).

#### Technical facts
- Model: `gpt-4o-2024-08-06` only ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)), which shuts down 2027-01-14 ([deprecations](https://developers.openai.com/api/docs/deprecations)).
- Limits: up to 50,000 examples with images, 10 images per example, 10 MB per image; JPEG, PNG or WEBP in RGB/RGBA ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).
- Images with people, faces, children or CAPTCHAs are dropped from the training set ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).
- Setting image `detail` to `low` cuts each image to 85 tokens and lowers training cost ([Vision fine-tuning](https://developers.openai.com/api/docs/guides/vision-fine-tuning)).

#### Example uses
**Example 1: Sorting product photos by defect type.** An existing customer trains on labelled photos of parts.
**Nuances.** Unusable for anything showing people, and the model has under two months of life left.

### Direct preference optimization (DPO)

**Status:** Same wind-down: eligible existing customers until 2027-01-06 ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)). Launched Dec 17, 2024; extended to the GPT-4.1 models Jun 4, 2025 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Instead of one correct answer, each example gives a prompt with a preferred and a non-preferred answer, so the model learns subjective preferences such as tone or what a summary should focus on ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).

#### Integration
Same job endpoint with `method.type` set to `dpo` ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).

#### Technical facts
- Models: `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14` ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).
- Text only, and only one-turn conversations are trained ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).
- Extra hyperparameter `beta` (0 to 2, default `auto`): higher keeps the model closer to its previous behavior ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).
- The docs recommend running SFT on the preferred answers first, then DPO on the resulting model ([Direct preference optimization](https://developers.openai.com/api/docs/guides/direct-preference-optimization)).

#### Example uses
**Example 1: Teaching a house style from A/B choices.** An editor picks the better of two drafts for many prompts; the pairs become DPO training data.

### Reinforcement fine-tuning (RFT)

**Status:** No longer a documented workflow; effectively ended. Launched May 7, 2025 ([changelog](https://developers.openai.com/api/docs/changelog)). There is no guide page for it in the docs index, and the list of "fine-tuning methods supported in the OpenAI platform today" names only SFT, vision and DPO ([Model optimization](https://developers.openai.com/api/docs/guides/model-optimization)).

- The API reference still defines `method.type: "reinforcement"` on the job object, but its only request example is titled "Reinforcement (historical)" and uses `o4-mini` ([Fine-tuning reference](https://developers.openai.com/api/reference/resources/fine_tuning)).
- `o4-mini-2025-04-16` and the fine-tuned variant `ft-o4-mini-2025-04-16` were shut down on 2026-10-23 ([deprecations](https://developers.openai.com/api/docs/deprecations)), so models trained this way no longer run.
- Not confirmed in the docs: an explicit shutdown notice or date for the RFT method itself, or any replacement. RFT relied on graders as the reward signal; those are deprecated too ([Graders](https://developers.openai.com/api/docs/guides/graders)).

### Model distillation and stored completions

**Status:** Distillation is no longer a product, only a technique described in one paragraph; no status label. Stored Chat Completions endpoints remain in the reference with no deprecation notice.

#### What it does
Distillation means using a large model's answers as training data for a smaller, cheaper model. It was launched on Oct 1, 2024 as a platform feature ([changelog](https://developers.openai.com/api/docs/changelog)). Today there is no distillation guide in the docs index; what remains is a section of the SFT guide describing the manual flow: tune a prompt on a large model, capture its outputs, build a dataset, fine-tune a small model ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning#distilling-from-a-larger-model)). "Stored completions" are Chat Completions saved on OpenAI's side by sending `store: true`.

#### Integration
- `store` parameter on `POST /v1/chat/completions` (default `false`); the reference still describes it as storage "for use in our model distillation or evals products" ([Chat reference](https://developers.openai.com/api/reference/resources/chat)).
- Management endpoints: `GET /v1/chat/completions` (list, filter by `metadata` and `model`), `GET /v1/chat/completions/{completion_id}`, `POST /v1/chat/completions/{completion_id}` (only `metadata` can be changed), `DELETE /v1/chat/completions/{completion_id}`, `GET /v1/chat/completions/{completion_id}/messages`; synchronous ([Chat reference](https://developers.openai.com/api/reference/resources/chat)).

#### Technical facts
- Both consumers of stored completions are closing: Evals on 2026-11-30 and fine-tuning job creation on 2027-01-06 ([deprecations](https://developers.openai.com/api/docs/deprecations)). The endpoints then remain a plain log of your own requests.
- Image inputs over 8 MB are dropped from stored completions ([Chat reference](https://developers.openai.com/api/reference/resources/chat)).
- The distillation paragraph now points to the Responses API, which stores responses for 30 days by default, as the capture mechanism ([Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning#distilling-from-a-larger-model)).
- With Zero Data Retention, `store` is always treated as `false` ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- Separately, the API strips reasoning items when you switch model family or organization, described as a safeguard "against distillation" of OpenAI's own models ([Reasoning](https://developers.openai.com/api/docs/guides/reasoning)).

#### Example uses
**Example 1: Building a labelled set from production traffic.** An application tags each stored completion with `metadata` such as a prompt version, later lists them by that tag and exports good ones as test cases for its own evaluation tool.
**Nuances.** Using them to train a smaller OpenAI model is open only to existing fine-tuning customers and only until 2027-01-06 ([deprecations](https://developers.openai.com/api/docs/deprecations)).

### Safety classifiers and safety identifiers

**Status:** No status label in the docs. Always-on platform behavior, not an opt-in service ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).

#### What it does
OpenAI classifies requests by risk level in the background. If an organization repeatedly hits high-risk thresholds, it gets errors and a warning email, and after a stated period (usually seven days) loses model access. Sending a `safety_identifier` (a stable, hashed ID of your end user) lets OpenAI block one user instead of the whole organization ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).

#### Integration
- `safety_identifier` parameter on the Responses, Chat Completions and Images APIs; the Realtime API takes the same value in the `OpenAI-Safety-Identifier` header ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).
- A Safety dashboard in the platform shows blocked Responses requests per safety identifier (released Jun 23, 2026) ([changelog](https://developers.openai.com/api/docs/changelog)).

#### Technical facts
- The page describes the process in terms of "requests to GPT-5" and says criteria may change with new model releases; current restrictions concern risky biology or chemistry activity ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)). Not confirmed in the docs: the exact list of models covered today.
- Identifiers are recommended, not required; they do not carry over between APIs or sessions, and for Images must be 128 characters or fewer ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).
- Consequences: streaming may be delayed while extra checks run (no tokens appear until the check passes), or an identifier is blocked and gets an `identifier blocked` error; OpenAI cannot currently unblock an individual identifier ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).
- Do not put personal data in the identifier; hash an email or internal ID, or use a session ID for anonymous users ([Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)).
- A special access program exists for life-science research that needs fewer restrictions ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).

#### Example uses
**Example 1: Public chat product with many anonymous users.** The app sends a hashed account ID with every request, so one abusive user gets blocked without cutting off everyone else, and shows a spinner in case streaming starts late.
**Nuances.** A blocked user who can open a new account defeats the mechanism; the docs ask you to prevent that ([Safety classifiers](https://developers.openai.com/api/docs/guides/safety-checks)).

### Cybersecurity checks

**Status:** No status label; the page says the systems "are still being calibrated" ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).

#### What it does
Extra automated safeguards on API models that OpenAI rates High or Critical for cybersecurity risk (GPT-5.6 Cyber is High, GPT-6 Cyber is Critical). They watch for suspicious security activity and can temporarily cut access while it is reviewed ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).

#### Integration
Nothing to call. Affected requests fail with error code `cyber_policy`, possibly in the middle of a stream. Access to the specialist models goes through a reviewed program ("Trusted Access for Cyber", Daybreak) covered elsewhere ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).

#### Technical facts
- Without per-user safety identifiers the whole organization can lose access; with them, only the affected user (after human review and warnings) ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).
- Organizations with Zero Data Retention additionally get request-level blocking ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).
- Legitimate defensive work may be flagged; appeals go through support, the limit otherwise lasts 7 days ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).
- GPT-6 Cyber needs a configured project and IP allowlist before the first request ([Cybersecurity checks](https://developers.openai.com/api/docs/guides/safety-checks/cybersecurity)).

#### Example uses
**Example 1: Security tooling vendor.** A company running authorized penetration tests handles `cyber_policy` errors explicitly and reviews each proposed tool call against the approved scope before executing it.

### Misalignment monitoring and project safety alerts

**Status:** No status label. Announced Sep 3, 2026 with GPT-6 Astra ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
An asynchronous check on agent work: it reviews the model's reasoning and actions to see whether the agent is correctly interpreting the user's instructions in consequential situations (moving or reading sensitive data, destructive changes). It can raise an alert or stop the conversation ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).

#### Integration
- Automatic on covered models in the Responses API; Chat Completions is not covered ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).
- A blocked request returns HTTP 403, type `invalid_request_error`, code `misalignment_policy_violation` ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).
- Project-level webhook `safety.alert.created`, then `GET /v1/safety/alerts/{id}` with a key holding the `api.safety.alerts.read` permission ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring), [Safety reference](https://developers.openai.com/api/reference/resources/safety)).

#### Technical facts
- Automatic stopping works only for Responses requests that use persisted reasoning, WebSocket mode or OpenAI compaction; other Responses requests are monitored and can raise alerts but are not stopped ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).
- A stop does not undo actions already taken, and there is no general way to resume a stopped conversation; do not retry automatically ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).
- Alert categories: unintended data transfer, unintended data access, unintended destructive activity, other; `reason` can be null, including for Zero Data Retention requests ([Safety reference](https://developers.openai.com/api/reference/resources/safety)).
- A flag means "needs review", not that anyone broke a policy; false positives and misses both happen ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).
- The webhook reference also lists `safety.org_alert.created` for enterprise workspaces ([Webhooks reference](https://developers.openai.com/api/reference/resources/webhooks)). Not confirmed in the docs: which exact models are "covered by this system".

#### Example uses
**Example 1: Agent with write access to company systems.** An operations agent can delete records. The application catches `misalignment_policy_violation`, halts the task, and a webhook handler opens a ticket with the request and response IDs so a person can review what was already changed.
**Nuances.** It supplements, not replaces, your own approval step before destructive actions ([Misalignment monitoring](https://developers.openai.com/api/docs/guides/safety-checks/misalignment-monitoring)).

### Safety enforcement notifications (Safety Case Read API)

**Status:** No status label in the docs ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).

#### What it does
When OpenAI issues a warning or a deactivation for one of your safety identifiers, it can notify your systems by webhook, and you can fetch the case details to route it to your support or trust-and-safety process ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).

#### Integration
- Organization-level webhook events `safety.warning_issued` and `safety.deactivation_issued` ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).
- `GET /v1/safety/cases/{id}` returns the safety identifier (`entity_identifier`), notice type, creation time and available policy reason; needs a restricted key with Safety set to Read (`api.safety.read`) ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement), [Safety reference](https://developers.openai.com/api/reference/resources/safety)).

#### Technical facts
- Read-only: retrieving a case does not change or reverse the enforcement ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).
- Use `data.id` from the event as the case ID, not the event's own `id` (a common cause of 404) ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).
- These organization-level notices are separate from the project-level misalignment alerts ([Safety enforcement notifications](https://developers.openai.com/api/docs/guides/safety-enforcement)).

#### Example uses
**Example 1: Automatic suspension of an abusive account.** On `safety.deactivation_issued` the handler looks up the case, maps the identifier back to a user in its own database and suspends the account with a note for support.

### CSAM image classifier

**Status:** Limited access (approved organizations only), free; no GA/beta label. Announced Nov 16, 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
A dedicated image classifier that helps human reviewers prioritize images that may contain child sexual abuse material (CSAM), with a separate signal for AI-generated material ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).

#### Integration
`POST /v1/moderations` with model `omni-moderation-csam-latest`; synchronous ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)). The general Moderation endpoint is described under "Moderation".

#### Technical facts
- Exactly one still image per request, up to 20 MB, as a URL or base64 data URL; no text input ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).
- Categories `likely-csam` and `likely-csam/gen-ai`; scores are not calibrated probabilities ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).
- Not available through the Batch API or inline moderation; a flag does not report anything to authorities ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).
- The general model `omni-moderation-latest` applies its `sexual/minors` category to text only ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).
- Independently of this classifier, images and files sent to the main APIs are scanned for CSAM on upload and retained for review if flagged, even under Zero Data Retention ([Your data](https://developers.openai.com/api/docs/guides/your-data)).
- A companion page gives non-technical guidance on preventing, detecting and reporting such content ([CSAM guidance](https://developers.openai.com/api/docs/guides/csam-guidance)).

#### Example uses
**Example 1: Review queue on an image-hosting service.** An approved platform scores uploaded images and puts flagged ones at the top of a trained reviewer's queue.
**Nuances.** Access requires approval, and the docs say not to submit known CSAM ([CSAM classifier](https://developers.openai.com/api/docs/guides/csam-classifier)).

### Under-18 guidance, safety best practices, Private Safety Processing

**Status:** Policy and guidance pages, not API services.

- **Under-18 guidance.** Rules for applications serving minors: comply with child-protection law (COPPA is named), do not process personal data of children under 13 (or the local age of digital consent) without Zero Data Retention, add age-appropriate filters, monitoring and disclosures. OpenAI may audit and suspend access ([Under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)).
- **Safety best practices.** A checklist: use the free Moderation API, adversarial testing, a human in the loop, constrained inputs and output length, user reporting, safety identifiers, revoking leaked keys ([Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)).
- **Private Safety Processing (in passing).** An arrangement for Zero Data Retention customers under which automated safety review still runs without OpenAI retaining prompts or responses; it requires customer-controlled storage and extra operational duties ([ZDR with Private Safety Processing](https://developers.openai.com/api/docs/guides/private-safety-processing), [Your data](https://developers.openai.com/api/docs/guides/your-data)).

### Red teaming

**Status:** Not an API service. Two offerings: the open-source Promptfoo tool, and "OpenAI Red Teaming", a managed offering for enterprise customers; no status label ([Red teaming](https://developers.openai.com/api/docs/guides/red-teaming)).

#### What it does
Red teaming means attacking your own AI application with adversarial inputs to find unsafe, insecure or policy-breaking behavior before release. It complements evals: evals check that the system does what is intended, red teaming checks how it behaves under abuse ([Red teaming](https://developers.openai.com/api/docs/guides/red-teaming)).

#### Integration
No endpoint. Promptfoo is run locally from the command line; the enterprise offering is arranged with OpenAI ([Red teaming](https://developers.openai.com/api/docs/guides/red-teaming)). Not confirmed in the docs: price, scope and access procedure of the enterprise offering.

#### Technical facts
- Promptfoo generates adversarial test cases and inspects the target's behavior ([Red teaming](https://developers.openai.com/api/docs/guides/red-teaming)).
- Only assets you own or are expressly authorized to test may be submitted to OpenAI Red Teaming; third-party or open-source code needs OpenAI's written permission ([Red teaming](https://developers.openai.com/api/docs/guides/red-teaming)).

#### Example uses
**Example 1: Pre-launch probe of a customer-facing assistant.** Before release a team runs Promptfoo's red-team mode against its assistant to look for prompt-injection and data-leak paths, then fixes prompts and tool permissions.

## Administration and platform services

### Administration API

**Status:** No status label in the docs. Launched as "Admin and Audit Log APIs" on Aug 1, 2024; supported in the official SDKs since May 4, 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
The Administration API lets a program do what an organization owner does in the dashboard: manage users, invitations, groups, roles, projects, service accounts and API keys, set rate limits and spend controls, restrict models and tools per project, read audit logs, and query usage and costs ([Admin APIs guide](https://developers.openai.com/api/docs/guides/admin-apis)). It is meant for back-office automation and security tooling, not for model requests.

#### Integration
Synchronous REST calls under `https://api.openai.com/v1/organization/...` (a few role-assignment routes sit under `/v1/projects/{project_id}/...`), authenticated with an Admin API key ([Administration reference](https://developers.openai.com/api/reference/resources/admin)). Lists are paginated with `after`/`before` cursors. SDK support starts at Node 6.36.0, Python 2.34.0, Go 3.34.0, Ruby 0.61.0 and Java 4.34.0, under `client.admin.organization...`; the key is read from `OPENAI_ADMIN_KEY` ([Admin APIs guide](https://developers.openai.com/api/docs/guides/admin-apis)). The .NET SDK is not in that list.

Main resource groups, all from the [Administration reference](https://developers.openai.com/api/reference/resources/admin):

| Resource | Endpoints (prefix `/v1`) |
| --- | --- |
| Admin API keys | `POST`, `GET /organization/admin_api_keys`; `GET`, `DELETE .../{key_id}` |
| Users and invites | `GET /organization/users`, `GET`/`POST`/`DELETE .../{user_id}`; `POST`, `GET /organization/invites`, `GET`/`DELETE .../{invite_id}` |
| Groups and roles | `/organization/groups` (+ `/users`, `/roles`), `/organization/roles`, `/organization/users/{user_id}/roles`, `/projects/{project_id}/roles` |
| Projects | `POST`, `GET /organization/projects`; `GET`/`POST .../{project_id}`; `POST .../{project_id}/archive` |
| Project members and identities | `.../{project_id}/users`, `.../groups`, `.../service_accounts` (+ `POST .../service_accounts/{id}/api_keys`), `.../api_keys` |
| Project controls | `.../{project_id}/rate_limits`, `.../model_permissions`, `.../hosted_tool_permissions`, `.../service_tier_settings`, `.../data_retention` |
| Spend | `/organization/spend_limit`, `/organization/spend_alerts`, and the same two under a project |
| Audit logs | `GET /organization/audit_logs` |
| Usage and costs | `GET /organization/usage/{completions, embeddings, images, moderations, audio_speeches, audio_transcriptions, vector_stores, code_interpreter_sessions, file_search_calls, web_search_calls, decisions}`; `GET /organization/costs` |
| Security | `/organization/certificates` (mutual TLS), `/organization/workload_identity_providers` (+ `/federation_rules`), `/organization/external_keys`, `/organization/external_storage`, `/organization/data_retention` |

#### Technical facts
- An Admin API key works only on administration endpoints; a project key does not work on them ([Administration overview](https://developers.openai.com/api/reference/administration/overview)).
- An admin key can be created with `expires_in_seconds` up to 31,536,000 (one year) ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).
- The API cannot create a user-owned project key for another person; programmatic key creation goes through a service account ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).
- A service account created with `create_service_account_only` has no roles and no key, so it cannot call models until roles are assigned ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).
- Projects are archived, not deleted; an archived project cannot be used or updated ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).
- Rate limits per project and model are updated, not created: fields include `max_requests_per_1_minute`, `max_tokens_per_1_minute`, `max_images_per_1_minute` and `batch_1_day_max_input_tokens` ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).
- Model permissions take `mode: allow_list` or `deny_list` plus model IDs; spend amounts are given in cents (`threshold_amount: 10000` is $100) ([Admin APIs guide](https://developers.openai.com/api/docs/guides/admin-apis)).
- Usage endpoints return time buckets of `1m`, `1h` or `1d` and can group by project, user, API key, model, batch, service tier and API source. Costs supports only `1d` buckets, at most 180 per call, grouped by project, user, line item, API key or API source ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).
- Audit logging must first be enabled in organization settings ([changelog](https://developers.openai.com/api/docs/changelog), entry of Aug 1, 2024). Not confirmed in the docs: how long audit log entries are kept.
- Billing: the docs list no charge for the Administration API itself. Not confirmed in the docs: its own rate limits.

#### Example uses
**Example 1: One project per customer.** A software company resells an AI feature and wants each customer's usage isolated. Its provisioning service, holding the Admin key, creates a project, creates a service account in it, issues a scoped key with an expiration, and stores the key in a secret manager. The customer's workload then calls models with that project key only.
**Nuances.** The Admin key must stay in the trusted provisioning service; organization and project key-governance policies still apply to keys created this way ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).

**Example 2: Daily cost report.** A finance script calls `GET /v1/organization/costs` once a day grouped by `project_id` and `line_item`, and `GET /v1/organization/usage/completions` grouped by `model`, then writes the numbers into the company's accounting sheet.
**Nuances.** Costs come only in daily buckets, so this is reporting, not real-time control; to stop spending use a hard spend limit ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)).

**Example 3: Security review.** A security team pulls `GET /v1/organization/audit_logs` filtered by time range and actor into its log system to see who created keys or changed roles.
**Nuances.** Works only after audit logging has been switched on.

### Models endpoint

**Status:** No status label in the docs; part of the core `v1` API ([Models reference](https://developers.openai.com/api/reference/resources/models)).

#### What it does
Lists the models the calling credential can use and returns basic facts about one model. It also deletes a fine-tuned model you own. Since each model object carries an optional `shutdown_date`, it doubles as the programmatic source of retirement dates ([deprecations](https://developers.openai.com/api/docs/deprecations#best-practices)).

#### Integration
Synchronous REST: `GET /v1/models`, `GET /v1/models/{model}`, `DELETE /v1/models/{model}`. Available in the official SDKs and the CLI. A standard API key is enough for the two read calls ([Models reference](https://developers.openai.com/api/reference/resources/models)).

#### Technical facts
- A model object has `id`, `created`, `object`, `owned_by` and optional `shutdown_date`; it does not return context window, prices or capabilities, which are only on the documentation model pages ([Models reference](https://developers.openai.com/api/reference/resources/models)).
- Deleting requires the Owner role in the organization and applies to fine-tuned models ([Models reference](https://developers.openai.com/api/reference/resources/models)).
- The list depends on the credential: a model visible in the dashboard can be missing for a given key because of project model permissions or data-retention settings ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits#model-availability)).
- Reading the list needs the "List models: Read" permission, which every preset role includes ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- Not confirmed in the docs: a charge or a specific rate limit for these calls.

#### Example uses
**Example 1: Retirement alarm.** A weekly job lists models, compares the IDs the application uses with their `shutdown_date`, and opens a ticket when a date appears within the next 90 days.
**Nuances.** `shutdown_date` is optional and `null` until a retirement is announced; OpenAI also notifies affected customers by email ([deprecations](https://developers.openai.com/api/docs/deprecations)).

**Example 2: Diagnosing `model_not_found`.** When a request fails, a support script calls `GET /v1/models` with the same key and the same `OpenAI-Organization` and `OpenAI-Project` headers to check whether the model is visible to that exact credential.

### Workload identity federation

**Status:** Released May 26, 2026; no beta label on the OpenAI API path. The X.509 certificate variant became generally available on Aug 29, 2026. The Codex variant is in beta ([changelog](https://developers.openai.com/api/docs/changelog), [workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation)).

#### What it does
A workload that already has an identity from its platform (a cloud role, a Kubernetes service account, a CI job) presents that identity's short-lived token to OpenAI and receives a short-lived OpenAI access token in return. No long-lived OpenAI API key has to be stored or rotated. An administrator decides in advance which external identities map to which project service account ([workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation)).

#### Integration
Token exchange is a synchronous `POST https://auth.openai.com/oauth/token` with `grant_type` `urn:ietf:params:oauth:grant-type:token-exchange`, the external JWT as `subject_token`, plus `identity_provider_id` and `service_account_id`. The X.509 variant posts to `https://mtls.auth.openai.com/oauth/token` and takes the identity from the TLS client certificate. The returned token is used as a normal bearer token; official SDKs can perform the exchange themselves ([token exchange reference](https://developers.openai.com/api/reference/workload-identity-federation)). Providers and mappings are configured in the dashboard or through `/v1/organization/workload_identity_providers` ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).

#### Technical facts
- Setup guides exist for AWS, Microsoft Azure, Google Cloud, Oracle Cloud, Kubernetes, GitHub Actions, SPIFFE, Idira and X.509 certificates; other OIDC providers need contact with OpenAI support ([workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation)).
- Access tokens expire after at most one hour and never outlive the external token or certificate; no refresh token is returned, so the workload repeats the exchange ([token exchange reference](https://developers.openai.com/api/reference/workload-identity-federation)).
- The external JWT must carry `iss`, `aud`, `sub`, `exp`, `iat` and a `kid` header, and match the configured issuer and audience ([token exchange reference](https://developers.openai.com/api/reference/workload-identity-federation)).
- Mapping conditions and derived attributes are written in Common Expression Language (CEL) ([workload identity federation](https://developers.openai.com/api/docs/guides/workload-identity-federation)).
- The token gets the permissions of the mapped service account; a `scope` value in the request does not grant access. The exchange never creates accounts or projects ([token exchange reference](https://developers.openai.com/api/reference/workload-identity-federation)).
- The X.509 variant relies on the organization's mutual TLS configuration, and later API calls must also present an accepted client certificate ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls)).
- Not confirmed in the docs: any charge for the feature.

#### Example uses
**Example 1: CI pipeline without a stored secret.** A GitHub Actions workflow that runs model-based checks on pull requests requests an OIDC token from GitHub, exchanges it for an OpenAI token mapped to a service account with only the "Model capabilities: Request" permission, and runs the checks.
**Nuances.** The mapping should pin the repository and branch claims, otherwise any workflow of the same issuer could obtain the token.

**Example 2: Service on a cloud platform.** A backend running in a managed Kubernetes cluster uses its projected service account token to obtain OpenAI access, so nothing needs rotating when staff leave.
**Nuances.** For a single small application with one server, a service-account API key with an expiration date is simpler to operate ([API keys and service accounts](https://developers.openai.com/api/docs/guides/api-keys)).

### Mutual TLS (mTLS)

**Status:** Generally available since Aug 29, 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Mutual TLS makes the API check a client certificate in addition to the normal bearer credential. After a trust anchor (your certificate authority's certificate) is activated for an organization or a project, requests in that scope must present a client certificate that chains to it ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls)).

#### Integration
Requests go to a dedicated host instead of `api.openai.com`: `mtls.api.openai.com`, `mtls-us.api.openai.com` or `mtls-eu.api.openai.com`, with the same `/v1` routes. Certificates are managed in the dashboard or through `POST`/`GET /v1/organization/certificates`, `.../activate`, `.../deactivate` and the project-level equivalents ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls)).

#### Technical facts
- Available to any API organization; managed with the `api.mtls.read` and `api.mtls.write` permissions ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls)).
- Uploading a certificate changes nothing; activation is what starts enforcement ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls)).
- Up to 50 certificate objects per organization ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls#current-limitations)).
- It does not replace the API key: there is no certificate-only authorization ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls#current-limitations)).
- OpenAI performs no revocation checks (CRL or OCSP) and does not fetch missing intermediate certificates ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls#current-limitations)).
- Only the three hosts above exist; other regional hosts have no mTLS counterpart. Not compatible with Private Link ([mutual TLS](https://developers.openai.com/api/docs/guides/mutual-tls#current-limitations)).

#### Example uses
**Example 1: Stolen key is not enough.** A company with an internal certificate authority wants a leaked API key to be useless outside its servers. It activates its root for the production project; every server presents its own client certificate.
**Nuances.** Because revocation is not checked, short-lived client certificates are the practical way to limit a compromised one. An IP allowlist gives a similar second factor with far less setup when egress addresses are fixed.

### IP allowlist

**Status:** No status label in the docs. Released Oct 1, 2025; multiple allowlists per organization and per project since May 19, 2026 ([changelog](https://developers.openai.com/api/docs/changelog)).

#### What it does
Restricts API requests to IP addresses or CIDR ranges you list. Requests from other addresses are rejected even with a valid key. It applies to API requests only, not to dashboard sign-in ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).

#### Integration
Configured in the dashboard under Settings > Security > IP allowlist; there is nothing to change in the calling code ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)). Not confirmed in the docs: an Administration API endpoint for allowlists (none appears in the reference).

#### Technical facts
- Up to 50 addresses or ranges per allowlist ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).
- A project allowlist replaces the organization allowlist for that project; the two do not combine ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).
- Changes take up to 15 minutes ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).
- Blocked requests get HTTP `401` with code `ip_not_authorized` ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).
- Managing it needs the organization owner role's IP allowlist permission ([permissions guide](https://developers.openai.com/api/docs/guides/rbac)).
- Not compatible with Private Link ([IP allowlist](https://developers.openai.com/api/docs/guides/ip-allowlist)).
- The opposite direction, calls that OpenAI products make to your services, is covered by the published [IP egress ranges](https://developers.openai.com/api/docs/guides/ip-addresses).

#### Example uses
**Example 1: Lock production to its servers.** An application runs behind one NAT gateway with a fixed public address. The team adds that address to an allowlist for the production project only, so developers' keys in other projects keep working from anywhere.
**Nuances.** Serverless platforms and many hosting providers have changing egress addresses; without a fixed address the allowlist will block your own traffic.

### Private Link

**Status:** No status label in the docs; not self-service, access is arranged through an OpenAI contact or sales ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).

#### What it does
Lets workloads running in Microsoft Azure reach regional OpenAI API endpoints over Azure Private Link, so traffic stays on Azure private networking instead of the public internet ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).

#### Integration
You create an Azure Private Endpoint per region, map a regional host name in private DNS, and send normal authenticated API requests to that host. Current host names: `southcentralus.privatelink.api.openai.com`, `westus.privatelink.api.openai.com`, `eastus2.privatelink.api.openai.com` and `spaincentral.privatelink.api.openai.com` (EU). Health check: `GET /v2/privatelink_healthcheck` ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).

#### Technical facts
- Azure only; the guide describes no AWS or Google Cloud equivalent ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).
- Not compatible with IP allowlist or mutual TLS ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).
- Failover between regions is your responsibility; traffic is not moved automatically from one regional host name to another ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).
- Health check traffic should stay at or below 1 request per second per regional endpoint ([Private Link](https://developers.openai.com/api/docs/guides/private-link)).
- Not confirmed in the docs: price and eligibility criteria.

#### Example uses
**Example 1: Regulated network.** A bank whose policy forbids outbound internet access from application subnets in Azure requests access, creates private endpoints in two regions and configures its client to fail over between the two regional host names.
**Nuances.** The docs themselves say the public endpoints are simpler if there is no private-network requirement.

### Asymmetric keys (external keys)

**Status:** No status label in the docs ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).

#### What it does
Registers with OpenAI the public half of an RSA-3072 key pair whose private half stays in your own cloud key service. The guide covers one purpose: decrypting records produced by Private Safety Processing (the Zero Data Retention option with automated safety review). Registering a key by itself configures no feature ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).

#### Integration
Synchronous Administration API calls with an Admin key that has external-key access: `POST`, `GET /v1/organization/external_keys`, `GET`/`DELETE .../{external_key_id}`, `POST .../{external_key_id}/validate` ([Administration reference](https://developers.openai.com/api/reference/resources/admin)). The related `/v1/organization/external_storage` endpoints register customer-managed storage in AWS, Azure, Google Cloud or Oracle Cloud ([Administration reference](https://developers.openai.com/api/reference/resources/admin)).

#### Technical facts
- Supported key stores: AWS KMS, Azure Key Vault, Google Cloud KMS and Oracle Cloud Infrastructure Vault ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).
- OpenAI is granted only public-key and metadata read access, never use of the private key ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).
- Azure standalone Managed HSM endpoints are not supported ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).
- Old key versions must be kept while records encrypted with them are still needed ([asymmetric keys](https://developers.openai.com/api/docs/guides/asymmetric-keys)).
- This is distinct from Enterprise Key Management, which encrypts application state with your keys ([data controls](https://developers.openai.com/api/docs/guides/your-data#enterprise-key-management-ekm)).

#### Example uses
**Example 1: Zero retention with safety review.** A healthcare software vendor approved for Zero Data Retention with Private Safety Processing creates an RSA-3072 key in its cloud key service, registers the public key, and configures its own storage bucket; only the vendor can decrypt flagged records.
**Nuances.** Relevant only to organizations approved for these enterprise data controls; a small project has no use for it.

### API organization blocking

**Status:** No status label in the docs ([API organization blocking](https://developers.openai.com/api/docs/guides/organization-blocking)).

#### What it does
Lets a company's network restrict which OpenAI API organizations people can reach from it. The company's proxy adds a header listing allowed organization IDs, and OpenAI rejects access to any other organization ([API organization blocking](https://developers.openai.com/api/docs/guides/organization-blocking)).

#### Integration
No API call of its own: a proxy or Secure Access Service Edge service injects the `OpenAI-Allowed-Organization-Ids` header (comma-separated IDs, no spaces) into requests to `https://api.openai.com/*` ([API organization blocking](https://developers.openai.com/api/docs/guides/organization-blocking)).

#### Technical facts
- Access to an organization not on the list returns `403`; a malformed header makes all requests carrying it fail with `400` ([API organization blocking](https://developers.openai.com/api/docs/guides/organization-blocking)).
- It needs a proxy that can modify HTTPS requests, which means TLS interception on the company network.

#### Example uses
**Example 1: No personal accounts from the office.** An enterprise wants staff to use only the corporate API organization, so company data is not sent through personal accounts with different retention settings. Its proxy adds the header with the corporate organization ID.

### Terraform provider

**Status:** Released Jul 29, 2026; provider version 1.0.0 or later. Webhook resources in the provider are marked beta in the repository README ([changelog](https://developers.openai.com/api/docs/changelog), [Terraform provider guide](https://developers.openai.com/api/docs/guides/terraform), [provider repository](https://github.com/openai/terraform-provider-openai)).

#### What it does
The official provider manages OpenAI organization resources as infrastructure as code: you describe projects, access and limits in Terraform files, review a plan, and apply it. It can also import resources created by hand and detect drift between the files and the real configuration ([Terraform provider guide](https://developers.openai.com/api/docs/guides/terraform)).

#### Integration
The provider is installed from the Terraform Registry and calls the Administration API with an Admin key read from `OPENAI_ADMIN_KEY`. Requires Terraform 1.0 or later; import blocks require 1.5 or later ([Terraform provider guide](https://developers.openai.com/api/docs/guides/terraform)).

#### Technical facts
- Resources shown in the guides include `openai_project`, `openai_project_role`, `openai_role`, `openai_group`, `openai_group_user`, `openai_project_group_role`, `openai_project_service_account`, `openai_project_rate_limit`, `openai_project_spend_alert`, `openai_organization_spend_alert`, `openai_project_model_permissions`, `openai_project_hosted_tool_permissions` and `openai_project_data_retention` ([projects and access](https://developers.openai.com/api/docs/guides/terraform/projects-and-access), [rate limits and spend](https://developers.openai.com/api/docs/guides/terraform/rate-limits-and-spend), [project controls](https://developers.openai.com/api/docs/guides/terraform/project-controls)).
- Destroying an `openai_project` archives the project, and an archived project cannot be restored ([projects and access](https://developers.openai.com/api/docs/guides/terraform/projects-and-access)).
- Service-account API keys are not managed by Terraform; they are created through the Administration API so the secret does not land in Terraform state ([service accounts](https://developers.openai.com/api/docs/guides/terraform/service-accounts)).
- Rate-limit records are created by OpenAI; Terraform only updates them ([rate limits and spend](https://developers.openai.com/api/docs/guides/terraform/rate-limits-and-spend)).
- The guides show spend alerts, not hard spend limits. Not confirmed in the docs: a Terraform resource for hard spend limits.

#### Example uses
**Example 1: Identical staging and production.** A team keeps one Terraform module that creates a project, a least-privilege role, a group and a monthly spend alert, and applies it twice with different names. Changes to access go through code review.
**Nuances.** For a single project with one developer, the dashboard is quicker; the provider pays off when several projects must stay consistent.

**Example 2: Adopting an existing setup.** An organization that configured everything by hand writes matching resource blocks, imports them, and confirms that the next plan shows no changes before making the first managed edit ([import and reconcile](https://developers.openai.com/api/docs/guides/terraform/import-and-reconcile)).

### OpenAI CLI

**Status:** No status label in the docs. Not confirmed in the docs: the release date ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).

#### What it does
A command-line tool named `openai` that calls the API from a terminal: text generation, structured extraction to JSON, image and speech generation, file uploads and Administration API tasks. It is generated from the API definition, so commands mirror API resources (for example `openai responses create`) ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).

#### Integration
Installed with Homebrew (`brew install openai/tools/openai`) or with Go (`go install github.com/openai/openai-cli/cmd/openai@latest`). It reads `OPENAI_API_KEY`, uses `OPENAI_ADMIN_KEY` for administration endpoints, and `OPENAI_BASE_URL` to target another compatible host ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).

#### Technical facts
- Global flags: `--format` (`json`, `jsonl`, `yaml`, `pretty`, `raw` and others), `--transform` (a GJSON path to extract part of the response) and `--debug` ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).
- `openai explore` browses commands without an API key ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).
- Request bodies can be passed as flags or as a YAML document on standard input; prompts containing `:` or `{}` may be parsed as YAML when given as flags ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).
- Older versions of the Python SDK installed a legacy `openai` command that can shadow the new one ([OpenAI CLI guide](https://developers.openai.com/api/docs/libraries/openai-cli)).
- Calls are billed like any other API request made with the same key.

#### Example uses
**Example 1: Batch extraction in a shell script.** A script loops over a folder of text files, sends each to `openai responses create` with a JSON schema, and appends one JSON line per record to a file for later processing with `jq`.
**Nuances.** For thousands of files the Batch API is cheaper; the CLI loop is for small, repeatable jobs.

**Example 2: Quick administration.** An owner creates a project and a service-account key from the terminal with the admin key instead of clicking through the dashboard.

## What could not be confirmed

This section collects the facts that the sources did not settle, the contradictions between official pages, and the pages that had to be read in an unusual way. Each point is also marked at its place in the text.

### Availability of the sources

- Every page that was requested opened; no official page was unavailable. The documentation index requested at `platform.openai.com/llms.txt` redirects to `developers.openai.com`, where all documentation pages were read; a direct request to `platform.openai.com/docs/overview` redirected to the site root instead of a documentation page. Pages were read through their Markdown versions (the page URL with `.md` appended).
- The reference pages for administration listed in the reference index are near-empty stubs; the endpoint list was taken from the combined page [reference/resources/admin](https://developers.openai.com/api/reference/resources/admin). The reference index also omits the [Agents API](https://developers.openai.com/api/reference/resources/beta/subresources/agents), [safety](https://developers.openai.com/api/reference/resources/safety), the GPT-Live REST endpoints and the retired [videos](https://developers.openai.com/api/reference/resources/videos) reference; the first, second and fourth were opened directly, and GPT-Live endpoint facts come from its guides.
- Interactive widgets do not appear in the Markdown versions: the image cost calculator (so no per-image price is quoted for the `gpt-image-2.5` and `2.6` models) and the check marks of the Responses versus Chat Completions capability table.
- The pricing page has a "Fine-tuning" heading with the closing notice but no price rows.
- Read only in part: the Codex docs and the plugins (former Apps SDK) docs, the Agents API reference beyond its endpoint list, the provider pages of the Agents API, the computer-use driver reference, and the prompting guides. The Terraform Registry and the language-specific Agents SDK documentation sites were not consulted because they are outside the agreed sources.
- Changelog entries carry a month and a day; for some entries the year was inferred from the page's headings and order.

### Status labels

Most services carry no GA, beta or preview label in the docs. Explicit labels were found only for: Decisions API (GA), GPT-Live (GA), Realtime API (GA), mutual TLS and X.509 workload identity (GA), prompt cache diagnostics (GA), Agents API (public beta), multi-agent in Responses (beta), discounted background windows (public beta), Flex (beta, being wound down), ChatKit (beta, inferred from its reference path and header), OpenAI on Google Cloud (private preview), and the deprecated or shut-down services. The official SDKs carry no label on the libraries page.

### Facts not found

- **Billing:** terms of monthly invoicing; whether token counting is free; how a compaction pass is billed; any fee per computer-use call (model pages mention one, the tools price table lists none); storage price for plain Files API objects and for skills; price of Secure MCP Tunnel, Private Link, Reserved Tier and Scale Tier; current fine-tuning prices; hosted price for the `gpt-oss` models; how grader runs were billed.
- **Limits:** a hard maximum number of tools per request; maximum items in a conversation; vector stores per file search tool and files per vector store; maximum GPT-Live session length outside SIP; rate limits of the Administration API, the Agents API and the Workspace Agents API; audit log retention.
- **Models:** the models that support plain background mode, compaction, Programmatic Tool Calling, the Agents API, the safety classifiers and misalignment monitoring; whether the `gpt-image-2.6` models work in the image generation tool of the Responses API; whether dated snapshots exist for GPT-6 models; languages supported by realtime translation.
- **Fate after a shutdown date:** what "read-only" means for the Evals endpoints and what happens to stored evals and datasets after 2026-11-30; whether trace grading, the non-dataset prompt optimizer and the grader endpoints under `/v1/fine_tuning/alpha/graders` survive; whether `/v1/audio/speech` itself is removed when its models shut down on 2027-01-06, and how verbatim reading or file output works on the realtime replacement; which current model offers speaker diarization, timestamps or subtitle formats after 2027-02-26; any successor to fine-tuning after the last fine-tunable base models shut down on 2027-01-14; an explicit end date for reinforcement fine-tuning and for Flex.
- **Other:** a public REST endpoint for managing webhook endpoints or the IP allowlist; a reference page for the Skills endpoints; what "AgentKit" formally includes today; Ultrafast on Chat Completions; a token-counting endpoint for Chat Completions.

### Contradictions between official pages

- **Chat Completions `store` default:** `false` in the [reference](https://developers.openai.com/api/reference/resources/chat), "stored by default for new accounts" in the [migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses).
- **Ultrafast models:** the Responses reference says access-controlled and `gpt-5.6-sol`; the [guide](https://developers.openai.com/api/docs/guides/ultrafast-mode) and the pricing page list `gpt-6.2-astra`, `gpt-6.2-sol`, `gpt-6-astra` and `gpt-6.1-sol`.
- **Replacement for `computer-use-preview`:** `gpt-5.6-terra` on the deprecations page, `gpt-6.1-sol` in the [integration recipes](https://developers.openai.com/api/docs/guides/tools-computer-use-integration).
- **Tool availability tables:** the "Usage notes" tables in several tool guides still list Chat Completions and the shut-down Assistants API, against the text of the same guides.
- **File sizes:** up to 512 MB in the Files reference, up to 8 GB in the Uploads reference, with no statement of where larger files are accepted.
- **File search ranker name:** `default-2024-08-21` in the retrieval guide, `default-2024-11-15` in the Responses reference.
- **Batch and video:** a changelog entry announces Batch support for `POST /v1/videos`; the batch guide does not list it, and the Videos API is shut down.
- **Agents API status:** "public beta" in the changelog and guides, while the configuration guide mentions "beta and GA API contracts".
- **Promotional price end date for GPT-5.6 Sol:** November 21, 2026 in the Fast mode guide, November 30, 2026 on the pricing page.
- **Stale pages:** the graders guide and the predicted outputs guide still list models shut down on 2026-10-23; the Structured Outputs guide still names the Assistants API; the image guide's overview names the `2.5` image models while a later section recommends `2.6`; the CLI needs Go 1.25 per the docs and Go 1.26 per its README; two SDK READMEs still call mutual TLS a beta program.

## Conclusion

What follows from this overview for anyone planning work on the OpenAI API as of 2026-11-21:

- **Build on the Responses API and a GPT-6 model.** Everything new (tools, reasoning controls, WebSocket mode, background mode, compaction, prompt-cache controls) is documented there. Chat Completions is kept for compatibility.
- **Check the shutdown date of every model and feature before relying on it.** Deprecation is fast: generally available models get at least six months' notice, specialised and image models three, preview models as little as two weeks. `GET /v1/models` returns a `shutdown_date` that can be monitored in code.
- **Treat three areas as closed for new work:** hosted evals (the docs point to the open-source Promptfoo tool), fine-tuning (closed to organizations without prior use, and no fine-tunable base model is listed beyond 2027-01-14), and video generation (no replacement).
- **Cost and speed are now chosen per request.** Besides the model, the levers are the service tier (Standard, Fast, Ultrafast), the Batch API and background completion windows for work that can wait, and prompt caching, which on GPT-5.6 and later has a write price and explicit controls.
- **Voice has two current interfaces.** The docs recommend GPT-Live for new conversational voice applications and keep the Realtime API for cases that need its session and tool model; the older file-based text-to-speech and several transcription models are on a shutdown schedule.
- **Agent tooling is split three ways:** the hosted Agents API (public beta), the open-source Agents SDK, and a hand-built loop on the Responses API. Agent Builder is not an option.

Because most of these facts carry a date, re-read the linked page before any decision that depends on a model name, a price, a limit or a status.
