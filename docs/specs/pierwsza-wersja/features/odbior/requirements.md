# Acceptance of the whole flow — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirement R-30 and its ACs. Related: [profile](../profil/requirements.md), [fetching](../pobieranie/requirements.md), [offers](../oferty/requirements.md), [matching](../dopasowanie/requirements.md), [companies-research](../firmy-research/requirements.md), [browsing](../przeglad/requirements.md), [recruitments](../rekrutacje/requirements.md), [operations](../operacje/requirements.md), [launch](../uruchomienie/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-30 — acceptance

Acceptance covers the real SOLID.Jobs flow, a joint review of 20 assessments, tracing material research findings to sources, error/restart/budget trials and local operation in Docker Compose.

**AC-30:** the acceptance report contains the identifiers of offers and versions, the owner's opinions on 20 varied assessments, the results of the AC-01–AC-29 scenarios, known deviations and the outcome of the acceptance decision. The review covers good, weak and uncertain matches; no competences added by AI and no equating of unknowns with a confirmed absence. A discrepancy with the owner's opinion is explainable and is not automatically an error. We do not impose an unagreed percentage agreement threshold. The VPS and the configuration/restore tests of the external backup service are outside this acceptance.

## Open questions

Related: O-01, O-02, O-03, O-04, O-05, O-06, O-07. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.
