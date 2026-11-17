# Companies, research and interview preparation — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-15, R-16, R-17, R-18, R-19 and their ACs. Related: [matching](../dopasowanie/requirements.md), [offers](../oferty/requirements.md), [operations](../operacje/requirements.md), [recruitments](../rekrutacje/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-15 — identity and roles of organisations

The publishing company, the employing company and the client are separate roles. Separate entities can share a brand/group. A shared name or domain is not enough to merge them; when only the brand is known we do not guess the company.

**AC-15:** for an agency with an undisclosed client the screen shows an unknown client and does not assign the project's technologies to the agency. Two companies keep separate profiles and research despite a shared domain. An unconfirmed identification is explicit; it does not silently use another company's report. When only a brand or an agency is known, research of the available entity is not blocked: the report clearly states whom it concerns, and the employer and client roles may stay unestablished. It does not present information about the agency as information about the unknown client, or the brand as a confirmed company.

### R-16 — basic research

An automatic request requires a configurable rating and completeness threshold and no confirmed conflict with must-have requirements. The report belongs to the company profile. An existing report is reused without a TTL and without automatic repetition for the next offer.

**AC-16:** the first qualifying offer requests research; the next one of the same established company uses the report, even after a long time. Two concurrent requests do not create two automatic studies. An offer below the threshold stays available and allows manual research. The thresholds will be chosen after a sample; no specific values are currently assumed.

### R-17 — research on demand and versions

Both stages can be started manually; deep research only on demand. A new report becomes current for its stage, the previous ones are available. There is no automatic repetition of completed research. Preparation additionally has a link to the offer/application and the known project.

**AC-17:** a manual refresh of basic research does not remove deep research or past versions; a refresh error leaves the previous completed report. A new offer does not start a new company research, but can use it in a separate preparation.

### R-18 — content, evidence and scope of research

Research covers the company, products/projects, working methods and conditions, technologies and risk signals. Material findings have sources and dates; facts, opinions, hypotheses, unknowns and recommendations are distinguished. Provenance and scope relate to the organisation/project/offer. Citations in a saved report are visible and clickable. Persisting fragments of other people's content without an established basis is not required.

**AC-18:** every material claim presented as a fact has linked evidence; a list of visited pages alone is not enough. Information from another offer does not become a requirement of this offer. A source from a search result alone is distinguishable from a page that was read. The absence of reliable information is an allowed explicit result. A hypothesis or an opinion is not presented as a confirmed fact.

### R-19 — interview preparation

The preparation contains the company/project context, a technology map, revision priorities, technical questions to practise and questions for the company, with a justification of their link to the position and the profile gaps.

**AC-19:** the owner sees what to learn for the chosen offer and why. Practice questions are marked as proposals, without claiming they will come up in the interview. Manual information with the source "rekruter" ("recruiter") supplements the preparation through the same mechanism as any other source note.

## Open questions

Related: O-03, O-05, O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.

## Stage F1 — company profiles, 2026-11-04

Implementation scope: durable profiles, manual role assignments, a list and details, technologies from ads. Basis: R-15 and R-18 and the owner's instruction to continue after assessments. Automatic research, reports and preparation remain further stages; the open thresholds for starting them do not block F1.

- **AC-F1:** the owner creates a profile as an organisation, a brand or an entity of unestablished identity. The name, an optional website and a description are not an automatic confirmation of a company. Profiles with the same name/domain stay separate.
- **AC-F2:** the list allows searching and sorting; the details show all assigned ads and their roles. Publisher, employer and client are separate links; an absence is marked explicitly.
- **AC-F3:** from an offer you can create a profile or choose an existing one and assign a role with a justification. A suggestion of a matching name is not an assignment. A change of the ad's current content does not change confirmed links.
- **AC-F4:** assigning or unassigning saves history with a justification and a date. One ad has at most one profile in a given role. A conflict from a concurrent change requires a reload, and repeating the same command does not duplicate the profile or the history.
- **AC-F5:** technologies from ads point to the specific offer and required/optional/unknown. The aggregated list is described as technologies from linked offers, without claiming the company uses them internally. The company's direct stack stays unestablished, especially for an agency and an unknown client. We do not run AI or paid research in F1.

## Stage F2 — manual basic research, 2026-11-04

Implemented scope of R-17 and R-18 and the manual part of R-16. Automation thresholds and deep research remain later stages.

- **AC-F6:** the owner starts a study from the exact company profile. Before the request they see the maximum reservation from the shared AI budget. The company's name, kind, website and description go to the service; the professional profile and the CV are not sent. Missing configuration prevents a paid request.
- **AC-F7:** coming back and a regular start reuse a ready report. A refresh is a separate explicit action. Concurrent requests return one operation; repeating the command does not generate a new cost. No budget leaves the request pending.
- **AC-F8:** the report covers the business, projects, work, technologies and risks, with explicit unknowns. Findings distinguish fact/opinion/hypothesis/unknown/recommendation and the scope company/project/offer. Facts and opinions have sources linked to the content, URL, date and a marker of search result or page read. Source evidence does not mean independent verification of the truth of the publisher's statements. We do not guess the company or the client's technologies.
- **AC-F9:** further completed reports keep their versions. An error or an interruption does not remove the existing report. An uncertain cost stays reserved; we do not automatically retry a paid attempt. The UI shows the state and history, and the sources are clickable.
