# Runner independent of the owner's working copy — PRD

Beads epic: `oferty-pracy-uuk`. Details: [requirements](requirements.md), [solution design](solution-design.md). The runner's current flow is described in the [process contract](../../agents/implementation-workflow.md).

## Context

The runner is the program that, without the owner taking part, picks up ready tasks, hands them to agents, checks the result and merges it into `main`. The problem and the requirements come from the owner (conversation of 17 November 2026) and from the run of task `oferty-pracy-0mq.5` on 16 November 2026.

## Problem

The owner and the runner work on one shared copy of the project. The runner delivers finished work straight into the copy the owner writes in.

- **They block each other.** While the owner has uncommitted changes in the project, the runner takes no tasks and waits. Its message does not say which files block it.
- **The owner's work invalidates the agent's work.** When the owner commits during a task, the runner abandons the task even though the agent finished it, and takes the owner's commit back out of the history. On 16 November one commit with a specification cost the return of a finished task and an hour of waiting.
- **No isolation.** The agent works in a closed environment but can change the owner's branches. The runner notices the change afterwards and cannot tell the owner's change from the agent's.
- **The arrangement cannot grow.** One shared copy rules out several agents at once and a runner outside the owner's computer.

## Goal

- The owner works in their copy of the project without restrictions, also while an agent's task is running.
- The runner and the agents neither read nor change the owner's copy of the project.
- Code and documents pass between the owner and the runner only through `main` on GitHub.
- A change of `main` during a task is an ordinary event: the runner adds the agent's work on top of it, repeats the checks and delivers the result.
- After handing a task off, the owner takes part in the process only when the agent reports a problem to clarify, as today.
- The way work is delivered needs no change when several agents finish independent tasks one after another.
- Moving the runner off the owner's computer means changing settings and single elements, not designing the process again.

## What changes for the owner

- **Handing a task off.** The runner sees a specification only after it is pushed to GitHub. Task preparation makes sure that a task marked ready has all its documents on GitHub in their current version.
- **Receiving work.** Finished work lands on `main` on GitHub. The owner pulls it into their copy when they choose.
- **Publication.** The runner pushes `main` itself. The earlier rule that only the owner pushes `main`, after checking the deviations, no longer applies (owner's decision).
- **Conflicting changes.** When the agent's work collides with a newer state of `main`, the agent resolves it first. The task goes back to the owner only when the agent fails.
- **Tasks** stay in one local database of the owner. The runner uses it directly.

## Out of scope

- Running several agents at once. The epic prepares the process for it, but the runner still runs one task at a time.
- Running the runner outside the owner's computer.
- Sharing the task database between several machines. The separate task `oferty-pracy-r03` investigates how to synchronise it.
- Changes to how an agent implements a task and how it settles specification conflicts.

## Success

- The owner commits and leaves uncommitted changes while an agent's task is running, and the task ends with a merge.
- After a finished task the owner's copy of the project is in the state the owner left it in.
- Two independent changes delivered one after another both reach `main`, without the owner taking part.

## Constraints and dependencies

- The exchange point is the project's repository on GitHub (owner's decision).
- The agent gets no access to GitHub. Only the runner pushes.
- The task database stays local. Sharing it between several machines is a precondition for working outside the owner's computer, and task `oferty-pracy-r03` investigates it.

## Stages

| Stage | Task |
| --- | --- |
| A ready task has its documents on GitHub | [uuk.1](requirements.md#u1) |
| The runner in its own copy, exchange through GitHub | [uuk.2](requirements.md#u2) |
| A change of `main` during a task does not invalidate the agent's work | [uuk.3](requirements.md#u3) |
| Tasks independent of each other | [uuk.4](requirements.md#u4) |
