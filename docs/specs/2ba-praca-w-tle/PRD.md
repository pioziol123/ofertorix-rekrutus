# Background work — PRD

Beads epic: `oferty-pracy-2ba`. Details: [requirements](requirements.md), [solution design](solution-design.md). Owner's decisions: the notes of `oferty-pracy-2ba.1` (2026-11-19). Investigation: [queue behaviour and pg-boss semantics](../../research/kolejki-zachowania-2ba1.md), [queue alternatives](../../research/kolejki-alternatywy-pg-boss.md).

## Problem

The system does its slow work in the background: ad syncs, reading the text of an uploaded CV and AI assignments. Today nobody can say who is responsible for that work:

- the worker knows every module by name and wires each module's queue by hand;
- modules talk to the queue library directly, and the settings of a queue are written in three places;
- one minute-long cycle in the worker mixes requesting the daily ad sync, checking for stalled work and pushing work that waits for a budget or a provider;
- modules ask the queue whether their work is still alive, so a change to the queue changes the modules' rules.

Every new kind of background work, such as the AI assignments of the epic `oferty-pracy-sq2`, would add one more variant of this wiring.

## Goal

- One shared way to request background work and one worker that carries it out, the same for every module.
- A module describes its work and handles it; it does not know how the queue or the worker are built.
- Each module decides by itself whether its work has stalled, from its own data.
- Periodic work runs in its own process, separate from the worker.

## What changes for the owner

The application keeps doing the same work, with these exceptions:

- **Work unfinished at the moment of deployment is carried over.** Waiting and running ad syncs, CV readings and AI assignments continue in the new way.
- **An ad sync of a source that already has an unfinished sync is not created.** A manual sync requested while another sync of the same source waits or runs no longer runs after it.
- **Work whose last attempt failed always ends, also when the worker died.** An ad sync ends as partial or failed, a CV asks for its text to be pasted, an AI assignment ends as uncertain; nothing stays in progress.
- **Reading a CV is retried once** when the process reading it is lost; only then does the owner see the request to paste the CV text.
- **An AI assignment whose process was lost** ends as uncertain without a stated cause, also on the local model; a paid one keeps its reserved amount in the budget until the owner settles the cost.
- **The worker carries out at most a set number of jobs at once** (by default two), whatever their kind.

## Out of scope

- Waiting for a budget or for a portal's turn.
- Running several syncs of one source at the same time (collection task `oferty-pracy-sz5`, item 19).
- The lifecycle of AI assignments: epic `oferty-pracy-sq2`.
- Separating the catalogue of sources from the code that fetches from them.

## Success

- After the epic, the application passes all quality checks, and the owner on `main` checks ad syncs, CV import, match assessments and company research.
- Adding a new kind of background work changes only the module that owns it and the queue configuration.
- No module asks the queue about the state of its work.

## Stages

| Stage | Tasks |
| --- | --- |
| Queue and worker libraries | [2ba.1](requirements.md#b1) |
| Modules on the libraries | [2ba.4](requirements.md#b4) (Profile), [2ba.5](requirements.md#b5) (Sources), [2ba.6](requirements.md#b6) (AI, periodic work in its own process, removes the old path) |
