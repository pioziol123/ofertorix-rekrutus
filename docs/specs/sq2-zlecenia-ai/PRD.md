# AI assignments: lifecycle, budget and oversight — PRD

Beads epic: `oferty-pracy-sq2`. Details: [requirements](requirements.md), [solution design](solution-design.md). Terms follow the AI module section of the [glossary](../../../GLOSSARY.md#ai-module).

## Context

The application hands work to AI models and agents: preparing the professional profile, assessing offers, researching companies. The AI module runs that work, keeps it within a monthly budget and reports the outcome back. The owner redesigned the whole area from scratch in an interview on 18 November 2026; every earlier rule for it (from epic `oferty-pracy-334`, task `oferty-pracy-v4t.6`, requirement R-25 of the first version and the AI task panel PZ-01–PZ-08) was treated as a suggestion only. The decisions are recorded group by group (A–J) in the comments of the epic.

On 20 November 2026 the owner reconciled that design with the [background work epic](../2ba-praca-w-tle/PRD.md) (`oferty-pracy-2ba`), which is delivered first, and narrowed this epic to a first usable version. The comment of that day in the epic records which decisions of the interview changed; where the two differ, the later comment holds.

## Problem

- **The owner cannot oversee AI work.** There is no place to see what runs, what waits, what failed and what it cost. Work that ends in an unclear state can only be found and fixed in the database.
- **Retries and failures are each module's problem.** A module that asks for AI work has to track executions, retry them and interpret technical states itself, so the same rules are repeated, and differ, between modules.
- **The budget is fixed.** The monthly limit of 100 PLN can be changed only in the database, and there is no top-up.
- **A result nobody takes stays open.** When the module that asked for the work fails to take its result, the work stays unfinished with its money reserved until someone acts in the database.
- **Work can wait forever.** A result that arrives two weeks later may no longer make sense to the module that asked for it.

## Goal

- A module that needs AI work places an **assignment** and gets exactly one outcome when the assignment ends. Retries, waiting and failures are the AI module's concern.
- The owner sees every assignment, its operations and their cost in one panel, and decides about assignments that need attention: retry or reject.
- The owner controls the money: raises the current month's budget and sets the limit for the following months.
- An assignment holds back as little other work as possible: each executor carries out one operation at a time, executors work side by side, a missing budget only holds back the operations it does not cover, and every assignment ends within the time limit.
- The rules are the same for every executor; executors differ only in what they offer.

## What changes for the owner

- **AI tasks panel.** A list of assignments with those needing attention on top, the details of each with its operations, their costs and the cause of a failure, and a counter of assignments needing attention in the navigation.
- **Actions.** Retry and Reject on an assignment; changing the current and the default monthly limit.
- **Modules that ask for AI work** stop showing "waiting for budget" and other technical states; they show only whether their assignment is in progress, succeeded or failed.
- **Offer assessment.** Each offer is assessed by its own assignment, with an ordinary request instead of OpenAI's batch mode. An assessment costs about twice as much and returns within minutes instead of up to a day. Assessing 20 offers shows as 20 assignments in the panel; when the budget covers only some of them, those run and the rest wait for a top-up (owner's decision).
- **Existing AI history.** Only the budget moves into the new model: each month with its limit and charge, so the current month's figures stay right. The few earlier attempts (one month, under one złoty spent) stay in a read-only archive, and the panel's history starts empty (owner's decision).
- **AI work unfinished at the moment of deployment** is ended, and the module that asked for it requests it again; the system does not yet run in production (owner's decision).

## Out of scope

- The inner design of executors: the local executor's services and providers, and how a requesting module's preferences choose an executor and its parameters. They belong to epic `oferty-pracy-334`; today the choice stays fixed in code.
- The rules of the Companies and Matching modules for local AI (`oferty-pracy-rss`, `oferty-pracy-0dv`); they follow this epic.
- Parts of the interview's design the owner put off on 20 November 2026, kept in `oferty-pracy-sz5`:
  - an assignment for a batch of items, with its partial success and the Approve action (item 29);
  - several operations of one executor at the same time, and switching an executor on or off and changing its capacity in the panel (30);
  - automatic repeating of an interrupted operation (31);
  - a time limit chosen by the requesting module (32);
  - filters of the panel's list and viewing an executor's raw response (33);
  - a requesting module abandoning its assignment (34).
- Settling a cost the provider did not report: task `oferty-pracy-qld`. Until then such a cost stays charged to its month at the reserved amount, and the owner makes room with a top-up.
- Ideas the owner set aside earlier, kept in `oferty-pracy-sz5`: a delay between automatic retries (item 10), retrying a failed result delivery (11), deleting old AI data (12), bulk actions (13), correcting a settlement (14), notifications outside the application (15) and OpenAI's batch mode (16).
- Separate budgets per requesting module, priorities between assignments, and a shared capacity for several executors.

## Success

- A requesting module places an assignment and receives one outcome, with no knowledge of operations, retries or costs.
- An assignment that keeps failing reaches "needs attention", and the owner retries or rejects it from the panel without touching the database.
- After a top-up, an operation that waited for budget starts without any other action.
- No assignment stays unfinished past the time limit, whatever it waited for.
- The panel's monthly total equals the sum of the budget charges of the month's operations, before and after the migration.

## Constraints and dependencies

- The [background work epic](../2ba-praca-w-tle/PRD.md) (`oferty-pracy-2ba`) is delivered before this one. AI operations wait and are carried out through its shared way of requesting background work, and an interrupted operation is recognised the way that epic defines: the AI module keeps no waiting line and no supervision of its own.
- The epic is delivered as a whole; the old AI contract disappears together with the migration, and no old and new path run side by side (owner's decision).
- The architecture rules bind the design, in particular the shared contract for interchangeable executors.

## Stages

The epic is delivered as a whole; the tasks are small steps towards it, not separate releases. Stage 14 of the earlier division (executors in the panel) is put off with item 30 above, and its number is not reused.

| Stage | Task |
| --- | --- |
| A requesting module places an assignment and reads its status | [sq2.1](requirements.md#t1) |
| Executors behind a shared interface | [sq2.2](requirements.md#t2) |
| Operations start in order and within the budget | [sq2.3](requirements.md#t3) |
| Automatic retries and "needs attention" | [sq2.4](requirements.md#t4) |
| Interrupted operations | [sq2.5](requirements.md#t5) |
| One result delivery and the time limit | [sq2.6](requirements.md#t6) |
| Profile on the new contract | [sq2.7](requirements.md#t7) |
| Matching on the new contract | [sq2.8](requirements.md#t8) |
| Companies on the new contract | [sq2.9](requirements.md#t9) |
| Budget migration and removal of the old path | [sq2.10](requirements.md#t10) |
| AI tasks panel: list and details | [sq2.11](requirements.md#t11) |
| Retry and Reject | [sq2.12](requirements.md#t12) |
| Budget management | [sq2.13](requirements.md#t13) |
