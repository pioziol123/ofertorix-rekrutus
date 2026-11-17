# Stage 8: OpenCode as the research agent with gpt-oss:20b — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 8 of nine; review as part of 334.20, without carrying out the implementation. Beads: `oferty-pracy-334.9`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The technical contracts were clarified in the SD, runtime and qualification; whether they work requires tests.

## Goal and boundaries

Integrate the ready OpenCode runtime with the manual basic research. OpenCode runs the conversation and uses the tools; the application is responsible for the request, evidence, costs, validation and publication. No agent loop of our own.

Cross-cutting coverage: LA-01, LA-03, LA-06, LA-07, LA-08, LA-09. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stages 4, 5 and 7 (including qualification 334.21); checking the session contract O-L3/T01/T02 during implementation. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E08-R01 / E08-AC01 | Local agent without OpenAI | Research uses OpenCode and gpt-oss:20b in Ollama without an OpenAI key; it does not enable the cloud or alternative models automatically. |
| E08-R02 / E08-AC02 | Controlled session | Each request is linked to a specific session and runtime version. A configuration change or a restart does not pick the last global session and does not create a second active research. |
| E08-R03 / E08-AC03 | Report checked by the domain | Ending a session without a valid report is an error. Unknown evidence, URLs and quotes are rejected; the previous report stays available. |
| E08-R04 / E08-AC04 | No quotas and the ability to cancel | A long research is not cut off by a limit on rounds, calls or tokens, or by a fixed deadline. Cancellation stops publication and is distinguishable from completion and from an uncertain session state. |
| E08-R05 / E08-AC05 | Only the agreed permissions | The agent can use only the tools of stage 7, not a shell, files, delegation or interactive questions; it does not inherit personal plugins, secrets and configuration. |
| E08-R06 / E08-AC06 | Separate costs and retention | The model cost stays zero; paid tools are settled despite a report error. Sessions, conversations, events, evidence and reports are kept indefinitely, without automatic deletion; a restart and a runtime replacement keep the data. |

## Dependencies and readiness

O-L3 is described in the runtime contracts; before live, T01/T02 are required: version and session correlation, recognising start/result, cancellation, recovery. Retention is closed: materials indefinitely, the Chrome profile removable after the end and archiving. The proposed table does not prove that the current API meets the contract. O-L2 has closed product decisions; stage 7 delivers the verification of T03–T05. There is no open decision about the model, the runtime or Ollama quotas.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.

## Queue and resumption — confirmed 2026-11-05

E08-AC02/04 cover [LA-11 and LA-15](../../requirements.md): a durable shared queue of profile, assessments and research, with one active local execution in the whole installation, also with several workers. The next one waits for the confirmed end of the previous one; waiting-for-user, cancelling and unknown do not free the place. We record an explicit retry immediately, but its start waits for the place to be freed. Resume continues the same execution; a restart first checks the existing session. Direct profile/assessment inferences use the same queue and slot. E08-AC01/02 cover running separate services according to LA-14. Still no model quotas and no fixed deadline for the whole work.

## Ending research and release scope — after grill-me

E08-AC03 covers LA-19–21: evidence only from pages that were read, an attempt to check each category and explicit unknowns, without a requirement to find all the answers. Lack of grounds for a valid report does not replace the previous report. E08-AC04 covers an unconditionally shared slot with the direct paths; an intervention also blocks profile and assessments. LA-17/18: an invalid result requires a manual retry with the same snapshot; infrastructure failures do not cause automatic restarts. Login/parking of sessions is outside the epic, in backlog item 281. The release covers the whole epic and the panel (LA-16).

## Execution readiness after the review

The review of 2026-11-05 resolves the technical contracts, including headless Chrome in a container with private DevTools for manual intervention. The [qualification](../../kwalifikacja-runtime.md) defines the versions and safeguards and the evidence required before integration. There is no open choice of model, browser or quotas; the implementer checks that it works. A negative test blocks enabling; it does not authorise working around the criteria.
