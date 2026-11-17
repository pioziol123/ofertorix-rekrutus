# Stage 6: Local single and group assessments — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 6 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.7`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

Execution of neutral assessment tasks by Ollama gpt-oss:20b. Coexistence of local groups and old Batch batches. No change to the assessment rules and no mass reassessment of the database.

Cross-cutting coverage: LA-01, LA-03, LA-05, LA-06, LA-08, LA-10. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stages 3 and 5. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E06-R01 / E06-AC01 | Same assessment rules | A local response goes through the same validators as Batch: the full set of criteria, two-sided quotes, unknowns, rating, completeness and currency. |
| E06-R02 / E06-AC02 | A group of independent results | One command creates durable groups of up to 20 items, e.g. 30 → 20 + 10, without losing items; valid items are published despite errors in others. A repeated command does not duplicate groups or members. |
| E06-R03 / E06-AC03 | Resumption without republication | A restart skips completed items, the claim protects against parallel execution, and a double response does not create another revision. |
| E06-R04 / E06-AC04 | No fictional Batch and no charges | A local job does not create OpenAI files or batches. The paid budget does not block it; a group has no limit on the number of local inferences derived from Batch constraints. |
| E06-R05 / E06-AC05 | Recognisable state and cancellation | The UI shows the local provider/model, the number of items and their states. Cancellation leaves published assessments in place and stops publication of unfinished items. |
| E06-R06 / E06-AC06 | Compatible old batches | After local assessments are enabled, pending OpenAI batches are still collected, archived and cleaned up; a configuration change does not rewrite their executor. |

## Dependencies and readiness

The parent command API and the group state on unknown are defined by the SD addendum of 2026-11-05. The stop strategy and the shared slot come from stage 5. There is no open product decision.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.

## Addendum after grill-me — approved 2026-11-05

LA-11 covers this path with a shared queue of one local AI job, together with research. Acceptance requires no parallel generation with a mix of profile, assessments and OpenCode, also between workers. Unknown occupies the slot; a retry can be queued without starting. Bad JSON/evidence ends the attempt, with no further automatic generation; a manual retry has immutable input and configuration according to LA-17. The infrastructure is handled manually (LA-18). This stage is part of one shared release with the panel (LA-16), not a separate release. Queue contract and direct HTTP: [runtime](../../kontrakty-runtime.md).

E06-AC02: a group of 20 creates 20 independent requests/assessments, not one prompt with 20 offers. E06-AC03/05 cover the shared slot and manual retry without new input; an item's unknown is distinct from a completed item and blocks the start of other local work until the end is confirmed.
