# Cheaper return to returned tasks — PRD

Beads epic: `oferty-pracy-5yd`. The runner's current flow is described in the process contract, which the project's agent instructions name.

## Context

The runner takes ready tasks and has an agent implement each without the owner. When a task cannot be finished, the runner returns it to preparation; the owner settles the cause and hands the task off again. The problem comes from the owner (conversation of 18 November 2026) and from the runs of tasks `oferty-pracy-0mq.9` and `oferty-pracy-0mq.14` on 17 November 2026.

## Problem

A returned task starts again from nothing. The agent reads every document again and writes the same code again, although the earlier work is kept on GitHub. An attempt takes 40 to 60 minutes, so every return costs about an hour of the agent's work and the owner's waiting.

- **Returns that need no owner.** On 17 November an attempt of `0mq.9` ended on a failure of the sandbox's environment, not of the task. The task went back to the owner, who could only hand it off again.
- **Rounds spent on what the agent cannot fix.** The reviewer reports, in one list, defects the agent can fix and questions only the owner can settle. In `0mq.9` the agent spent three rounds, about 40 minutes, on a finding that needed the owner's confirmation, and the task returned anyway.
- **Rounds spent on a check the gate skips.** The criterion every task repeats requires formatted code. The automated checks before the review do not check formatting, so the reviewer fails the task for it and a round is lost.
- **Questions come late.** An agent meets a conflict in the documents that needs the owner after it has written most of the code, not when it reads the documents.

## Goal

- A returned task continues from the work already done: its code, and a record of what is done, what remains and what was decided.
- A failure of the environment does not return the task; the runner tries again by itself.
- A question only the owner can answer returns the task at once, without spending correction rounds.
- The agent asks the owner as early as possible.
- The automated checks catch everything of the shared criteria a script can check, before the review.
- The agent stops only for what cannot be undone by changing code. Any other open question it settles itself, from the documents and the code, as an assumption the owner confirms later or as a deviation with a follow-up; later tasks of the epic know the open assumptions and build on them knowingly.

## What changes for the owner

- **Answering a returned task.** The owner answers in a comment on the task or by changing its documents, then hands it off again, as today. The next attempt receives the answer and the earlier work.
- **Fewer returns.** Failures of the environment and formatting no longer reach the owner.
- **Earlier questions.** A return with a question comes after minutes of reading rather than an hour of implementing.
- **Fewer questions, more to confirm.** More decisions reach the owner as assumptions to confirm after the fact instead of questions before it. Each is a separate item to confirm or reject; a rejected one becomes a change task covering every place of the code that relies on it.
- **Answering through the owner's agent.** The owner discusses a returned task with their own agent, which records the decision, publishes changed documents and hands the task back.

## Out of scope

- Keeping the agent's sandbox alive while a task waits for the owner (owner's decision: the sandbox is rebuilt; what matters survives outside it).
- Resuming the earlier agent's conversation after a return (owner's decision, 18 November 2026: a new agent with the code and a record of the task's state costs less than reloading a conversation of 125–420 thousand tokens).
- Moving the agent's skills into the repository (owner's decision: they stay with the owner; a change to them is made by hand).

## Success

- A task returned with a question and handed off again ends delivered, and its second attempt takes clearly less than the first.
- A failure of the sandbox's environment during a task ends without a return when a retry succeeds.
- A finding that needs the owner returns the task without a correction round.

## Stages

| Stage | Task |
| --- | --- |
| The gate checks formatting of the task's changes | [FMT](requirements.md#fmt), small lane |
| A returned task continues the kept work | [CON](requirements.md#con) |
| Retry after a failure of the environment | [ENV](requirements.md#env) |
| The reviewer separates corrections from the owner's decisions | [REV](requirements.md#rev) |
| Agents take reversible decisions themselves and know the epic's assumptions | [AUT](requirements.md#aut) |
| The agents' skills: early questions, the state note, answering a returned task | by hand, outside the repository |
