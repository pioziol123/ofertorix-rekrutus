## What this proposes

The document proposes refactoring the application into six modules with explicit public operations: Offer sources, Offers, Professional profile, Matching, Companies and AI, while keeping the application's current behaviour. Seven tasks about Sources separate the connector contract and registry, run execution, metadata saving, ad saving, data reads, and deciding unavailability after a complete fetch. The other tasks tidy Offers, hand orchestration of profile proposals to the AI module, introduce a public Profile read, remove the remaining workarounds of module boundaries and move code into the target directories. Modules are to protect their own rules, and operations that span several modules are to keep a shared transaction; grouping ads into one offer is the responsibility of the Offers module, but implementing that function is not a requirement of this refactoring.

## How the existing system works, per this document

It is a private application with a single owner that fetches ads, stores the professional profile, assesses matches and prepares company research. Nuxt provides the interface and HTTP API, the worker processes pg-boss jobs and the schedule, PostgreSQL stores data and queues, and a shared volume stores original CVs; the Himalayas pilot imports data directly from the CLI. After CV text extraction the application can prepare a profile proposal through OpenAI or a configured Ollama, and the owner separately applies chosen changes and confirms the profile. Matching currently uses OpenAI Batch, research uses OpenAI Responses and web search, and local execution of these two functions remains a described plan. The code is scattered across technical directories, and some modules and routes read other modules' tables directly, use internal data representations or take over other modules' responsibilities.

**C1 — Major — `.2`, `.5`, input lines 456–473, 554–556.** The relation between the source identifier stored on a run and the connector name used by ConnectorProvider is not explained. Define whether they are identical or mapped, and who owns that mapping.

**C2 — Nit — module map and `.8`, input lines 358–367, 672–676, 690–693.** The module map describes grouping advertisements as present functionality; task .8 identifies it as future work. Mark that responsibility as planned.

Reviewer `/root/comprehension` read the comprehension persona and all 934 input lines only. No supplemental context, code, history, edits or tests.
