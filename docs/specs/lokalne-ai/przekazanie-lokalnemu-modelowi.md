# Handing the implementation to the local model

Implementation package after the approved grill-me, 2026-11-05. We make the whole epic available as one deployment; staging applies to the work and tests, not to separate releases. After implementation review 334.19/20, the specification is prepared for staged work; it is not proof that stages are finished or that services work. Read the task status and dependencies from Beads, not from this document. The scope of this session covers documentation, without changes to production code and without starting services.

## Entering the project

1. Read `AGENTS.md`, `docs/agents/domain.md` and the documents named there. Then `docs/agents/issue-tracker.md`; run `bd prime` and `bd context --json`. Do not import `.beads/issues.jsonl` and do not sync Dolt remotely.
2. Check the current `git status` and the existing changes. When this package was prepared, there were uncommitted `lib/ai/` files and changes to `lib/profile/ai.ts` coming from other work. Do not remove them, and do not assume that stage 1/2 must be written from scratch. Check the implementation against the criteria, add the missing parts, and only then confirm completion.
3. Read `bd show oferty-pracy-334` and its children. Choose the earliest unfinished stage whose dependencies and review are met; read its requirements/SD pair and the dependent contracts it names. The first task is `oferty-pracy-334.2`; do not start planning the epic again. Claim the task in Beads. The absence of order blockers does not replace a review of the specification and the code.
4. For behaviour changes, use the project workflow `implement-with-tester`. Do not do all nine stages in one change. After a stage, record in Beads the result of the checks, the remaining gaps and the actual status.

## Documents as needed

| When you work on | Read |
| --- | --- |
| Scope, configuration or a change of provider | [PRD](PRD.md), [LA-01–LA-21](requirements.md). |
| The next stage | The relevant pair from the [index of the nine stages](README.md#requirements-and-sd-for-each-stage). |
| Direct queue/commands or recovery from stage 5 | [Runtime contracts](kontrakty-runtime.md) and the relevant SD 5/6. |
| The agent, evidence and Chrome | [Qualification](kwalifikacja-runtime.md), the runtime contracts and SD 7/8. |
| The panel and commands | [Panel requirements](features/panel-zadan/requirements.md), [panel SD](features/panel-zadan/solution-design.md). |
| Acceptance and local launch | Stage 9 and T01–T05 in the runtime contracts; record technical results with versions. |

## Order and boundaries of changes

| Stage / Beads | Result that ends the stage |
| --- | --- |
| 1 / `334.2` | Shared configuration and budget without dependence on the profile, without a change of behaviour. Take the existing extractions into account. |
| 2 / `334.3` | The profile calls `StructuredModel`; OpenAI still gives compatible results and settlement. |
| 3 / `334.4` | Building, validating and publishing an assessment separated from the OpenAI Batch cycle. |
| 4 / `334.5` | OpenAI research behind `ResearchExecutor`, both calls and accounting kept, also on error. |
| 5 / `334.6` | Local profile through the native Ollama API, `.env` configuration, model present in `/api/tags`, API cost zero. |
| 6 / `334.7` | Local assessments, groups of up to 20, independent results and no double publication. |
| Qualification / `334.21` | Manifest of pinned versions, headless Chrome in a container, private DevTools/input, nftables/proxy and isolation evidence; no model benchmark. |
| 7 / `334.8` | After stage 5 and the qualification: Chrome DevTools MCP with a controlled bridge, evidence and isolation; technical T03–T05, without our own browser engine. |
| 8 / `334.9` | OpenCode HTTP, sessions and the global shared queue of one local AI work item, recovery and a result validated by the domain; technical T01/T02. |
| Panel / `334.15` | AI views and check/stop/skip/retry/resume, a separate runtime state, history and the publication block. Full integration after 6 and 8. |
| 9 / `334.10` | Acceptance of the whole with the panel, migrations on a copy, and instructions for launching and for rolling back the configuration of new requests. |

Full task IDs have the prefix `oferty-pracy-`. Check the actual dependencies in Beads; the [dependency map](README.md#order-resulting-from-dependencies) explains their reasons. The order of IDs or of list updates alone is not the implementation order. In stage 8, intervention can be tested through the command contract without the finished panel UI; this does not create a circular dependency. The panel is a separate task, not a change to the numbering of the nine stages.

## Rules the implementation must enforce

- `gpt-oss:20b` locally. Profile/assessments directly through Ollama, research through OpenCode. No automatic model download and no cloud fallback.
- One active local AI execution across the whole installation (profile, single assessment or research). The next one waits, also during intervention or unknown. The shared slot also covers direct profile and assessment inferences; OpenAI does not occupy the local slot.
- No quotas on local tokens, rounds or a fixed deadline for the whole work. A lease and the timeout of a single transport must not silently end a long task or start a duplicate.
- An explicit retry immediately withdraws publication from the previous execution and puts the new one in the queue. Its start waits for the confirmed end of the old agent. We save a late result for inspection.
- Google through a dedicated headless Chrome in a container and Chrome DevTools MCP, with a private DevTools for preview and manual intervention. Public pages without signing in; a new profile per execution, resumption in the same state, without the owner's private Chrome.
- Save evidence before passing it to the model. Indefinite retention of collected data, no secrets in the archive; do not remove history to start a clean profile.
- Keep OpenAI/Batch and historical snapshots. A configuration change affects only new requests. The paid services budget does not block a local cost of zero.
- No benchmark of answer quality. Technical verification and the domain validators are required; the user assesses quality in normal use.

## Verification and finishing a stage

Before implementation, read the current `package.json` scripts and how PostgreSQL is started. Use the existing tests as regression tests; add tests of new states, races and errors according to the criteria mapping in the SD. Run integration tests on isolated schemas as the project does, not on the owner's data. When a dependency is unavailable, record exactly what is missing and the scope of the check that was not done.

At acceptance, run `pnpm check` and the project build, plus the required integrations. Passing HTTP mocks alone does not close T01–T05. Do not install services globally and do not modify the personal configuration of tools to work around test problems. The qualification prepares project manifests/launchers and evidence in a separate environment; present operator actions that need privileges as specific instructions. Prepare the configuration and instructions in the repo; a launch must not silently attach the owner's accounts, keys and MCP.

Finishing a stage: the criteria of the relevant pair are met and the results are recorded in Beads; gaps have specific tasks or a blocker description. Changes of material behaviour are reflected in the requirements and SD. Do not close a task just because a file exists. Do not run git commit/push or remote Dolt sync without the user's authorisation.

## Ready-made message to start the implementation

> Work in the `oferty-pracy` repository. Implement local AI in stages according to `docs/specs/lokalne-ai/przekazanie-lokalnemu-modelowi.md`. First read AGENTS and Beads, and check the existing changes. Start with the earliest unfinished stage whose dependencies are ready; do not rewrite the existing `lib/ai/`. Implement its requirements/SD and verify the criteria. Keep the approved `gpt-oss:20b`, OpenCode, Chrome DevTools MCP, the shared queue of one local AI work item and the indefinite history. After the stage, record the results in Beads and present the changes and the validation. Do not commit, do not push and do not sync Dolt remotely.

## Technical snapshot when the package was prepared

2026-11-05: configuration and budget are still in `lib/profile/ai.ts`; the target `lib/ai/configuration.ts` and `budget.ts` do not exist. The StructuredModel contract and the OpenAI adapter exist in the working changes, and the profile partly uses them; the normalisation of results/errors must be verified against stage 2. There is no OpenCode/Ollama SDK dependency yet, and no runtime/Chrome configuration in Compose.

Compose separates web and worker from the host services; db/migrate/web/worker/tools exist. The current `pnpm check` covers lint, typecheck and Vitest; build is a separate check. Refresh this information when a stage starts. Do not use the host's localhost as a service address inside a container.

## Binding addition after grill-me

Deploy the whole epic together with the panel. Add the shared slot and queue already for the profile in stage 5, then use them in assessments and OpenCode; do not create a separate slot for research. The unit of assessment is a single offer; a group of up to 20 has separate requests and results. A manual retry copies the old input, instructions, schema and configuration; it does not read the new profile or `.env`. Do not repair an invalid answer with a new automatic generation.

Public tools do not receive the owner's data. A Google snippet is not admissible evidence for a claim. Check the categories with findings or unknowns; a page block means trying other public sources. No signing in; intervention only when further public work is blocked. Chrome can be cleaned up after the end and after the material is saved; do not remove the durable history.

The application can show a failure and control its own task, but it does not restart/repair services. Prepare instructions for manually restarting OpenCode/Chrome/Ollama and for confirming the end of an uncertain execution before freeing the slot. Health alone is not a confirmation. Signing in and parking sessions are delivered only by the future `oferty-pracy-281`. Normative criteria: LA-11/13 and LA-16–LA-21.

## Order after the review of the whole package

For one agent: **1 → 2 → 3 → 4 → 5 → 6 → qualification 334.21 → 7 → 8 → panel → 9**. Native profile/matching use the shared slot already in 5/6; the Chrome qualification is not a reason to postpone these stages. Always read the actual graph and state from Beads. The label ready-for-agent means a ready specification, not completed dependencies and not a positive live result.

The reviewed SDs 2–6 settle the neutral model, typed errors, injection, validation/publication, accounting, the env format and migrations, the parent API and the unknown state. Do not design these contracts again. The base versions and headless protections are defined in the qualification; the real hashes and /doc are produced when it is carried out. Do not close it, or 7/8, on the basis of documents alone.

Each task ends with evidence for its assigned criteria in Beads. For application checks, use the project environment:

```sh
docker compose run --rm tools pnpm check
docker compose run --rm tools pnpm build
docker compose run --rm -e RUN_INTEGRATION=1 tools pnpm test
```

Refresh the scripts/Compose at the start; these commands need a running Docker and an initialised test environment. Integrations use isolated schemas, never the owner's data. Skipped/blocked does not mean PASS. Run build-dependent HTTP tests after a fresh build. Before closing the epic, [acceptance 9](etapy/09-odbior/solution-design.md) is required, with all LA/PZ/E/KR/T backed by evidence, without unverified claims of success.
