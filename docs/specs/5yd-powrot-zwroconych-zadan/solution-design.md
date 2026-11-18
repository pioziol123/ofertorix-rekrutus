# Cheaper return to returned tasks — Solution design

Beads epic: `oferty-pracy-5yd`. Goal: [PRD](PRD.md). Requirements: [requirements](requirements.md). The runner's flow it changes is the one the process contract describes; the epic `oferty-pracy-uuk` built it.

## Facts this design rests on

- The runner pushes the commits of a returned attempt to GitHub on the return branch, and today's next attempt ignores them: it creates the task branch at the fetched `main`.
- Sandcastle 0.14 opens a sandbox on an existing work directory of the same branch and reuses it. The work directory lives in the runner's copy, outside the container, so uncommitted files survive a failure of the container.
- Sandcastle saves the agent's conversation on the host only when a turn ends normally. A turn that fails leaves no saved conversation.
- The skills the implementing agent uses are mounted read-only from the owner's machine, from a fixed list in the runner. The owner keeps them outside the repository (owner's decision); a change to a skill is made by hand.
- The result file is checked for shape; fields it does not know are allowed.
- The epic's assumptions are today collected as comments on one triage task per epic. Nothing passes them to later tasks.

## Decisions

### D1. No conversation is resumed across attempts or after an environment failure

A new agent always continues the kept work; only the feedback turns inside one attempt keep using the running session, as today.

- Discarded: resume the returned attempt's conversation in a new sandbox. Owner's reason: a new agent with the kept code and a state note costs less than reloading a conversation of 125–420 thousand tokens with an expired cache, and the old conversation holds reasoning the owner's answer has overturned.
- Discarded: resume the conversation of the last finished turn after an environment failure. Owner's reason: the gain is a few minutes once in several tasks, against a second path in the runner.
- Discarded: keep the sandbox alive while the task waits for the owner. Owner's reason: what matters survives outside the sandbox; a kept sandbox holds a slot and memory, dies with Docker, and goes out of date when the image changes.
- Discarded: write the conversation live to a host directory mounted into the sandbox. Owner's reason: it breaks the sandbox isolation for a small gain.

### D2. Where a continuation's inputs live

- The task's metadata holds the return branch and the commit of `main` the returned attempt worked on (`kept_branch`, `kept_base`). A continuation exists when they are set and the branch exists on GitHub; it fetches that branch, creates the task branch at it and lets the first check replay it on the fetched `main`, which already turns a conflict into a feedback turn.
- The state note travels in the return's comment as a fenced JSON block after the human-readable reason. The owner's answer is every comment of the task created after the latest return comment, plus `git diff <kept_base> <fetched main>` limited to the task's linked documents.
- The fresh-start label is `start-fresh`. Claiming a task with it clears `kept_branch` and `kept_base` and removes the label.
- Discarded: read the branch name from the text of the return comment. Reason: it depends on wording that changes.

### D3. The state note is asked for in the running session before a return

When an owner finding (D5) or used-up feedback turns end the attempt, the runner resumes the agent's session once with a request to write a state note with the `task-state-note` skill and to change nothing else, then reads `state_note` from the result file. This request does not count as a feedback turn. A missing or malformed note leaves the return without one. The runner adds `task-state-note` to the mounted skills.

### D4. Environment failures are told apart by where the error comes from

An error thrown by an operation of a sandbox (opening it, a command in it, the agent's turn, closing it) is an environment failure, whatever its message. Errors of the task database and the outcomes of checks and reviews are not. On a failure in the implementing agent's sandbox the runner closes it (ignoring errors), opens a new one on the same branch and starts a new agent with the continuation prompt plus the failure's first line. On a failure in a fresh sandbox it repeats that check. The attempt state counts environment retries; the third failure returns the task, quoting every failure.

- Discarded: recognise environment failures by the text of the error. Reason: messages of Docker and the agent's CLI change between versions.

### D5. The review file marks each finding

`findings` becomes a list of `{ "kind": "fix" | "owner", "text": "...", "question": {...} }`; `question` is required for `owner` and has the shape of the state note's question. The verdict values stay. A finding written as a plain string counts as a fix finding, so a reviewer that ignores the new shape behaves as today.

### D6. One Beads issue per assumption

The runner files each assumption of a delivered task as its own issue outside the epic, with `needs-triage`, `metadata.type=assumption`, `metadata.epic`, `metadata.marker` and `discovered-from` the task; the description holds the gap, the decision, the sources, the PRD part, the rule and the reversal. Unconfirmed means open. The owner's agent closes it on confirmation (after recording it in the solution design) or on rejection (after filing the change task of AUT-R11). Every attempt of a task in an epic receives the epic's open assumption issues in its prompt. The load-bearing flag stays as today, as a label.

- Discarded: keep the one triage task per epic with comments. Reason: the runner cannot tell a confirmed assumption from an open one in a comment without parsing the owner's wording.

### D7. Assumption markers are checked like follow-up markers

`ASSUMPTION(<task id>/<assumption id>)` must appear on an added line of the task's own diff for every assumption the result lists, by the same check that verifies follow-up markers. Assumptions gain the fields `sources` and `prd`.

### D8. Deviation limits

The constants change as AUT-R07 states; the file-count limit is removed from the process contract, which is where it lived (the runner never counted files). The epic limit counts open follow-up issues as today.

### D9. The gate checks formatting of changed files only

The gate runs the formatter's check on the files changed between the merge base with `main` and the working tree, skipping deleted files and files the formatter ignores. When the merge base cannot be found, it checks the files of the last commit. Several files at the base of `main` already fail the check, so a whole-repository check would fail every task.

## Changes by task

| Task | Runner | Process contract | Agents' instructions |
| --- | --- | --- | --- |
| FMT | none | Gate description | none |
| CON | D2, D3, mounted skill, continuation prompt, review of the whole change | Return of a task, continuation, state note, `start-fresh` | Continuation prompt |
| ENV | D4 | Environment retries and their limit | none |
| REV | D5, early return with note request | Review verdicts and findings | Reviewer's instruction |
| AUT | D6, D7, D8, prompt section with the epic's assumptions | Spec conflicts: sources, classification order, stops, limits, markers, later tasks, rejected assumptions | Reviewer's instruction; the implementing skill is changed by the owner (by hand) |

## Situations

| Operation | Situation | Outcome |
| --- | --- | --- |
| Continuation | Two runs pick the task | The conditional claim lets one through, as today. |
| Continuation | The return branch is gone | Start from `main`, log it (CON-R06). |
| Continuation | The note block is malformed | The attempt goes on without the note and logs it. |
| Continuation | Returned again | The new return overwrites `kept_branch`/`kept_base` and the return branch, as the return branch is overwritten today. |
| Note request | The agent's turn fails or times out | Counted as no note; the task is returned. It is not an environment retry. |
| Environment retry | The new sandbox fails to open | Counted as the next failure. |
| Assumption issues | Filing one fails | Logged and listed in the task's comment as not filed, like a follow-up today. |

## Verification

Every automated criterion is a test of the runner's flow with the stand-in sandboxes and task database the runner's tests already use, plus a real git repository standing in for GitHub. FMT-AC01 and FMT-AC02 run the gate's formatting step on a temporary repository.
