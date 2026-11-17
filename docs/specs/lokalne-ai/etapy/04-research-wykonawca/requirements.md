# Stage 4: Research independent of the OpenAI executor — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 4 of nine; review as part of `oferty-pracy-334.20`, without implementation or application tests. Beads: `oferty-pracy-334.5`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The SD contracts are technical decisions to be implemented within the approved scope; verifying that they work remains part of the implementation.

## Goal and boundaries

Extract the executor of the existing manual basic research. Keep OpenAI search and synthesis as one compatible executor. No OpenCode and no new tools.

Cross-cutting coverage: LA-02, LA-03; foundation for LA-07. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stage 1. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E04-R01 / E04-AC01 | Request and reuse preserved | The same command does not create another operation; an existing report is reused according to the current rule, and an explicit refresh can create a new version. |
| E04-R02 / E04-AC02 | Publication only after validation | A report with an unknown source, an incorrect quote or without the required coverage is rejected. The previous version stays available. |
| E04-R03 / E04-AC03 | Costs of both steps preserved | A synthesis error after a successful search does not zero the cost of the search that was carried out; an unconfirmed cost stays unknown. |
| E04-R04 / E04-AC04 | Consistent failures and recovery | A restart with an unknown outcome of paid work does not automatically start a new search. The result and history end as they did before the refactor. |

## Dependencies and readiness

The accounting contract on success and on error was clarified in the SD. It does not require a new product decision or the choice of the OpenCode search engine (O-L2).

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.
