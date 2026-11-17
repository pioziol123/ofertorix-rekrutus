# Stage 9: Acceptance and shared deployment — Solution design

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 9 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.10`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

Normative scope of behaviour: [Requirements](requirements.md), E09-R01–E09-R06. Baseline state: the local directory as of 2026-11-04, including the existing changes; this is not only HEAD. The designed files below are not a statement about an existing implementation.

## Approach and boundaries

Acceptance is cross-cutting: web app, worker, PostgreSQL, Ollama, OpenCode and the search engine. Put the results in docs/specs/lokalne-ai/odbior.md only after the checks have been run; the document contains the command/scenario, the configuration without secrets, the result and limitations. Do not add execution statuses to the plan table instead of updating Beads.

## Decision E09-D01 — Shared acceptance and a change of routing for new requests

**Technical decision:** A mass rewrite of pending operations would violate the snapshots. Reverting the configuration is separate from rolling back the application image and the migrations.

Integration points in the current directory: [package.json](../../../../../package.json), [worker/index.ts](../../../../../worker/index.ts), [README.md](../../../../../README.md). They show where the change happens, not an obligation to move all of their responsibilities.

## Contracts and invariants

The acceptance matrix covers legacy OpenAI and the mixed variants; configuration works per use according to stage 5. For each scenario, record the operation/request/attempt ID and the session ID where relevant, the input version identifiers and the result. Do not copy the private CV into the acceptance report.

Migration test: a copy of an isolated database with representative OpenAI queued/submitted/unknown and terminal records, running the new migrations, starting the worker, collection/cleanup and reading the UI. Check the partial indexes for all new active states. A test of the old application image on the new data is a separate result, not a default guarantee.

During acceptance, test in order profile → a few assessments → a group → manual research. After each scenario, check the result and the history. Provide one shared deployment of the whole epic with the panel, without separate stage releases. Do not change existing requests in bulk. On a problem, disable the creation of new local operations and point new ones to OpenAI; keep handling the old snapshots. Do not revert executed migrations that delete data; corrections are forward-only. Restore the old image only if a separate test has shown compatibility.

We do not produce a separate model quality report or benchmark. The owner judges the content during normal use. The acceptance report covers technical scenarios of the API, migrations and states, and explicit gaps; not running them must not be presented as a success.

## Migration and rollout

Update README and .env.example according to the installation that was actually checked: endpoints from containers, versions, model availability, OpenCode isolation and retention, start/restart/cancellation and diagnostics. Do not download models or change the owner's global settings as part of the documentation alone. Acceptance does not authorise a git/Dolt push.

## Verification

All the checks below are a plan, not a result that has been produced. Automated tests with fakes do not prove that live services work.

1. pnpm check, pnpm build and the needed RUN_INTEGRATION=1 integrations on isolated schemas.
2. A legacy/mixed/local matrix with an active old batch, zero local cost and a paid tool.
3. Fault injection: restart, lease loss, network, duplicates and a cancellation/publication race.
4. Review of the UI and technical results; the owner judges content quality during normal use; the result of each of LA-01–LA-21 with evidence or an explicit gap.

| Criterion | What verification must show |
| --- | --- |
| E09-AC01 | Check 2 above; observe the outcome stated in the corresponding Requirements criterion. |
| E09-AC02 | Check 2 above; observe the outcome stated in the corresponding Requirements criterion. |
| E09-AC03 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |
| E09-AC04 | Check 3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E09-AC05 | Checks 2–3 above; observe the outcome stated in the corresponding Requirements criterion. |
| E09-AC06 | Check 4 above; observe the outcome stated in the corresponding Requirements criterion. |

For an implementation that changes behaviour, use the project workflow `implement-with-tester`. Update the status, evidence and any deviations in Beads and in this pair; do not add unverified successes.

## Readiness and change control

The acceptance specification has been reviewed. Closing the task requires the results of O-L1 and T01–T05, all stages and the panel; a partial or blocked result does not authorise a release or closing the epic.

Before coding, refresh the working state and the Beads dependencies. The specification review was done on 2026-11-05; it does not replace test results or control of changes made after the review.

Decision update 2026-11-05: the `.env` configuration, indefinite retention of the collected materials except the working Chrome profile, checking the model through the API without a quality pilot, and batching of local assessments by up to 20 are described in the [cross-cutting requirements](../../requirements.md#clarification-confirmed-2026-11-05). Technical API/session checks are not a model quality test.

Extension of 2026-11-05: manual check/stop/skip in the [task panel](../../features/panel-zadan/requirements.md). The behaviour was approved; the normative technical details are given by the panel SD and the runtime contracts.

## Acceptance addendum — 2026-11-05

Include LA-11–LA-15 in the scenarios of stages 7/8 and the panel: one agent despite several workers and a restart, retry in the queue while running/unknown, blocking the queue during an intervention, manual idempotent resumption of the same session, clean cookies for a new execution, preservation of evidence and running separate services. This does not extend acceptance with a model quality benchmark.

## Acceptance matrix after grill-me

Include the results of LA-16–21 in the report. Mixed check: a profile, an assessment and a research requested at the same time across several workers execute one at a time; an intervention/unknown blocks all local kinds. After a change of profile and `.env`, a retry uses the old snapshot and does not start before the slot is freed. A bad response ends the attempt without an automatic second call. After a manual repair of the services, the queue is freed by the confirmed end of the old work, not by the health check alone.

Check public sources only: a Google snippet does not justify a claim, a blocked page leads to an attempt at other sources, queries without owner data, categories can stay unknown after an attempt to check them. Lack of grounds for a report does not replace the old one. After a confirmed end, the working Chrome profile can be deleted without losing materials and history. All scenarios and the panel are accepted before one shared deployment. Do not implement the login and parking features from backlog item 281 in this release.

## Condition for closing the epic — review 2026-11-05

Prepare `odbior.md` **during implementation**, with a row for each of LA-01–LA-21, PZ-01–08, E01–E09 and KR/T01–T05. A row contains the criterion, the scenario, versions/configuration without secrets, the identifiers of test operations, the command or a link to the evidence, the result PASS/FAIL/BLOCKED/NOT_RUN and limitations. Do not insert fictional PASS results while preparing the specification. One test can cover several criteria, but each has a reference.

Configuration matrix: legacy without new env; local profile+matching and OpenAI research; all local; an unsupported combination/missing model; returning the choice to OpenAI with pending local and Batch requests. Execution tests can use fakes, but T01–T05/KR and the tags connection require the actual pinned services. Technical protocol tests are not a quality assessment. Test paid research in the matrix with a fake, unless the owner separately requests an actual paid call.

Check the migrations on an isolated database with representative old active records and history; the fixture does not have to contain the owner's private data. The test covers a repeated migrate with no changes, a new worker, completing/cleaning up old batches, nullable legacy execution, active indexes and more than two manual local retries. Do not edit old migrations. The old image version can be rolled back only after a separate compatibility test; by default, a forward-only correction and a change of new requests.

The operator instructions cover: versions and manifest, server endpoints web/worker→host, preparation of the model by the owner, starting the separate services, access to the private preview/intervention of DevTools of headless Chrome in a container, refusal of disallowed network, archive/data volumes, intervention, disk failure, manual termination of an instance and recording proof of the end of an unknown. Do not add automatic repair or deletion of history. When reverting the configuration, keep the endpoints/secrets of old versions needed by pending requests.

Task `334.10` and the epic can be closed only when all implementations and the qualification have evidence for the required criteria, the panel is integrated and the technical gates have passed. BLOCKED/NOT_RUN on a mandatory scenario means acceptance was not done, even if unit tests passed. Deployment in the owner's environment, commit, push and Dolt sync still require separate authorisation; the result ready for approval includes code, migrations, the report and reproducible instructions.
