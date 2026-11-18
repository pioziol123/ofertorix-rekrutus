# Matching

Matching assesses how well an ad fits the owner's confirmed professional profile and justifies the result. [Module map](../../docs/architecture/moduly.md)

Most of its code still lives in `lib/matching/` and moves here in task `oferty-pracy-0mq.12`. This directory holds what task `oferty-pracy-0mq.21` created: Matching's integration with the AI module.

## Data

| Data                | Meaning                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assessment request  | One request to assess an ad: the profile version and the ad version it was made for, and the input fixed from them. Its state holds only Matching's meaning: `excluded` (a required condition conflicts, nothing is requested from AI) or `requested`. |
| Link to the AI work | A `requested` request is the operation of its AI executions and keeps the identifier of the first one. The stage and the cost of its AI work are read from AI, never stored in Matching.                                                               |
| Outcome             | The published assessment, its calculation, or the owner's message when the AI work ended without an assessment.                                                                                                                                        |
| Ratings and weights | The rating history of each ad (AI, the owner's own and recalculated ones) and the versions of the group weights.                                                                                                                                       |
| Read-only history   | The batch and group tables and the attempt link of requests made before `oferty-pracy-0mq.21`. No code writes them.                                                                                                                                    |

## Assessments through AI

[assessment-ai.ts](infrastructure/adapters/assessment-ai.ts) translates a request into an instruction, the response schema (derived from the assessment contract) and the input, under the settings key `matching`:

- **A single assessment** of one offer is a single execution, refused before anything is reserved when its input is above the input cap of the price list, as the former batch path refused it.
- **More than 200 criteria** are refused for every request that needs AI work: the assessment contract returns no more, so such a request could never be published.
- **An assessment group** is one provider batch: the new requests of the selected offers are its items, the request identifiers are the item identifiers, and the budget covers the whole group or none of it. The group command's identifier names the AI group. A repeated command that requested AI work is recognised from the selected offers' requests and the AI work they hold; a second request of the same group is refused by AI. FOLLOW-UP(oferty-pracy-0mq.21/DEV-1): Matching keeps no record of a command's full selection, so a repeated command that requested no AI work is handled as a new command. When it only excluded offers, the exclusion is recorded again. When it reused an assessment in progress, a repeat after that assessment ended requests a new paid assessment. An offer whose assessment is in progress keeps it; an excluded offer gets no AI work.
- **The receiver** ([receive-assessment.ts](receive-assessment.ts)) runs in AI's delivery transaction. It validates the result against the request's own input (criteria and evidence) and publishes it, or rejects it with a safe diagnostic; publication and settlement commit together. It accepts the same delivery again without publishing twice. An end without a result gets a message chosen from the public state and cause alone ([assessment-state.ts](domain/assessment-state.ts)).

The owner sees the state of a request from its latest execution: waiting for budget, queued, in progress (running or delivering), completed, failed (failed, rejected or retried), needs checking (uncertain), or excluded.
