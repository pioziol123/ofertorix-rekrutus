# Job offer system — what it is and what it does

**In short.** This is an application for a programmer looking for a job. It collects job offers from many portals, assesses how well they fit the user, gathers knowledge about companies, and tracks recruitments from the decision to apply to the outcome. The data and its history stay under the user's control. This document explains what the system does and which principles guide it.

## The problem it solves

A programmer looking for a job browses many portals separately and judges on their own whether an offer fits. They research companies on their own. Notes, dates and the history of conversations end up in different places, and a job ad can disappear from a portal in the middle of a recruitment.

The system brings these activities together in one tool:

- it collects offers from many sources in one place,
- it tells how well an offer fits the user and why,
- it gathers information about companies,
- it keeps the user's decisions and the course of each recruitment, even when the ad disappears.

AI does part of this work.

## Terms the rest depends on

| Term                         | Meaning in this system                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Job ad**                   | A single listing on a single portal.                                                                                                         |
| **Job offer**                | A position the user is considering. One offer can have several ads when the same job is published on several portals.                        |
| **Professional profile**     | A description of the user: what they know and have done, which direction they want to grow in, and what they expect from a job, split into must-haves and preferences. |
| **Match assessment**         | The answer to the question how well an offer fits the profile, and why.                                                                      |
| **Completeness**             | How much of the assessment could be established from the available data. A good assessment with low completeness means "good, but based on little data". |
| **Unknown**                  | Information that is missing. An ad without a salary range is not "bad", only unknown.                                                        |
| **Research**                 | A report about a company: what it does, what it works on, how it works, which technologies it uses and what risks are visible, with sources. |
| **Recruitment (application)** | The course of applying for a specific job: stages, interviews, tasks, contacts, notes and the outcome.                                      |

## How the system is used

1. **Profile.** The user creates their professional profile. They can fill it in by importing a CV.
2. **Offers.** The system collects ads from portals and tracks their changes. Ads for the same job from different portals form one offer.
3. **Assessment.** The system assesses offers against the profile and explains the assessment. The user can correct it.
4. **Companies.** Every offer is linked to a company. The system prepares research on the company, which all of its offers use.
5. **Recruitment.** The user decides where to apply and takes the recruitment through its stages to the outcome. Before an interview, the system helps the user prepare for it.

## Principles that apply across the system

- **Missing data is not a mismatch.** An unknown alone never rejects an offer. When portals give conflicting data, the system shows both versions instead of silently picking one.
- **AI proposes, the user decides.** An AI assessment is not the user's decision. The profile changes only when the user confirms it.
- **Nothing is lost.** The system does not delete data. Changes to ads, assessments, the profile, reports and the course of recruitments all have their history.
- **A disappearing ad ends nothing.** An ad that disappeared from its portal stays in the system together with its assessments, notes and recruitment.
- **Company information is not an offer requirement.** What a company uses in other projects does not become a requirement of this position. An agency is not confused with its client.
- **Costs and data under control.** Spending on paid services has a limit. The user's data does not go where it is not needed.

## Where offers come from

The system collects ads from Polish and international job portals for programmers. It considers foreign offers when the work can be done remotely from Poland.

## What the system does not do

- It does not apply on the user's behalf and does not contact companies.
- It does not send notifications outside the application.
- It does not promise to see every offer on the market or to recognise every company.

## Summary

The system brings order to a job search: it collects offers, assesses them against the profile with an explicit justification, gathers knowledge about companies and tracks recruitments to the end. Unknowns stay visible, decisions belong to the user, and history is never lost.
