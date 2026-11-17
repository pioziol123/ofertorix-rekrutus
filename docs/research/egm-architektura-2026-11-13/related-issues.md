# Related Beads issues

○ oferty-pracy-334.2 · Extract the shared AI configuration and budget   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md

DESCRIPTION

  Extract the existing configuration and budget from lib/profile/ai.ts without
  changing behaviour. Owners: lib/ai/configuration.ts for
  AiConfiguration/aiConfiguration, lib/ai/budget.ts for
  chargeCeiling/budgetMonth/reserve, and the internal lib/ai/money.ts for the
  shared parser and arithmetic. Switch all consumers, including
  lib/matching/list.ts and type fixtures; shared symbols are not re-exported
  from the profile. reserve only checks availability under a lock; saving the
  attempt and the queue stays in the caller's transaction. No migrations, new
  env, Ollama, adapter changes or retry policy. Canonical pair:
  docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/requirements.md and
  solution-design.md after the review of 2026-11-05. Before coding, refresh
  local changes and baseline check results. This is a prepared implementation
  task, not a completed refactor.



DESIGN

  docs/specs/lokalne-ai/etapy/01-konfiguracja-budzet/solution-design.md:
  contracts after review O-L4 of 2026-11-05; full list of consumers,
  unchanged configuration and amount format, shared parser without a
  dependency cycle, caller's transaction for reserve, and test mapping. No
  unresolved material decision for stage 1; the later gates T01–T05 do not
  block the extraction.



NOTES

  Specification preparation requested by the owner in the current
  conversation. Review O-L4 done in 334.19; no change to product behaviour.
  Readiness concerns starting implementation, not completing it. Verification
  in this session covers documents; application tests were not run.



ACCEPTANCE CRITERIA

  E01-AC01: identical strict reading of the three configurations and direct
  imports of the shared owners. E01-AC02: identical amounts, rounding,
  research fees and usage errors. E01-AC03: atomic shared budget, queue
  rollback, all-or-none for groups, preserved unknown reservations and attempt
  month. E01-AC04: regressions of profile, assessments, groups, list and
  research; no changes to payloads, states, history and publication. Concrete
  tests and commands in the SD; pnpm check, build and RUN_INTEGRATION=1
  integrations on isolated schemas are required. Do not mark skipped or
  blocked tests as PASS.



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Separate AI execution and deploy gpt-oss:20b and the OpenCode agent P2

BLOCKS
  ← ○ oferty-pracy-334.3: Separate the profile from the OpenAI protocol P2
  ← ○ oferty-pracy-334.4: Separate assessments and request groups from OpenAI Batch P2
  ← ○ oferty-pracy-334.5: Separate research from the OpenAI executor P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.3 · Separate the profile from the OpenAI protocol   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/02-profil-adapter/requirements.md

DESCRIPTION

  The profile depends on StructuredModel, with a ready JSON Schema and
  injection. The adapter normalises content, usage/ID and typed errors; it
  restores compatible OpenAI retry and Retry-After relative to HEAD. It does
  not pass raw Responses to the domain. Keep proposal approval, prices and old
  snapshots. No migration/Ollama in this stage. Canonical documents:
  docs/specs/lokalne-ai/etapy/02-profil-adapter/requirements.md and
  solution-design.md. Implementation review 2026-11-05 in 334.20; specification
  ready, implementation not complete.



DESIGN

  docs/specs/lokalne-ai/etapy/02-profil-adapter/solution-design.md — contracts
  after a review of the current code; shared rules in
  docs/specs/lokalne-ai/kontrakty-runtime.md. Before coding, refresh existing
  changes and results of earlier stages. Technical gates are part of the
  delivery, not an assumed success.



NOTES

  Specification ready after preparation in 334.20; status stays open. Beads
  dependencies still block the start. The preparation session does not change
  code and does not run application services/tests.



ACCEPTANCE CRITERIA

  E02-AC01–04 according to the canonical pair. Each criterion maps to a
  verification in the SD. check/build and adequate RUN_INTEGRATION=1
  integrations on isolated schemas are required; record evidence and
  limitations. Do not remove existing changes. Do not mark blocked/skipped
  tests as PASS.



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Separate AI execution and deploy gpt-oss:20b and the OpenCode agent P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Extract the shared AI configuration and budget P2

BLOCKS
  ← ○ oferty-pracy-334.6: Add Ollama gpt-oss:20b and run the local profile P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.4 · Separate assessments and request groups from OpenAI Batch   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/03-oceny-batch/requirements.md

DESCRIPTION

  Extract MatchingTask and a neutral result, plus assessment
  validation/publication, from the Batch protocol. Publication under the
  request lock, shared with settlement, without duplicating revisions. Keep
  custom_id, zero/unknown cost, out-of-order, funding and the archive
  group_id ?? request.id. No migration and no local execution. Canonical
  documents: docs/specs/lokalne-ai/etapy/03-oceny-batch/requirements.md and
  solution-design.md. Implementation review 2026-11-05 in 334.20;
  specification ready, implementation not complete.



DESIGN

  docs/specs/lokalne-ai/etapy/03-oceny-batch/solution-design.md — contracts
  after a review of the current code; shared rules in
  docs/specs/lokalne-ai/kontrakty-runtime.md. Before coding, refresh existing
  changes and results of earlier stages. Technical gates are part of the
  delivery, not an assumed success.



NOTES

  Specification ready after preparation in 334.20; status stays open. Beads
  dependencies still block the start. The preparation session does not change
  code and does not run application services/tests.



ACCEPTANCE CRITERIA

  E03-AC01–05 according to the canonical pair. Each criterion maps to a
  verification in the SD. check/build and adequate RUN_INTEGRATION=1
  integrations on isolated schemas are required; record evidence and
  limitations. Do not remove existing changes. Do not mark blocked/skipped
  tests as PASS.



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Separate AI execution and deploy gpt-oss:20b and the OpenCode agent P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Extract the shared AI configuration and budget P2

BLOCKS
  ← ○ oferty-pracy-334.7: Deploy local assessments through gpt-oss:20b P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.5 · Separate research from the OpenAI executor   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/04-research-wykonawca/requirements.md

DESCRIPTION

  An injected ResearchExecutor runs the current OpenAI search and synthesis.
  It returns draft/evidence/accounting also after an error; the coordinator
  validates and publishes. Keep aggregated rounding, the search cost after a
  synthesis error, and the checkpoint before the next HTTP call. No OpenCode
  and no change to domain behaviour. Canonical documents:
  docs/specs/lokalne-ai/etapy/04-research-wykonawca/requirements.md and
  solution-design.md. Implementation review 2026-11-05 in 334.20;
  specification ready, implementation not complete.



DESIGN

  docs/specs/lokalne-ai/etapy/04-research-wykonawca/solution-design.md —
  contracts after a review of the current code; shared rules in
  docs/specs/lokalne-ai/kontrakty-runtime.md. Before coding, refresh existing
  changes and results of earlier stages. Technical gates are part of the
  delivery, not an assumed success.



NOTES

  Specification ready after preparation in 334.20; status stays open. Beads
  dependencies still block the start. The preparation session does not change
  code and does not run application services/tests.



ACCEPTANCE CRITERIA

  E04-AC01–04 according to the canonical pair. Each criterion maps to a
  verification in the SD. check/build and adequate RUN_INTEGRATION=1
  integrations on isolated schemas are required; record evidence and
  limitations. Do not remove existing changes. Do not mark blocked/skipped
  tests as PASS.



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Separate AI execution and deploy gpt-oss:20b and the OpenCode agent P2

DEPENDS ON
  → ○ oferty-pracy-334.2: Extract the shared AI configuration and budget P2

BLOCKS
  ← ○ oferty-pracy-334.9: Integrate OpenCode with gpt-oss:20b as the research agent P2


────────────────────────────────────────────────────────────

○ oferty-pracy-334.6 · Add Ollama gpt-oss:20b and run the local profile   [P2 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-04 · Updated: 2026-11-05
Spec: docs/specs/lokalne-ai/etapy/05-ollama-profil/requirements.md

DESCRIPTION

  Native Ollama adapter and local gpt-oss:20b profile. Implement strict v1
  configuration, versioned endpoints, immutable input/prompt/schema, model
  digest, done_reason and protection against silent context truncation. This
  stage creates the shared operations module, durable
  execution/queue/slot/journal/commands and a publication token for all local
  kinds. Additive migrations are required; keep the CHECK on paid attempts by
  using a new generation per local manual retry. Local cost 0 without a paid
  balance, no automatic repair/generation after an error. Canonical
  documents: docs/specs/lokalne-ai/etapy/05-ollama-profil/requirements.md and
  solution-design.md. Implementation review 2026-11-05 in 334.20;
  specification ready, implementation not complete.



DESIGN

  docs/specs/lokalne-ai/etapy/05-ollama-profil/solution-design.md — contracts
  after a review of the current code; shared rules in
  docs/specs/lokalne-ai/kontrakty-runtime.md. Before coding, refresh existing
  changes and results of earlier stages. Technical gates are part of the
  delivery, not an assumed success.



NOTES

  Specification ready after preparation in 334.20; status stays open. Beads
  dependencies still block the start. The preparation session does not change
  code and does not run application services/tests.



ACCEPTANCE CRITERIA

  E05-AC01–06 according to the canonical pair. Each criterion maps to a
  verification in the SD. check/build and adequate RUN_INTEGRATION=1
  integrations on isolated schemas are required; record evidence and
  limitations. Do not remove existing changes. Do not mark blocked/skipped
  tests as PASS.



LABELS: ready-for-agent

PARENT
  ↑ ○ oferty-pracy-334: (EPIC) Separate AI execution and deploy gpt-oss:20b and the OpenCode agent P2

DEPENDS ON
  → ○ oferty-pracy-334.3: Separate the profile from the OpenAI protocol P2

BLOCKS
  ← ○ oferty-pracy-334.7: Deploy local assessments through gpt-oss:20b P2
  ← ○ oferty-pracy-334.8: Integrate search and read tools for OpenCode P2
  ← ○ oferty-pracy-334.9: Integrate OpenCode with gpt-oss:20b as the research agent P2

COMMENTS
  2026-11-11 13:42 Piotr Ziółkowski
    
      Fixes 334.23–29 delivered a tested local profile path, immutable
      snapshots and a durable slot for direct Ollama. Still open for stage
      acceptance: technical trials of the real runtime from the worker,
      handling of the operator's confirmation that an unknown run has ended,
      and the remaining criteria of 334.6. Retry exists as a domain command to
      be wired into the panel in 334.15. Verification with HTTP fakes and an
      isolated database: check/build PASS, 587 tests PASS.


────────────────────────────────────────────────────────────

○ oferty-pracy-slu · Assess a shared module for requesting source syncs   [P3 · OPEN]
Created by: Piotr Ziółkowski · Type: task
Created: 2026-11-05 · Updated: 2026-11-05

DESCRIPTION

  Candidate from the codebase-design review oferty-pracy-ijo:
  lib/sources/sync.ts:28, polish-sync.ts:56 and jobspy-sync.ts:57 repeat the
  transactional protocol for creating a run and pg-boss work. Before the next
  importer, assess a small interface that hides this protocol. Keep the
  differences in deduplication by scope/source, the SOLID schedule, and the
  rules for complete/incomplete sync. This is a design assessment task,
  without an approved implementation. Evidence and limitations:
  docs/research/przeglad-architektury-codebase-design-2026-11-05.md.



ACCEPTANCE CRITERIA

  Comparison of keeping the current code versus a shared module; a proposal
  for a small interface without callbacks that expose the whole SQL protocol;
  showing that deduplication, queue atomicity and the schedule are preserved;
  a decision on implementation before the code changes.



LABELS: needs-triage
