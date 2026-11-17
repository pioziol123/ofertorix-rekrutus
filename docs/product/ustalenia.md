# Agreed product requirements

> **Historical material from the initial interview.** Later owner's decisions replaced, among other things, the open entries about the stack, the budget and backups. Current specification draft: [PRD → requirements → solution design](../specs/pierwsza-wersja/README.md). Do not read the old questions below as reopening closed decisions. An external service makes the backups, not the application.

The document records the requirements confirmed during the design interview. The owner confirmed the product scope and the move to the specification and technical design. The document is not yet a complete specification or a choice of technical architecture.

## Purpose

The system serves only the owner, with no support for other users. It helps to search for work, manage offers and recruitments and prepare for interviews.

The data is stored on the owner's computer or their VPS. The choice of where it runs remains open. Sending the needed parts of the profile, the offers and company information to an external AI is allowed, without the contact data from the CV and with cost control.

## Profile and offer collection

The profile is built from the CV, extended with preferences and exclusion criteria. The skills held and the direction of the search are separate pieces of information.

The process covers fetching all offers that meet broad baseline requirements, triage against the preferences, and then two stages of research. Triage assesses the detailed technology match. Missing information is an unknown.

The confirmed filtering dimensions are technologies, salary ranges, locations, contract types, working hours and seniority level. The specific filter values have not been given yet. Earlier findings also include the work mode as a baseline criterion.

## Filters and matching rules

The criteria for fetching offers, the preferences for match assessment and the filters for browsing saved data are separate. Changing a view filter does not change the fetch scope. A profile criterion can be a must-have requirement or a preference.

Besides the basic dimensions, the system takes into account:

- Work mode, including the number of days in the office.
- Geographic availability, including the possibility of working from Poland and the required work permit.
- Specialisation, e.g. backend, frontend, fullstack, platform or data.
- Working language and the required level.
- Time zone, required overlap hours and on-call duty.
- Company and project type, and preferred or excluded industries.
- Freshness: publication date, first detection date and the active/expired state.

The list of saved offers allows filtering by rating and its components, the status of the owner's decision, the recruitment stage, the research state, company, source and own tags.

Technology filters support any of the selected, all of the selected and excluded technologies. Technologies required in an offer are distinguished from optional ones.

Salaries take into account the currency, the settlement period and the basis of the amount, e.g. gross on an employment contract (UoP) or net on B2B. The owner decides whether to include offers without a salary range.

## Triage

AI proposes a 0–100 score, a justification, strengths, gaps and unknowns. The owner can correct the recommendation. The owner's decision is saved separately from the AI assessment.

All fetched offers stay available regardless of the triage result. Assessments can easily be browsed, sorted and filtered.

The overall score has explicit components: technologies, experience, conditions and preferences. The owner can change their weight. Data completeness is shown separately; missing data is not equated with failing to meet a requirement.

## Research

Basic research starts automatically for offers that qualify after triage. The qualification threshold will be set after looking at the first assessments. Deep research is started on demand. Both stages can be started manually for any company or offer.

Research covers the company's business, products and projects, working conditions and methods, technologies and risk signals. It contains sources, dates and a distinction between facts, opinions and unknowns. Information about a company is reused for its later offers.

Interview preparation refers to a specific position and to the team or project, if they are known. It points to topics to practise and questions for the recruiter, with a justification for the recommendation.

The result of deep research covers a description of the company and the project, a technology map, a prioritised list of topics to revise, suggested technical questions to practise and questions for the company. The suggested questions have a justified link to the position and are not presented as known questions from a real interview. The owner can add information from the recruiter to the preparation.

## Offers and companies

The system provides a full list of offers with sorting and filtering, a list of companies, offer details and company details. A company shows linked offers, research and technologies, in general and per offer.

The publishing company, the employing company and the client are separate roles, as far as the data allows them to be established. A client's technologies are not attributed to an intermediary as its own.

Technologies indicate their source and scope: a specific offer, another project of the company or a guess to be confirmed. A technology from another offer does not automatically become a requirement for the position under consideration.

## Recruitment management

The system covers the stages from a new offer, considering and planning an application, through sending the application and successive interviews, to a decision, with the option of rejection or withdrawal at every stage. It handles notes, deadlines, recruiter contacts and the change history. A recruitment may include many interviews and a recruitment assignment.

## Operation and automation

The main interface is a browser application, run on the owner's computer or a VPS. It provides tables, filters, details and recruitment management.

Fetching offers and triage run on a schedule, by default once a day, and on demand. Running on the computer depends on its availability; a VPS allows work independent of the owner's computer.

At the start, a summary is available in the application: new offers, the best matches, finished research, upcoming interviews and fetch errors. Notifications outside the application are outside the scope of the first version.

## Offer identity and history

The same offer from several portals is presented as one item with many sources. Uncertain similarities stay separate offers. Expired ads keep their history and notes. A temporary fetch error does not mean expiry.

After the profile changes, the fetched offers can be reassessed on demand. The assessment history and own decisions are kept.

## Budget

The system has a configurable spending limit for AI and research. Once it is reached, paid operations are paused, while fetching offers available for free and browsing the database keep working. Pending operations can be resumed after the budget is increased or renewed. The amount will be set before paid services are connected.

## Privacy and backups

The application is available only to the owner, also in the VPS variant. Automatic backups cover offers, the profile, research and the recruitment history. The backup storage location will be chosen when hosting is decided.

## Scope of the first version

The first working version supports one source and the whole process from fetching an offer to interview preparation. Further sources are added one at a time after the working system is running.

The interview has not yet settled the specific first source, the profile filter values, where it runs, the backup location, the budget amounts and periods or the detailed assessment weights. The choice of technical stack remains open.

## Constraints adopted at the start of wayfinding

The first source should deliver mainly offers available to people working from Poland, including remotely. The first run will take place on the owner's computer, with the option of moving the application and data to a VPS later. The choice of a specific technical stack is not imposed; the criterion is ease of maintenance.

The working design limit is 100 PLN per month for AI and research services, independent of any VPS cost. It needs a feasibility check and is not approval to buy services. The detailed assessment weights, the filter values and the backup storage location have not been settled yet.
