# Personal job offer system — PRD

Status: **accepted**, 2026-10-31, as part of the [package acceptance](README.md#acceptance-history-and-change-in-the-way-of-working). Explicit open questions keep their status. No product implementation and no acceptance tests.

## Problem and audience

One owner needs to collect programming offers available to people working from Poland, assess them against their own profile and manage recruitments. They also need to know what a company builds, how it works and which technologies it uses, in order to choose offers deliberately and prepare for interviews. This is the owner's stated need, not the result of measuring time or researching the market.

The system is to combine these activities in a private tool. The data and history stay under the owner's control, on their computer, with the option of moving later to their own VPS. We do not plan for other users.

## Expected outcomes

- The owner browses all saved offers, understands the reasons for an assessment and sees missing data.
- They distinguish the AI recommendation from their own decision and from the recruitment stage.
- They use one company profile and the saved research for subsequent offers.
- They prepare for a specific interview based on sources, with facts distinguished from hypotheses and recommendations.
- They keep notes, dates, contacts and history even when an ad changes or disappears.
- They control spending on AI and search without losing access to data.

The evidence of the first version's usefulness will be going through a real process from import to recruitment and a joint review of 20 assessed offers. No target number of offers, time saving or percentage agreement of AI assessments with the owner's opinion was agreed. Detailed acceptance contract: [requirements, R-30](features/odbior/requirements.md#r-30--acceptance).

## Scope of the first version

1. A professional profile based on the CV, editable skills and experience, a separate career direction, preferences and must-have requirements.
2. One source: SOLID.Jobs through the official API. An initial import of the current scope, then daily and manual detection of new and changed ads.
3. Triage with an overall rating and components, a justification, a separate completeness and a history. A confirmed exclusion and an unknown have different meanings.
4. Basic research automatically after qualification; both research stages also manually, deep research on demand. Results attached to the company, preparation additionally to the offer/application.
5. Two browsing perspectives: an offer table with a details panel (prototype A) and a company view with research, technologies and offers (prototype C).
6. Manual decisions, tags, notes, contacts, applications, interviews, tasks, dates, archiving and history. In v1 no permanent deletion of data.
7. Budget control, a view of operations, errors and a summary in the application.

The first version covers this whole flow for one source. The order in which modules are built does not reduce the scope of acceptance.

## Typical flows

**Reviewing new offers.** After a fetch, the owner sorts the table by match, compares the rating with the completeness, opens the justification and makes their own decision. An offer with an unknown salary range remains available.

**Getting to know a company.** From an offer the owner goes to the company profile and reviews the research and technologies with their scope. They do not read information about another project as requirements of the position under consideration. Existing research is reused; a new report is created on demand.

**Preparing for an interview.** The owner records the application and the date, requests deep research and reviews topics to revise and questions. They can add information from a recruiter, stating where it came from.

**An ad changes or disappears.** The owner sees the current content and the change history. A material change triggers a reassessment within the budget. The disappearance of an ad does not end its application.

**No funds or an error.** The owner can still browse data and fetch free offers. They see the stopped stage, the reason and the option to resume; completed results remain available.

## Constraints and exclusions

- Starting budget: 100 PLN per calendar month in Polish time, AI and search combined, with no carry-over of unused amounts. VPS cost is separate. This is an application limit, not consent to a purchase.
- The needed parts of the profile/offers may be sent to an external AI; contact details from the CV are not part of the AI input.
- First acceptance on the owner's Mac. The schedule depends on the computer and runtime environment being available. Closing the browser does not stop the work.
- Private access, one account. On a VPS, access through an SSH tunnel is planned.
- Backups are made by another service. The application offers no schedule, retention or backup panel. Choosing that service and testing a restore are outside the scope of the application's acceptance.
- Outside the first version: further sources, a stage board (prototype B), notifications outside the application, automatic applying and contacting companies, a public service, support for other users.
- We do not reconstruct the history of ads from before the first fetch. We do not require a view of full past ad contents.

## Stages and unknowns

First the whole local flow for SOLID.Jobs is built, then it goes through acceptance. Later the VPS can be deployed separately and sources can be added one at a time after checking their interfaces and terms of use.

Before launch the owner will complete the profile, the filter values and the fetch time. Automatic research thresholds will be calibrated on the first assessments. Access to the chosen AI API, quality and real costs have not yet been checked on the account. We do not promise complete market coverage or recognition of every company.

Material clarifications that remain in the draft are collected in the [register of open decisions](open-decisions.md#open-decisions-and-readiness-conditions); they must not be implicitly replaced with default values.

## Sources and document responsibilities

The sources are the [original interview](../../product/ustalenia.md), the [glossary](../../../GLOSSARY.md), the [prototype](../../prototypes/przeglad/README.md) and the decision resolutions of the map „Droga do specyfikacji osobistego systemu ofert pracy” ("Road to the specification of the personal job offer system") (`bd show oferty-pracy-v4t`). Later owner's decisions replace earlier open or rejected proposals.

| Decision | Read it in Beads |
| --- | --- |
| Identity of offers, companies and recruitment history | `bd comments oferty-pracy-v4t.4` |
| Choice of the first source and fetch boundaries | `bd comments oferty-pracy-v4t.5` |
| Contract for assessment, research and cost control | `bd comments oferty-pracy-v4t.6` |
| Choice of execution and data storage architecture | `bd comments oferty-pracy-v4t.7` |
| Browsing offers and companies, and handling process stages | `bd comments oferty-pracy-v4t.8` |
| Readiness criteria of the first version for specification | `bd comments oferty-pracy-v4t.9` |

The PRD sets the goal and scope. Each feature has its own [requirements/solution-design pair](README.md#features): the requirements maintain its rules and criteria, and the SD its mechanisms and verification. The [shared architecture](architecture.md) describes only cross-cutting contracts. Beads stores the status of work and the history of decisions; it does not replace these documents.

## How the specification is developed

The PRD and the confirmed decisions set the basis of the project. The requirements/solution-design pairs exist as working drafts: we refine and review a specific pair before implementing the given feature, in the context of the current state of the application. We do not require a detailed design of all features before starting the first. Details: [work cycle](README.md#feature-work-cycle).

## Decision change: access without login — 2026-10-31

The owner withdrew the requirement for an account and a session: the personal tool works without login. Access remains private through loopback locally and an SSH tunnel on the VPS. Details of R-27 in the launch requirements.
