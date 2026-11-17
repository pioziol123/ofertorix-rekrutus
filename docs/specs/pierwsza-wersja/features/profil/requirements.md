# Professional profile and criteria — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **refined scope of the current stage, for review**, 2026-11-01. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-01, R-02 and their ACs. Related: [matching](../dopasowanie/requirements.md), [fetching](../pobieranie/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-01 — professional profile

The profile is created based on the CV and can be completed and corrected. It separates the skills/experience the owner has from the career direction, preferences and must-have requirements. It keeps the versions used for assessments. The owner can upload a CV as PDF or DOCX, or paste text. The system creates a profile proposal, which the owner reviews, corrects and approves before the first assessment of offers. Preferences and the development direction are completed separately.

**AC-01:** after the profile is corrected, a new assessment points to the new version, and the previous one still points to its input state. A technology missing from the CV is an unknown, not a confirmation of not knowing it. The owner can reassess saved offers on demand. PDF import, DOCX import and pasting text lead to an editable profile proposal. Before it is approved automatic triage does not start; after approval it uses the indicated version. Skills and experience are not equated with preferences. At the start PDFs with a text layer and DOCX are supported, with no OCR of scans. When the text cannot be read, the application reports the problem and allows pasting it. A re-import creates a proposal of changes to compare and approve, keeping the current active profile and the manually entered preferences; the upload alone does not overwrite the active version.


#### Form for completing the profile (Q5)

Regardless of the CV, the owner goes through the form section by section:

- Search goal: positions, development direction, technologies to learn, type of company and project.
- Conditions: pay with currency and basis, contract, location, work mode and days in the office, working hours, language, time zone and on-call duty.
- Importance of expectations: must-have, preferred or does not matter, and explicit exclusions.
- Supplementing experience: skills and projects left out of the CV.

A question can be skipped and returned to later. A skipped field is an unknown; an explicit "does not matter" is a deliberate absence of a constraint. The system does not derive requirements, e.g. expected pay, from the current job. All sections are editable; a summary is available before approval.

**Additional AC-01 conditions:** the owner can add expectations that are not in the CV, distinguish must-haves from preferences and record an exclusion. Skipping a question does not enter a default answer and does not block completing it later. The summary shows deliberately chosen expectations and unknowns separately. A re-import of the CV does not remove them and does not activate unapproved changes.

### R-02 — three kinds of criteria

Baseline requirements set the fetch scope; preferences and must-have requirements serve matching; view filters apply to the saved database. Source filters may be used only when their meaning matches; the others are checked locally.

**AC-02:** changing a table filter does not change the import scope or the profile. If the API cannot express a given criterion without losing offers with an unknown value, local qualification keeps such offers and marks the unknown. A scope change is not evidence that previously saved ads are unavailable.

## Open questions

O-01 settled for the product (Q1–Q5). What remains is the configuration of values in O-05 and the technical choice of extraction/limits in O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.

## Current stage: profile before assessments — 2026-11-01

The owner chose the profile as the next stage after the importer and the list. The confirmed decisions above remain current. Refining this slice does not yet start triage, research or a change of the PHP Senior scope in the importer.

Proposed screen flow: professional data → expectations → summary and approval. Data can be saved as a draft and completed in stages. The active approved version stays separate from the draft. The first profile can be completed manually; CV import is a way of preparing a proposal of the same data, not a condition of having a CV with all the answers.

Split of information for the form design:

| Part | Content |
| --- | --- |
| Experience | Roles, periods, scope of responsibility, projects and achievements; technologies in the context of how they were used. |
| Skills | Technologies with an optional proficiency level, approximate length of experience, last use and a description of how they were applied (confirmed 2026-11-01). |
| Direction | Sought roles and seniority, technologies to develop, preferred type of work/project; they do not change the experience the owner has. |
| Conditions and exclusions | Pay, contract, location, work mode and hours and the other agreed criteria; each can be must-have, preferred, indifferent or not filled in. |
| Summary | Proposals from the CV, the owner's corrections, known expectations and unknowns, saving the draft and explicit approval. |

### Confirmed clarifications — 2026-11-01

- Each technology has a name and, optionally: proficiency level, approximate length of experience, last use and a short description of how it was applied. We do not interpret the mere presence of a technology in the CV as a level of proficiency. Length of experience is not automatically the sum of overlapping projects.
- The financial expectation has **one minimum for the chosen contract**, with an explicit currency, period and amount basis. We do not create separate concurrent B2B/UoP minimums. This is a choice about the profile; an offer can still contain several pay variants and is compared with the right variant.

Additional AC-01: a technology name alone can be saved without a forced level/years. The approved version keeps the one indicated minimum and contract; a contract change requires reviewing the related amount conditions, without automatic net/gross conversion.

The details of import, storage and the boundaries of the AI call are described in the current solution design; the configuration and a control trial of the provider remain a condition for activating paid work. On 2026-11-01 the owner confirmed keeping the original CV file locally. The file is linked to the import and can be returned to; a re-import does not replace the previous file. Approved profile versions keep a pointer to the source import if they were created from a CV. For pasted text we keep the input text instead of a file.

Additional AC-01 about the CV: after an import the unchanged original can be downloaded; recreating the containers while keeping the volumes does not remove the CV. Importing another file keeps the earlier document and the links of profile versions. A read error does not overwrite the active profile; the user can go back to the source and use pasting the text.

## Behaviour with missing configuration and on errors

Without configured AI the profile can be completed and approved manually, and the CV can be read and downloaded locally. Preparing a proposal reports missing configuration/funds or an error; it does not pretend a profile was prepared. An import error and an incomplete model response do not change the active version. A re-import does not remove data the model did not find; the owner chooses the changes after comparing the proposal with the existing data. An old result does not overwrite later manual corrections.

An incomplete profile can be approved with explicit unknowns. The form does not force answers to all questions; it does check the consistency of the values entered (e.g. an amount with a contract/currency/period/basis). Two tabs cannot overwrite a newer save without a message. A repeated approval of the same operation does not create a duplicate version.

A minimal launch of the AI import requires cost control in line with R-25; this is a dependency of this stage, without building the whole research and assessments now. The file size/read time limits are set by the solution design; exceeding them gives a clear message and the option to complete manually, without silently truncating the input.
