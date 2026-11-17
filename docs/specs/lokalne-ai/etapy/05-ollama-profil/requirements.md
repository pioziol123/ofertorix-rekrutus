# Stage 5: Ollama gpt-oss:20b and the local profile — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 5 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.6`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

The first useful local execution: the Ollama adapter and the profile proposal. A shared versioned configuration and a local cost of zero. No local assessments and no research agent.

Cross-cutting coverage: LA-01, LA-03, LA-04, LA-06, LA-08. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stages 1–2; a technical check of the API/model O-L1, without a quality pilot. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E05-R01 / E05-AC01 | Explicit choice and compatibility of old settings | Without the new configuration, an existing installation still uses OpenAI. An explicit choice of Ollama requires gpt-oss:20b; a missing model or an invalid combination gives an error without fallback. |
| E05-R02 / E05-AC02 | Local profile without OpenAI | Without an OpenAI key and price list, a valid proposal with quotes is produced. Saving the profile still requires approval; bad JSON or evidence does not change the active profile. |
| E05-R03 / E05-AC03 | Immutable execution snapshot | A configuration change after the request does not redirect the attempt. A new attempt uses the recorded versions of the instructions, schema, input, model and parameters; secrets do not get into the history. |
| E05-R04 / E05-AC04 | No charges and a correct cost | A negative balance of paid services does not block a local proposal. The API cost is zero also when usage=null; there is no quota on tokens, rounds or calls, and no fixed deadline for the whole local work. |
| E05-R05 / E05-AC05 | Explicit failure, interruption and context | A missing model, a connection failure, an incomplete response, a physical context that is too large and cancellation are distinguishable from a valid proposal; the input is not silently shortened. |
| E05-R06 / E05-AC06 | Model availability through the API | The worker checks GET /api/tags and finds exactly the configured gpt-oss:20b. A missing model, an unavailable server or an invalid response are distinguishable. We do not run a generation to evaluate quality; the owner judges the result in normal use. |

## Dependencies and readiness

Configuration, done_reason, overflow and recovery are defined in the SD after the review of 2026-11-05. O-L1 is a technical connection/model test during implementation, not a missing decision before coding. A live test that was not run is not a success.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.

Update 2026-11-05: we check availability through [GET /api/tags](https://docs.ollama.com/api/tags); the earlier response quality pilot was replaced by the owner's judgement during normal use. Technical tests and validators remain required.

## Addendum after grill-me — approved 2026-11-05

LA-11 covers this path with a shared queue of one local AI job, together with research. Acceptance requires no parallel generation with a mix of profile, assessments and OpenCode, also between workers. Unknown occupies the slot; a retry can be queued without starting. Bad JSON/evidence ends the attempt, with no further automatic generation; a manual retry has immutable input and configuration according to LA-17. The infrastructure is handled manually (LA-18). This stage is part of one shared release with the panel (LA-16), not a separate release. Queue contract and direct HTTP: [runtime](../../kontrakty-runtime.md).

E05-AC03 covers the immutability of a manual retry after a change to `.env` and the profile; E05-AC04/05 cover the shared slot with assessments/research, unknown and the manual operator procedure. This stage implements the first shared queue/slot; stages 6/8 extend it without creating a second mechanism.
