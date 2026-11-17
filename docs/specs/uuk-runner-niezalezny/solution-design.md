# Runner independent of the owner's working copy — Solution design

Requirements: [requirements.md](requirements.md). The runner's flow that this document changes: [process contract](../../agents/implementation-workflow.md).

This document carries the requirements over into technical language. Its decisions and contracts are binding: a deviation requires changing the document before implementation. The implementer chooses the names of files, types and functions. Descriptions of the current state refer to revision `c32271e` of 2026-11-17.

## Current state (observed)

- The runner works in the owner's copy. The agent's environment gets the task's working directory and that copy's shared git data, writable.
- Before picking a task and before merging, the runner requires the owner's copy to have `main` checked out and no changes in tracked files other than the task database export.
- After every agent turn the runner compares `main` with its state at the start. On a difference it moves the branch back and returns the task.
- Merging is moving `main` in the owner's copy forward to the task branch, without a merge commit. By then the agent's environment is closed.
- The image of the agent's environment is built from the files on the owner's disk; the runner judges whether it is current by the dependency list and the image recipe from `main`.
- The runner keeps the state of the current task, including the location of the log, in variables shared by the whole process.
- The runner's code does not go into the image of the agent's environment, so the gate does not check it.

## Rules shared by the tasks

<a id="t-01"></a>

**T-01. Three places.** The exchange point is the `main` branch of the remote repository `origin`. The runner's copy is a clone of that repository in a separate directory. The owner's copy is neither a remote nor a source of files for the runner; the runner knows only where the task database is in it.

<a id="t-02"></a>

**T-02. Verifying the runner's code.** The runner's code has its own type check and its own automated tests, run outside the project's gate. The tests of code exchange create, for their duration, a bare repository as a stand-in exchange point and clones in the roles of the runner's copy and the owner's copy. The agent, the gate, the review, the image build and the task database are stand-ins in these tests; the git operations are real. A test introduces another party's change of the exchange point through a separate clone, between the runner's steps.

<a id="t-03"></a>

**T-03. Substitution boundaries.** To make T-02 possible, the runner separates four things from the logic of a run: operations on the task database, running the agent and the checks in an environment, building the image, and notifying the owner. The logic of fetching, putting work on top of a new state and delivering uses them through narrow operations and itself depends neither on Docker nor on the network.

## Decisions

<a id="d-01"></a>

**D-01. The exchange point is `main` on GitHub.**
- Owner's reason (translated from Polish): "better isolation from my environment. It can happen that I break something in the files and the runner picks it up."
- Discarded: a local merging repository on disk, into which the runner carries commits read from the owner's copy. Reason: the same.
- Accepted consequences: the runner sees a specification only after it is pushed; the owner pulls finished work themself.

<a id="d-02"></a>

**D-02. The runner's program runs from the runner's copy, in the version from the exchange point.**
- Owner's reason (translated from Polish): "I see no good reason to run it from my copy. If I change the runner I have to push the changes anyway. And what if the runner falls over while I am halfway through reworking it? I prefer better isolation. Besides, in the future my copy of the environment will not be available; in the cloud there will only be the runner's environment."
- Discarded: running the program from the owner's copy, with the runner's copy only as a git workshop. Reason: the same.
- Accepted consequences: the runner's dependencies, the agent token and the logs live in the runner's copy; a fix to the runner takes effect only after it is pushed and the runner is started again.

<a id="d-03"></a>

**D-03. The runner pushes `main` itself.**
- Owner's reason: the rule that the owner pushes `main` after checking the deviations "is out of date and only gets in the way" (translated from Polish).
- Discarded: the owner pushing `main` after checking the deviations and the assumptions. Reason: the same.

<a id="d-04"></a>

**D-04. One local task database, which the runner uses directly.**
- Discarded: separate databases in both copies, synchronised through the export file. The owner withdrew the proposal after checking that an import replaces whole tasks with the version from the file and that the tool treats the file as a passive export.
- Accepted consequences: the runner writes to the database on the owner's disk, so its export in the owner's copy changes while the runner works. Task `oferty-pracy-r03` investigates synchronising the databases through a remote repository.

<a id="d-05"></a>

**D-05. The runner waits for the missing documents of a ready task.**
- Owner's reason: none recorded.
- Discarded: returning the task to preparation when its documents are missing from the exchange point. Reason: none recorded.
- Accepted consequences: a task with a wrong link to a document waits without end; the check at hand-off ([uuk.1](#u1)) protects against this.

<a id="u1"></a>

## Task uuk.1 — Document check at hand-off

Requirements: [U1](requirements.md#u1).

### Contract of the check

- **Input:** the identifier of a task or an epic. It runs in the owner's copy.
- **Documents:** the values of the task's metadata fields that point at the PRD, the requirements and the solution design, without the part after the anchor sign. For an epic: its PRD.
- **State of the exchange point:** the check fetches the current `main` from `origin` on every run. The fetch updates, in the owner's copy, only the record of the remote repository's state; local branches, the index and the working files stay unchanged.
- **Comparison:** for every document, the content identifier of the file on disk, computed the way git computes it when adding a file, against the content identifier of the same path in the fetched state.
- **Result:** exit code 0 when all are identical. Otherwise a non-zero exit code and one line per document with the reason: no file on disk, missing at the exchange point, or different content. A failed fetch ends the check with a non-zero exit code and git's message.
- The check belongs to the process tools, beside the check of specification altitude, not to the runner.

### Changes in the documents

- The readiness checklist in the process contract: the first item requires every linked document to be in `main` on `origin` with content identical to the owner's copy, and names the check.
- The description of the hand-off in the task preparation skill: before the readiness label is applied, pushing `main` and running the check; on failure the label is not applied. The skill lives outside the repository, in the owner's skills directory.

### Verification

| Criteria | How |
| --- | --- |
| U1-AC01–U1-AC06 | Tests by T-02: a clone in the role of the owner's copy and a stand-in exchange point; the list of documents is given directly instead of being read from the task database. U1-AC05 uses a remote address that does not exist. U1-AC06 compares the branches and the state of the files before the check and after it. |
| U1-AC07 | Review of the readiness checklist and the skill. |

<a id="u2"></a>

## Task uuk.2 — The runner in its own copy

Requirements: [U2](requirements.md#u2).

### The runner's copy

- A clone of `origin`. The program files are checked out at a specific commit, not attached to the local `main` branch, so that the runner can overwrite that branch.
- The local `main` branch mirrors the exchange point. Every fetch overwrites it, forced, with the state from `origin`, so a write made to it by the agent's environment has no effect. The check that `main` did not change during a task, and moving the branch back, disappear.
- The runner trusts only the identifiers of commits it checked itself; branch names in the runner's copy are auxiliary to it.
- The agent's environment gets the task's working directory and the git data of the runner's copy, as today. It gets no keys or settings that give access to `origin`, and no path from the owner's copy.
- Untracked settings in the runner's copy: the agent token and the location of the task database. The runner refuses to start, with a message, when either is missing.

### The preparing command

- It runs from the owner's copy. The target directory is a parameter; the default is a directory beside the owner's copy, named after the project with the suffix `-runner`.
- In an empty place: it clones `origin`, checks out `main` from the exchange point without attaching to a branch, installs the runner's dependencies, copies the agent token from the settings in the owner's copy and records the location of the task database.
- On an existing runner's copy: it fetches `origin`, checks out the current `main` and installs the dependencies again. It does not overwrite the settings. It refuses when the program files in the runner's copy have local changes.

### Task database

All operations on the task database go through one place, which points the tool at the directory from the setting. The operations and their meaning stay as they are today. The runner's writes refresh the database export in the owner's copy; it is the only project file the runner changes there, indirectly (U2-R01).

### Cycle

1. Fetch `origin` and overwrite the `main` mirror. On failure: a log entry with git's message, no task is taken, the next cycle follows after the usual pause.
2. Compare the program version: if the runner's files in the fetched `main` differ from the version the runner started from, one log entry and one notification for the given commit of `main`. The runner keeps working.
3. Build the image of the agent's environment when the dependency list or the image recipe in the fetched `main` differ from the ones the image was built from. The build context is the content of the fetched `main`, not the working files.
4. Reconcile the epics and select the candidates, as today.
5. Check the candidate's documents in the fetched `main`. A missing document: a log entry with the task identifier and the paths; the task stays ready and unassigned, and the runner moves on to the next candidate. The other deterministic readiness gaps (empty acceptance criteria) end with a return, as today.
6. Run the task from the fetched `main`.

The start conditions concerning the owner's copy (checked-out branch, no changes) disappear. Preview mode performs steps 1, 2, 4 and 5 without writing to the task database and without building the image.

### Delivery in this task

- After the gate and the review pass, the runner pushes the checked commit to `main` on `origin` without forcing, naming it by its identifier.
- A rejected or failed push: the runner fetches `origin`. When `main` differs from its state at the start of the task, it returns the task with the identifiers of the new commits. When the fetch fails or `main` is unchanged, it returns the task with git's message. Task uuk.3 replaces these returns.
- Success: recording the evidence, the follow-ups and the assumptions and closing the task, as today. The close reason gives the commit at the exchange point.

### Return of a task

- The runner pushes the task branch to `origin` under a name with the prefix `agent/`, forced, because an earlier return of the same task may have left an older one. The return comment gives that name. When the push fails, the comment says that the branch is only in the runner's copy.
- After a task is merged, the runner removes the branch of that name from `origin`; its absence is not an error.

### Changes in the documents

The execution section of the process contract describes: the three places from T-01, the cycle, the delivery and the return from this task, the preparing command and starting the runner from its copy, the location of the logs, and the one-time git setting in the owner's copy that makes a pull which replays local commits put uncommitted changes aside and restore them by itself. It removes the rules from U2-R17. The section about what follows a merge says that the owner tests `main` after pulling from the exchange point. The tracker guide stops claiming that no remote repository is configured and notes that the runner pushes.

### Verification

| Criteria | How |
| --- | --- |
| U2-AC01–U2-AC07 | Tests by T-02. U2-AC02 compares the branches, the index and the files of the clone in the role of the owner's copy before the run and after it. U2-AC06 checks the branches of the stand-in exchange point after the return and after the merge. |
| U2-AC08 | Listing the mount points and the environment variables of a running agent container. |
| U2-AC09 | Running the command on an empty directory, starting the runner in preview mode, running the command again after a change at the exchange point. |
| U2-AC10 | Trial with the owner on the first task after the switch. |
| U2-AC11 | Review of the process contract and the tracker guide. |

<a id="u3"></a>

## Task uuk.3 — Delivery with a changing exchange point

Requirements: [U3](requirements.md#u3).

### State of a task

For a task the runner keeps, in memory and for the duration of the run: the task identifier, the branch name, the commit of `main` on which the work last passed the gate, the checked commit of the work, the agent's result, the review verdict, the number of feedback turns used and the number of delivery retries.

### Delivery steps

Delivery happens before the runner closes the agent's environment, so that the agent can get a feedback turn.

1. Fetch `origin` and overwrite the `main` mirror. On failure: the task waits with its environment open; the runner retries after the usual pause between cycles, without a limit, and starts no new task in that slot meanwhile.
2. `main` equal to the commit of the last gate: go to step 5.
3. `main` different: the runner replays the commits of the task branch on top of the new `main`, keeping the history linear.
4. The gate in a fresh environment on a copy of the replayed branch. When the list of paths changed between the commit of the last gate and the new `main` contains any document of the task, also a review of the task's whole change. On success the new `main` becomes the commit of the last gate.
5. Push the checked commit to `main` on `origin` without forcing.
6. Success: as in task uuk.2.

### Failures of the steps

| Step | Situation | Reaction |
| --- | --- | --- |
| 3 | Conflict | The runner aborts the replay and sends the agent a feedback turn. The report gives the conflicting files and the commits of `main` between the old base and the new one that change those files. The agent itself replays the branch on top of the `main` mirror, resolves the conflict, passes the gate and writes the result. Then the runner performs the full checks as after any turn, with the review. |
| 4 | The gate or the review fails | A feedback turn with the report, then the full checks. |
| 5 | The push fails | The runner fetches `origin`. Fetch failed: as step 1. `main` changed: the retry counter grows and the runner goes back to step 3. `main` unchanged: return of the task with git's message. |
| any | A fourth feedback turn or a sixth retry | Return of the task as in task uuk.2. |

The runner establishes the cause of a failed push by fetching again, not from the text of git's message.

### A change of the environment during a task

Before step 4 the runner builds the image when the dependency list or the image recipe in the new `main` differ from the ones the image was built from. The fresh environment uses the new image. From then on the agent's open environment is out of date: when the task still needs a feedback turn, the runner returns it with the reason that the environment changed during the task.

### Changes in the documents

The execution section of the process contract describes the delivery steps, the limits and the cases of return. A conflict while replaying stops being a reason for an immediate return.

### Verification

| Criteria | How |
| --- | --- |
| U3-AC01–U3-AC08 | Tests by T-02. The stand-in agent answers a feedback turn with a commit recorded in advance. U3-AC02 introduces another party's commit between the fetch and the push. U3-AC07 swaps the address of `origin` for an unreachable one and restores it. U3-AC08 checks that the stand-in image build was called before the gate. |
| U3-AC09 | Trial with the owner. |
| U3-AC10 | Review of the process contract. |

<a id="u4"></a>

## Task uuk.4 — Tasks independent of each other

Requirements: [U4](requirements.md#u4).

- **The state of a task** from task uuk.3 and the location of the log belong to the run of the task and are passed to it; the runner's process has no shared variables describing the current task. Entries not tied to a task go to the runner's shared log.
- **The number of slots** is a start parameter with the default value 1. The runner starts the next task when it has a free slot and a ready candidate; the cycle of fetching and selecting works independently of the running tasks.
- **Claiming a task** is a conditional write to the task database: it succeeds only when the task has no assignee. The tool reports an unmet condition with a separate exit code, different from the one for other errors. A plain claim is not enough, because repeated by the same assignee it succeeds again. An unmet condition means another run took the task; the runner skips it without a comment and without changing labels.
- **Delivery queue.** Within one runner process, one task at a time performs the delivery steps of task uuk.3, from the fetch to the push; the others wait in the order they arrived. The fetch of `origin` at the start of a cycle goes through the same queue. A rejected push remains the safeguard against changes from outside the process.
- **An error in the run** of one task ends with its return and frees the slot; the other runs continue.

### Verification

| Criteria | How |
| --- | --- |
| U4-AC01, U4-AC03, U4-AC04 | Tests by T-02 with two tasks and stand-in agents that finish in a fixed order. |
| U4-AC02 | A test in which the stand-in task database rejects the conditional write. |

## Rollout and transition

1. uuk.1. The existing runner keeps working.
2. Before the switch: the check from uuk.1 for every task and epic with the readiness label.
3. uuk.2. The owner stops the existing runner when it is not running a task. The change reaches the exchange point, the owner runs the preparing command, turns on the git setting in their copy and starts the runner from the runner's copy. The first task is the trial U2-AC10.
4. uuk.3, with the trial U3-AC09. Then uuk.4.

Going back: the existing version of the runner is in the history; after reverting the change it is started from the owner's copy as today.

## Known limitations

- The agent's skills are mounted from the skills directory on the runner's machine. Working outside the owner's computer requires delivering them another way.
- Notifying the owner uses a mechanism of the system the runner runs on.
- Stopping the runner during a task leaves the task assigned; the owner releases it by hand. This also applies to a task waiting for the exchange point to come back (U3-R07).
