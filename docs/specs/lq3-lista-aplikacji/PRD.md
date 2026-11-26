# Applications list — PRD

Beads epic: `oferty-pracy-lq3`. Details: [requirements](requirements.md), [solution design](solution-design.md). Terms follow the [glossary](../../../GLOSSARY.md).

## Context

The owner shaped this scope in a conversation on 22–26 November 2026. It is the first slice of the Recruitments module planned in the [first version's recruitment draft](../pierwsza-wersja/features/rekrutacje/requirements.md). For the behaviour it covers, this epic replaces that draft; the draft's later parts (interviews, contacts, recruitment tasks, the stages after the CV is sent) stay a draft.

## Problem

- **The owner cannot keep a personal shortlist.** The offer list shows every fetched offer. The owner has no way to mark the offers they want to come back to.
- **The owner cannot record where they sent a CV.** Which companies already have the owner's CV, and which turned the owner down or were turned down by the owner, lives outside the application.

## Goal

- The owner keeps a private list of offers and sees at a glance where each one stands: to consider, CV sent or rejected.
- The owner finds these offers both on their own list and on the offer list.

## What changes for the owner

- An offer can have an **application**. Its stage is one of: to consider, CV sent, rejected, removed from the list.
- **Rejected** covers both a company turning the owner down and the owner giving up; the owner writes who and why in the note.
- The application has one free-text **note**, editable at any stage, also after rejection.
- The date of a stage is the moment the owner moved the application into it. The owner never picks a date.
- A mistaken step is undone by choosing an earlier stage; from rejected the owner chooses which stage to return to.
- Offer details show the application's stage in a stage field that moves it, and a link to the application details. They do not show the note.
- A new page **Moja lista** lists the offers with an application, active ones by default, paged like the page Synchronizacje.
- **Application details** open from Moja lista: the offer's title, company and salary range, the stage field, the note and the history of stages.
- The offer list shows an icon of the stage at each offer with an application, and gets a multi-select filter by stage.

## Out of scope

- A second application for the same offer after the first ended; wait in the collection task `oferty-pracy-sz5`.
- The channel the CV was sent through. This reverses the earlier decision that an application records the sending channel (decision `oferty-pracy-v4t.4`, recruitment draft R-22).
- Moving the offer list's own paging to the shared paging; waits in `oferty-pracy-sz5`.
- A history of the note: saving the note overwrites it. This is a deliberate exception to the principle that nothing is lost.
- Interviews, contacts, recruitment tasks, the stages after the CV is sent, and the outcomes hired and offer declined.

## Risks

- **Offers are not grouped yet.** Today each ad is its own offer, so an application belongs to one ad. When grouping arrives, applications must move to the grouped offer.

## Success

- The owner saves an offer, sends a CV, rejects it, undoes a mistake and edits the note, and after a restart sees the same stages, dates, history and note.
- Moja lista shows the active applications by default, sorted from the most recently changed.
- The offer list filtered by one or more stages shows only the offers in those stages.

## Stages

1. The application in offer details: the Recruitments module, stages, transitions and their history (`oferty-pracy-lq3.1`).
2. The page Moja lista and the application details with the note and the history (`oferty-pracy-lq3.2`, after 1 and after the paging of the page Synchronizacje, `oferty-pracy-nq3.1`).
3. The stage on the offer list: icon and filter (`oferty-pracy-lq3.3`, after 1 and after `oferty-pracy-nq3.1`, whose multi-choice filter it reuses).

## Constraints and dependencies

- An offer has at most one application.
- Every stage change is kept; nothing deletes an application or its stage changes.
