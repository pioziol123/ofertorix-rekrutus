# Why agents lose the goal, block and misread task context

Sources as of: **2026-11-17**. This covers 64 Claude Code conversations in this project from 15 to 17 November 2026, every runner log in `.sandcastle/logs/` (37 files), and the bd comments on the tasks of epic `oferty-pracy-0mq`. It also covers the runner's prompts in `.sandcastle/flow.ts` and the `implement-task` skill. Findings describe the state of the process at that time; some causes were already addressed on 16–17 November, as noted below. This is material for decisions and changes nothing by itself.

## Outcome of epic 0mq under the runner

| Measure | Value |
| --- | --- |
| Tasks the runner took | 10 (0mq.13, .1, .2, .3, .4, .5, .6, .7, .8, .10) |
| Delivered to `main` by the runner | 8 |
| Of those, closed with assumptions | 5 (.1 with 4, .2, .3 with 2, .8, .10) |
| Review verdicts `fail` | 7 in 5 tasks (.6 three times) |
| Finished `blocked` by the agent | 1 (0mq.5, completed by hand by the owner) |
| Returned by the runner's checks | 1 (0mq.6, deviation rejected) |
| Returned although the work was sound | 3 (`main` changed by the owner or a bd export) |

## Causes, most expensive first

### 1. The task does not say which of today's behaviours must be kept

In refactors described as "no change in behaviour" the agent changed what the application does today:

- Himalayas dropped a run's diagnostic data after a failed batch write.
- SOLID.Jobs lost the 1 s gap between requests on retry.
- A second Himalayas CLI run interrupted one already in progress.
- The meaning of the `pages` column changed.

This happened in 0mq.1, 0mq.5 and 0mq.6.

- **Missing:** shared criterion W-AC02 ("the application behaves as before") is too general for an agent to check. No document listed each source's current observable behaviour. No characterization tests pinned that behaviour before the refactor.
- **Where it belongs:** the solution design of a refactor should list the behaviours to keep per source. Preparation should require that list when a task is a refactor.

### 2. Edge cases without a specified outcome

This is the most frequent source of assumptions and review failures, seen in five tasks:

- **0mq.3:** a queued run is started while another run of the same scope is still running.
- **0mq.10:** the point in an operation at which Matching reads the active profile version.
- **0mq.10:** the connection pool limit of 5, which no document named.
- **0mq.2:** the error raised for an unknown connector name.

- **Missing:** the readiness item "contracts stated exactly enough to implement without guessing" does not force concurrency, resource limits or degenerate input to be specified.

### 3. Tasks of one epic contradict each other; unconfirmed assumptions become "existing behaviour"

0mq.1 recorded assumptions ASM-2 and ASM-4. 0mq.5 then met them as existing behaviour and blocked on A5-R03 against A1-AC05, both load-bearing. The 0mq.1 reviewer had predicted this ("better to decide this now than have 0mq.5 run into it"). The owner confirmed the assumption only after the block. In 0mq.6 the solution design's types contradicted A6-AC02, which led to new requirement A6-R07.

- **Missing:** the runner's prompt passes the epic's load-bearing requirements and open follow-ups, but not the unconfirmed assumptions of earlier tasks. The assumptions triage task holds nothing back. Nobody checks at epic hand-off whether criteria that an earlier task pins with tests agree with the rules of later tasks.

### 4. Decisions without a recorded reason; some live only in chat

- Rule F2-07 (queue behind a running run), Himalayas `pageSize 20` and the 1 h limit had no recorded reason. Agents could not judge whether they may be relaxed and guessed. In one conversation an agent invented a reason ("the library reverts the status").
- Decision F6 existed only in conversation history.
- An agent's question stayed in a bd description with no recorded answer when the task went back to `ready-for-agent`.
- **Missing:** a rule that a decision made in conversation goes into the document and into every task it affects. The record of discarded options was added on 16 November, so older decisions still lack reasons.

### 5. The agent knows the process but applies it only after review

Five of seven `fail` verdicts were failures to apply rules the agent already had:

- assumptions without a test of their case (0mq.1, 0mq.6);
- precedence applied backwards (0mq.5 ASM-3);
- an "assumption" that changes today's behaviour or leaves a criterion unmet (0mq.5 ASM-4, 0mq.6 ASM-1);
- a solution-design decision skipped (0mq.10 kept the row lock that decision 6 removes);
- a false technical premise (0mq.10 ASM-1).

One feedback round fixed each.

- **Missing:** a self-check step in `implement-task` before the result file: a test per assumption, direction of precedence, the solution-design decisions that touch this task, shared criteria in deviations.

### 6. Process and architecture rules that conflict or are silent

- **Deviations.** The reviewer requires a deviation to list the epic's shared criteria it affects (W-AC02, W-AC03). The runner allows at most two other open tasks mentioning the deviation's IDs. Shared W-* criteria appear in every task, so the count was 7, and a deviation from a shared criterion cannot pass (0mq.6).
- **Architecture rules are silent on browser code.** "One public entry" would have broken views that import a module whose entry holds server code (0mq.8).
- **Architecture rules are silent on CLI processes outside the queue.** This affected Himalayas.
- **Stale reference.** `implement-task` still names `master`. Reviewers ran `git diff master...HEAD`.

### 7. Imprecise domain language and jargon toward the owner

- **Domain terms.** "Source", "connector", "run", "sync", "scope" and directory names (`polish/`, `jobspy`) meant different things in different places. The glossary defines business terms only, not architectural ones.
- **Explanations the owner had to ask for.** About 40 times, the owner asked for an explanation of a term or a statement. Examples include "spike", "warm pnpm store" and "altitude script", a literal translation of *altitude*.
- **Short replies misread.** "We return the information that it is running" was taken as a change to rule F2-07.
- **Questions taken as requests for change.**
- **Approval carried past a new question.** An earlier "Zatwierdzam" ("I approve") was treated as still valid after a new question.
- **Already addressed:** the section "Talking to the owner" in AGENTS.md, added on 17 November, covers most of this. It does not yet say that approval lapses once a new question is raised.

### 8. Claims made without checking

Interactive agents did three things before checking:

- proposed designs that the architecture rules forbid (a session-level lock), before reading those rules;
- built mechanisms that pg-boss already provides (`singletonKey`, `heartbeat`);
- read an empty search result as proof of absence.

## Runner and environment obstacles (not misunderstanding)

- **Owner commits treated as damage.** A commit by the owner, or a bd export, on `main` during a run returned sound work three times (0mq.2, .7, .5). Epic `oferty-pracy-uuk` addresses this.
- **Unhelpful wait message.** "Main checkout has uncommitted changes" was logged 14 times without naming the file.
- **Reviewer without a database.** In five reviews the reviewer had no running PostgreSQL, so no database tests ran, and still gave `pass`.
- **Formatting noise.** Prettier and lint reported files outside the diff, and agents reverted them each time.
- **Stuck claims.** After a runner restart or the idle timeout, a task stayed claimed until released by hand.

## Candidate changes

1. **Solution design of a refactor:** a mandatory list of behaviours to keep per source, with characterization tests first.
2. **Preparation (`task-prep`):**
   - edge cases (concurrency, limits, degenerate input) as a readiness item;
   - a cross-task consistency check of criteria at epic hand-off;
   - a reason for every decision.
3. **Runner:**
   - pass unconfirmed assumptions of earlier tasks into the prompt;
   - exclude shared W-* criteria from the deviation mention count;
   - give the reviewer a running PostgreSQL.
4. **`implement-task`:** a self-check before the result file; replace `master` with `main`.
5. **Architecture rules and glossary:** code that runs in the browser, CLI processes outside the queue, architectural terms (source, connector, run, scope).
6. **AGENTS.md:** approval lapses once a new question is raised.
