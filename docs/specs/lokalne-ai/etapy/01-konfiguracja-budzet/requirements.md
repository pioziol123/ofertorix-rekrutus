# Stage 1: Shared configuration and budget — Requirements

Status: **technical review completed**, 2026-11-05. Stage 1 of nine, prepared for implementation within the existing scope of a refactor with no change in behaviour. Implementation status and task readiness: Beads `oferty-pracy-334.2`; preparation result: `oferty-pracy-334.19`. The review does not mean the refactor or the application tests were carried out.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. This stage only defines an equivalent extraction of the existing mechanism; new local execution belongs to later stages.

## Goal and boundaries

Extract the existing configuration and cost arithmetic from the profile module. The consumers remain profile, matching and research. No Ollama, no new configuration format, no migrations and no change to the funding rules.

Cross-cutting coverage: LA-02; foundation for LA-03 and LA-06. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

No earlier implementation stage. The review of the pair and of the local code was done on 2026-11-05. When implementation starts, refresh the state of the directory, take into account the existing adapter changes and record the baseline result of the required checks. The review covers the current working directory, not only HEAD.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E01-R01 / E01-AC01 | One configuration for the existing consumers | For the existing AI_PROFILE_PRICING_JSON, AI_MATCHING_PRICING_JSON and AI_RESEARCH_PRICING_JSON, the read result and feature readiness are the same as before the move, also for invalid JSON, an unknown field or a missing key. Every consumer of the configuration, costs and type uses their shared owner in lib/ai; it does not get them through profile. |
| E01-R02 / E01-AC02 | Unchanged settlement | For the same prices and usage, the calculations give identical amounts in PLN, and the reservation covers the same cap and additional fees. |
| E01-R03 / E01-AC03 | Unchanged budget atomicity | The availability check, the attempt record and the work request stay in the caller's same transaction. The check alone does not create an attempt or commit the transaction. Concurrent requests cannot reserve more than the current rule allows; the month boundary uses Europe/Warsaw and the attempt's month does not change at settlement. A failed queue request also rolls back the attempt record. |
| E01-R04 / E01-AC04 | Domain processes preserved | Profile, single/group assessments and research go through their existing success, error and unknown-cost paths, with no change to provider requests, states or publication. |

## Dependencies and readiness

O-L4 for the scope of stage 1: review done. No material product or technical decision was identified that must be resolved before this extraction. Implementation must still demonstrate E01-AC01–04; the presence of documents or files is not proof that the criteria are met. Gates T01–T05 of the later local execution do not block this refactor.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.
