# First version specification

Status: **The PRD and the confirmed decisions are the basis of the project; the feature pairs are drafts to be refined later.** The owner changed the way of working: we develop the requirements and solution design for a chosen feature directly before implementing it, before any code is written. The earlier acceptance of the package does not freeze the technical proposals.

## Feature work cycle

1. Choose a specific piece to implement within the bounds of the PRD.
2. Review its working requirements, the confirmed decisions and the current state of the application. Clarify the behaviour and acceptance criteria of that piece.
3. Write or update its solution design, taking into account the existing code and the contracts of other modules.
4. Review the consistency of this pair and agree on material changes. Only then plan implementation tasks and write code.
5. Carry conclusions from implementation and verification into the relevant documents.

We do not finalise all SDs in advance. We settle cross-cutting dependencies early only as far as the chosen piece needs. Drafts of later features may change, as long as the accepted product rules are kept; changing those rules requires explicit agreement.

## Features

| Feature | Requirement IDs | Requirements | Solution design |
| --- | --- | --- | --- |
| [Professional profile and criteria](features/profil/requirements.md) | R-01, R-02 | [Requirements](features/profil/requirements.md) | [Solution design](features/profil/solution-design.md) |
| [Fetching and syncing offers](features/pobieranie/requirements.md) | R-04, R-05, R-06, R-07 | [Requirements](features/pobieranie/requirements.md) | [Solution design](features/pobieranie/solution-design.md) |
| [Offer identity, discrepancies and history](features/oferty/requirements.md) | R-08, R-09, R-10, R-11 | [Requirements](features/oferty/requirements.md) | [Solution design](features/oferty/solution-design.md) |
| [Triage and match assessment](features/dopasowanie/requirements.md) | R-03, R-12, R-13, R-14 | [Requirements](features/dopasowanie/requirements.md) | [Solution design](features/dopasowanie/solution-design.md) |
| [Companies, research and interview preparation](features/firmy-research/requirements.md) | R-15, R-16, R-17, R-18, R-19 | [Requirements](features/firmy-research/requirements.md) | [Solution design](features/firmy-research/solution-design.md) |
| [Browsing offers and companies](features/przeglad/requirements.md) | R-20, R-21 | [Requirements](features/przeglad/requirements.md) | [Solution design](features/przeglad/solution-design.md) |
| [Managing recruitments](features/rekrutacje/requirements.md) | R-22, R-23 | [Requirements](features/rekrutacje/requirements.md) | [Solution design](features/rekrutacje/solution-design.md) |
| [Background operations and cost control](features/operacje/requirements.md) | R-24, R-25, R-26, R-29 | [Requirements](features/operacje/requirements.md) | [Solution design](features/operacje/solution-design.md) |
| [Private access and local launch](features/uruchomienie/requirements.md) | R-27, R-28 | [Requirements](features/uruchomienie/requirements.md) | [Solution design](features/uruchomienie/solution-design.md) |
| [Acceptance of the whole flow](features/odbior/requirements.md) | R-30 | [Requirements](features/odbior/requirements.md) | [Solution design](features/odbior/solution-design.md) |

The split serves separate review, clarification and later planning of features. It is not a split of the application into microservices and does not yet set the order of implementation. The identifiers R-01–R-30 and AC-01–AC-30 are kept; each requirement is maintained in one place.

## Shared documents

- [Architecture and shared contracts](architecture.md) — chosen technologies, module boundaries and shared conventions. It does not replace the feature SDs.
- [Refactoring plan for AI, Ollama and the local agent](../lokalne-ai/README.md) — a proposal from 2026-11-04 to extend AI execution; staged requirements, boundaries and implementation order, with no implementation started.
- [Open decisions](open-decisions.md) — O-01–O-07, their consequences and how to close them. Each pair points to the questions that concern it.
- [Acceptance](features/odbior/requirements.md) — criterion R-30 and the [integration plan](features/odbior/solution-design.md) for the whole flow.

## Sources and state of work

The current owner's decisions from the map `bd show oferty-pracy-v4t` are the basis of the draft. The original interview `docs/product/ustalenia.md` remains historical material; the research in `docs/research/` describes the state of the sources on the given date. Prototypes A and C set the direction of the UI, not the correctness of the rules.

History of preparing the package: `bd show oferty-pracy-4ga`; of the clarifications and the change of the work cycle: `bd show oferty-pracy-boe`. No implementation tasks were created. No paid trials or product tests were run. No commit/push was made. The PRD and the confirmed rules remain the basis. The feature pairs are working material, not an execution design approved as a whole. We settle open contracts when the relevant piece is taken up, without blocking the project with questions about distant features.

## Acceptance history and change in the way of working

Owner's acceptance: „dobra, akceptuję” ("OK, I accept") after the split into one PRD and 10 requirements/solution-design pairs was presented. It was an acceptance of the package as it then stood, with limitations. Later the owner accepted a change: one PRD and the decisions as the basis, requirements/SD as drafts developed before a specific implementation. The proposals for unresolved questions in open-decisions.md still require a decision. The status of individual contracts described in the files takes precedence over a general understanding of readiness.

## Clarifications after the package was accepted

Before code, a review of the chosen feature's documentation is required; completing all pairs is not required. History of the clarifications: `bd show oferty-pracy-boe`. The confirmed Q1–Q15 were moved into the relevant pairs: profile import/form, completeness, variants and salary ranges, research scope, application links, cost month, stages and archiving. The remaining open questions are still in the register; technical changes require an agreed review.

Confirmed clarifications and the historical review: [record of decisions Q1–Q15](review.md#moved-decisions). The recommendation from that review to refine all SDs was replaced by the work cycle above. Implementation has not started.

### Current profile review — 2026-11-01

After the local importer and the list were completed, the profile was chosen. Its [requirements](features/profil/requirements.md) and [SD](features/profil/solution-design.md) were refined for the next stage; the other pairs keep their working character. The [parser trial](../../research/profil-import-spike/README.md) confirms only basic local extraction. The paid AI proposal requires shared cost control, local configuration and verification of the provider before the integration is considered working.
