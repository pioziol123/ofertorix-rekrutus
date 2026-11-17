# Module architecture — PRD

Beads epic: `oferty-pracy-0mq`. Details: [requirements](requirements.md), [solution design](solution-design.md). Agreed module split: [module map](../../architecture/moduly.md) and [architecture rules](../../architecture/moduly-i-zasady-kodu.md).

## Problem

The system is developed by the owner and coding agents. The module split is agreed, but the code does not reflect it:

- modules use other modules' data directly;
- each offer source has its own copy of the fetch process, so the rules differ between sources by accident;
- changes made by several modules cannot be saved together;
- the professional profile knows the details of AI providers.

As a result, every change to a source, an AI provider or a business rule needs fixes in many places. This raises the risk of errors and the cost of the work.

## Goal

- Each module owns its data and rules. The rest of the system uses it only through its public operations.
- All offer sources are fetched by one process and under one set of rules, whatever starts the fetch.
- An operation that spans several modules is saved in full or not at all.
- Modules that request AI work do not know the details of the providers.

## What changes for the owner

The application works as before, with a few exceptions:

- **Source sync** has the same rules for all sources and all ways of starting it. One source fetches one scope at a time. Further requests wait in a queue without duplicates, and fetching again on the same day is allowed.
- **The schedule** fetches data every day, even when the owner started a fetch manually on the same day.
- **Pending runs** at the moment the new queue is deployed must be requested again.
- **A repeated ad** does not stop the fetch.
- **Ad unavailability** after a full check of a scope follows from the history of which scopes the ad was seen in.
- **Background jobs** other than source sync (assessments, CV import, company research) do not detect interrupted work until the separate task `oferty-pracy-0mq.15`. This change is knowingly accepted.

## Out of scope

- Moving the application's views.
- Grouping ads into job offers.
- New guarantees for handling and settling AI jobs. They belong to the epic `oferty-pracy-sq2`.
- Protecting background jobs against interrupted work: task `oferty-pracy-0mq.15`.

## Success

- After each task of the epic, the application works and passes all quality checks.
- On `main`, the owner checks the offer list and offer details, source sync, CV import, match assessments and company research.
- Adding a new offer source or AI provider needs no changes in the other modules.

## Stages

| Stage | Tasks |
| --- | --- |
| Shared data access | [0mq.13](requirements.md#a13) |
| One source sync process | [0mq.1](requirements.md#a1), [0mq.2](requirements.md#a2), [0mq.3](requirements.md#a3), [0mq.4](requirements.md#a4), [0mq.5](requirements.md#a5), [0mq.19](requirements.md#a19), [0mq.16](requirements.md#a16), [0mq.7](requirements.md#a7) |
| Offers and Profile modules with public reads | [0mq.8](requirements.md#a8), [0mq.6](requirements.md#a6), [0mq.10](requirements.md#a10) |
| AI module with a general contract | [0mq.14](requirements.md#a14), [0mq.9](requirements.md#a9), [0mq.11](requirements.md#a11), [0mq.17](requirements.md#a17) |
| Removing workarounds and target directories | [0mq.18](requirements.md#a18), [0mq.12](requirements.md#a12) |

This epic takes over stages 1–4 of the epic `oferty-pracy-334` (tasks `334.2`–`334.5`).
