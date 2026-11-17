# Stage 9: Acceptance and shared deployment — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 9 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.10`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

Acceptance of the full flow, migration compatibility, the UI and a mixed installation. Preparation of instructions for running the system and for returning to OpenAI for new requests. No mass recalculation of data and no new domain functionality.

Cross-cutting coverage: LA-01–LA-21. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stages 6 and 8, plus the task panel and their dependencies. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E09-R01 / E09-AC01 | Working configuration variants | Demonstrated: legacy OpenAI, local profile/assessments with OpenAI research, and all three uses locally with an explicit search source. |
| E09-R02 / E09-AC02 | Data compatibility after migration | On a copy with pending batches and history, the deployment keeps the ability to collect, archive and clean up. New local jobs do not change old configurations. |
| E09-R03 / E09-AC03 | A readable full flow | The owner recognises the model, provider, state, partial results, error and cancellation; approves the profile, reviews assessments and opens the research sources. |
| E09-R04 / E09-AC04 | Resilience and costs | A restart, a duplicate delivery and a settings change do not duplicate publication or the active session. Local work runs with an exhausted paid budget; paid tools respect the budget. |
| E09-R05 / E09-AC05 | Safe change of new requests | Returning the configuration to OpenAI redirects only new operations, keeping the local history and the handling of active jobs. No automatic fallback. |
| E09-R06 / E09-AC06 | Documented technical acceptance | The report shows the checked connections, the model's presence in the API, the integration scenarios and their results. It does not require a response quality benchmark; the owner judges quality in normal use. |

## Dependencies and readiness

The acceptance specification has been reviewed. Closing the task requires the results of O-L1 and T01–T05, all stages and the panel; a partial or blocked result does not authorise a release or closing the epic.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.

Decision update 2026-11-05: the `.env` configuration, indefinite retention of the collected materials except the working Chrome profile, checking the model through the API without a quality pilot, and batching of local assessments by up to 20 are described in the [cross-cutting requirements](../../requirements.md#clarification-confirmed-2026-11-05). Technical API/session checks are not a model quality test.

E09-AC03/04/06 also cover PZ-01–PZ-08 and LA-11–LA-15. Acceptance of the whole scope requires a finished panel and the results of T01–T05 from the [runtime contracts](../../kontrakty-runtime.md), with an explicit description of the checks not run. This is not a reopening of the approved product decisions.

## Extension of the criteria after grill-me

E09-AC03/04/06 cover LA-16–21: one shared release with the panel, a shared local direct/agent slot, a manual retry of an immutable snapshot, an invalid response without automatic generation, infrastructure without automatic repair, a snippet rejected as evidence, no owner data in queries, other public sources before intervention, and cleanup of a finished Chrome without losing the archive. The operator instructions cover manual restarts and proof of the end of an uncertain execution. Login/parking of sessions (281) is not a condition of acceptance.
