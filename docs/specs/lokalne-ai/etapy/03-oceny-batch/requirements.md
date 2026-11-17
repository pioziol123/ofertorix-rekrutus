# Stage 3: Assessments separated from OpenAI Batch — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 3 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.4`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

Separate the preparation and publication of an assessment from the OpenAI Batch protocol. Keep the working single/group assessments, their archiving and costs. No local execution.

Cross-cutting coverage: LA-02, LA-03; foundation for LA-05. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stage 1. The model contract from stage 2 is not required for the Batch extraction itself. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E03-R01 / E03-AC01 | Unchanged assessment content | The same inputs and profile/ad versions lead to the same instructions and schema; the validators reject a missing or repeated criterion and unconfirmed evidence. |
| E03-R02 / E03-AC02 | Consistent Batch cycle | Existing batches can be submitted, polled, collected and cleaned up, keeping custom_id and the diagnostic archive; a missing output file is distinguished from a valid result. |
| E03-R03 / E03-AC03 | Independent group results | Out-of-order results reach the correct items; an error in one item does not remove the valid ones. Funding of a paid group stays atomic. |
| E03-R04 / E03-AC04 | Single publication and currency | A repeated result does not publish a second revision. A result for an older version of the inputs does not displace the current assessment; a group command with the same ID stays idempotent. |
| E03-R05 / E03-AC05 | Explicit unknown outcome of submission | A failure after sending create and before recording the ID does not blindly start another paid batch. The cost and the uncertain state stay visible. |

## Dependencies and readiness

The review of the current code was done on 2026-11-05. The SD defines the neutral result, the publication transaction and archive compatibility. The local variant of AC-B1/AC-G4–G7 is the scope of stage 6. Implementation of stage 1 is required; there is no open product decision.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.
