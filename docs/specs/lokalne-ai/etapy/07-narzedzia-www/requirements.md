# Stage 7: Search and page reading for OpenCode — Requirements

Status: **review done, specification ready for implementation**, 2026-11-05. Stage 7 of nine; review as part of 334.20, without carrying out the implementation. Beads: `oferty-pracy-334.8`.

Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md), [plan](../../README.md). Confirmed: `gpt-oss:20b` locally, OpenCode for the agent and no Ollama charges. The technical contracts were clarified in the SD, runtime and qualification; whether they work requires tests.

## Goal and boundaries

Google through a browser and integration of research tools with evidence provenance. Testable without an LLM. No running of the agent conversation and no publishing of reports.

Cross-cutting coverage: LA-06, LA-07, LA-09. Actors: the owner who requests or reviews an operation, and the worker that executes its recorded scope; the access mechanism stays consistent with the existing private application.

## Entry conditions

Stage 5 and qualification `334.21` before integration: stage 5 delivers the shared execution ID, the durable queue and the local AI slot used by the bridge. Investigation of the protocol and isolated Chrome tests without an LLM can be prepared earlier, but that does not mean this integration is finished. O-L2/T03–T05 before live use. Read the current code and the existing uncommitted changes before implementation.

## Requirements and acceptance criteria

The identifiers in each row link a requirement to its observable criterion. Both stay stable across later reviews.

| Requirement / criterion | Behaviour | Acceptance condition |
| --- | --- | --- |
| E07-R01 / E07-AC01 | Explicit search source and cost | The configuration points to Google through a dedicated browser; it does not start a paid search engine API. A missing configuration does not start a default external service; a paid call has coverage before it is sent. |
| E07-R02 / E07-AC02 | Evidence from actual reading | A snippet stays search_snippet; page is created only after the page is fetched. Each piece of evidence has an application-assigned ID, text, URL, title and read date. |
| E07-R03 / E07-AC03 | Controlled web access | Private and local addresses, metadata and redirects to them are rejected, also for IPv6 and DNS changes; the agent gets no files and no shell. |
| E07-R04 / E07-AC04 | Explicit gaps and errors | 403, 429, timeout, a page that is too large and an unsupported format do not give fictional page evidence. Partial results are marked as a partial read. |
| E07-R05 / E07-AC05 | Isolation of operations and data | Evidence of one operation cannot be given as evidence of another; the search engine does not get the CV, the full profile or secrets. Instructions in a page do not change permissions. |
| E07-R06 / E07-AC06 | Independence from model limits | Protection of a single read does not limit the number of Ollama rounds or inferences; lack of paid budget stops the paid tool, with an explicit reason. |

## Dependencies and readiness

Source chosen: Google through a browser. O-L2 now concerns the browser mechanism, isolation, evidence and handling of blocks. Bridge chosen: Chrome DevTools MCP with a dedicated Chrome. Isolation and capture of materials are described by the runtime contracts; T03–T05 require verification, and the decision alone does not prove that the integration works.

Solution and verification mapping: [SD](solution-design.md). The LA rules keep a single place of maintenance in the cross-cutting requirements; this pair defines their scope for the stage. It does not change domain rules outside its explicit scope.

## Addendum approved 2026-11-05

[LA-11–LA-15](../../requirements.md) apply: a single agent, state isolation per execution, cookies within an execution, clean state for the next one, no login, the scope of evidence and manual resumption. E07-AC02 covers archiving the exact text seen by the agent and screenshots on blocks/errors/intervention; E07-AC05 covers not carrying cookies/tabs between executions and preserving the archive. The product decisions are closed; the mechanism for isolation and data capture still requires technical verification.

## Public sources and cleanup — after grill-me

LA-19–21 apply: a Google snippet serves only for navigation/archiving; a fact/opinion requires evidence from a page that was read. E07-AC02 checks the rejection of a claim based only on a snippet. E07-AC05 checks that the owner's data is absent from the tools: only company and position data are allowed. E07-AC04 checks trying other public sources that were found when a single page is blocked. We do not open pages that require an account by logging in, and we do not wait for a login. A CAPTCHA/consent that blocks public work may require intervention.

The Chrome profile with cookies/cache is a removable working state after the confirmed end and the recording of materials. Activity or intervention keeps the same profile. E07-AC05 requires that cleanup of a finished profile does not remove evidence, conversations, events or reports and does not touch an active profile. Parking sessions and login only in backlog item 281, outside this release.

## Execution readiness after the review

The review of 2026-11-05 resolves the technical contracts, including headless Chrome in a container with private DevTools for manual intervention. The [qualification](../../kwalifikacja-runtime.md) defines the versions and safeguards and the evidence required before integration. There is no open choice of model, browser or quotas; the implementer checks that it works. A negative test blocks enabling; it does not authorise working around the criteria.
