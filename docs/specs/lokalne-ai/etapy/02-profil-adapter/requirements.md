# Stage 2: Profile independent of the OpenAI protocol — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 2 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.3`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

Extract the transport of a single OpenAI call. It concerns the existing profile proposal; it does not change the model, the price list, the approval rules or the local CV parser.

Cross-cutting coverage: LA-02, LA-03; foundation for LA-04. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stage 1. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E02-R01 / E02-AC01 | Same material and proposal | For the stored import text, the prepared instructions and schema describe the same scope; contact details stay removed according to the current rule. |
| E02-R02 / E02-AC02 | Independent profile validation | A syntactically valid response with an unconfirmed quote is rejected. A valid response gives a proposal; the active profile changes only on the owner's approval. |
| E02-R03 / E02-AC03 | Explicit model failure | A refusal, an incomplete response, invalid JSON, no final content or several final contents, and a network failure do not publish the proposal as valid; the message does not reveal CV content or secrets. |
| E02-R04 / E02-AC04 | Consistent attempts and settlement | The existing retry and recovery stay consistent. Lost telemetry is not treated as zero usage; no double effect arises when the job is delivered again. |

## Dependencies and readiness

The StructuredModel contract, normalisation and typed errors were resolved in the SD after the code review. Implementation of stage 1 is required; there is no open product decision.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.
