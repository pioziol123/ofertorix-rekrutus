# Implementation workflow

Work moves through two phases separated by a **hand-off**:

1. **Preparation** happens with the owner. Any input (a bd epic, a ticket, a document, a chat request) becomes specification documents and a bd task that meets the readiness checklist. The `task-prep` skill runs this phase. Applying `ready-for-agent` is the hand-off.
2. **Execution** happens unattended. The runner (`node .sandcastle/runner.ts`) takes ready tasks, one at a time unless set otherwise, has an agent implement each in its own sandbox, runs the gates, delivers the work to `main` on GitHub and closes the task. The agent follows the `implement-task` skill. The owner's next contact with the work is pulling `main` and testing it.

The `spec-docs` skill owns how the documents are written. This file owns how documents, tasks and the runner connect.

## Documents

| Document | Scope | bd |
| --- | --- | --- |
| PRD | Epic: problem, outcomes, scope, stages | The epic; `spec_id` is the PRD path |
| Requirements | Task: observable behaviour and acceptance criteria with stable IDs | Linked from the task |
| Solution design | Task: technical decisions, contracts, verification | Linked from the task |

Each document stays at its own level:

- **PRD**: business and functional intent at a very high level, quick to read. No technical solutions and no detailed requirements.
- **Requirements**: business and functional decisions and requirements, more detailed than the PRD. No technical details: no library protocols, function names, file names or directories. Each criterion says how it is checked in the same terms (an automated test, a check of the running application, a review).
- **Solution design**: every technical decision, the requirements restated in precise technical language. It names libraries, mechanisms and data semantics, but not concrete paths, file names or function names; the implementer chooses those. Each decision lists the options the owner discarded, each with the owner's reason, the verified fact that ruled it out, or none.

Specifications are written in English and call the unit of work a *task*.

An epic's documents live in `docs/specs/<epic>-<slug>/`, where `<epic>` is the epic's bd id without the project prefix, for example `docs/specs/0mq-architektura-modulow/` for `oferty-pracy-0mq`. Specifications written before this rule keep their directories.

ADRs, architecture documents and RFCs supplement these documents. Link them from the PRD or the solution design; every epic still has a PRD.

The project's architecture rules bind every task, whether or not its documents link them, and apply at all three stages: preparation checks each design option against them, the implementer follows them, and the reviewer checks the diff against them. Their section on the costs of design decisions works the same way at each stage: a cost is named when an option carries it, and it enters the code only as a decision the solution design records, or as an assumption the implementer records (see [Spec conflicts during implementation](#spec-conflicts-during-implementation)).

An implementation task covers one vertical, demoable increment that a person can review in one sitting. Split a task when it holds behaviours that can be accepted separately, needs more than about 15 acceptance criteria, or changes the public contract of more than one module. Several tasks can share one requirements or design file when each task owns a section with stable IDs.

## The implementation task

One bd task (type `task`, `bug` or `feature`) per increment, a child of its epic. The task points at the documents and holds no copy of their rules:

- `metadata.prd`, `metadata.requirements`, `metadata.sd`: repository-relative paths, optionally with a `#section` anchor.
- `spec_id`: the requirements path.
- `acceptance_criteria`: one line per criterion, `AC-ID: observable result`, using the IDs from the requirements.
- Blocking dependencies as native bd edges.

**Small lane.** A change with no behaviour decision and no contract change sets `metadata.lane=small`. It needs `metadata.prd` and its own acceptance criteria; `metadata.requirements` and `metadata.sd` become optional.

## Labels

| Label | Meaning for the runner |
| --- | --- |
| `ready-for-agent` | Readiness checklist met; the runner may take it |
| `ready-for-human` | Human in the loop required; the runner skips it |
| `needs-info` | Returned by the runner or still missing decisions; the runner skips it |
| `start-fresh` | The owner orders the next attempt to start from `main`, ignoring the kept work of a returned attempt; the runner removes the label when it claims the task. See [Continuation](#continuation). |

A task leaves preparation with `ready-for-agent` only. Mark a task `ready-for-human` when its work needs the owner during implementation, for example a manual product check or access only the owner has.

## Metadata the runner reads and writes

| Where | Key | Set by | Meaning |
| --- | --- | --- | --- |
| Epic | `load_bearing` | Preparation | Comma-separated requirement and criterion IDs the epic rests on, for example `R-03,T2-AC04`. A conflict touching one of them always blocks. Missing means none is marked. |
| Epic | `shared` | Preparation | Comma-separated IDs of the criteria every task of the epic repeats, for example `W-AC01,W-AC03`. The runner leaves them out when it counts the tasks that wait for a deviation. Missing means none. |
| Epic | `follow_ups` | Runner | `true` while every other child is closed and open follow-ups remain. See [Epic with open follow-ups](#epic-with-open-follow-ups). |
| Task | `type` | Runner | `follow-up` on a task created from a deviation. |
| Task | `marker`, `origin` | Runner | On a follow-up: the code marker it owns and the task that created it. |
| Task | `type`, `epic` | Runner | `assumptions` and the epic id on the triage task that collects assumptions to confirm. |
| Task | `kept_branch`, `kept_base` | Runner | On a returned task: the return branch on GitHub holding the attempt's kept work, and the commit of `main` the attempt worked on. Set by a return that pushed the branch, cleared by `start-fresh` and by delivery. See [Continuation](#continuation). |

## Epic hand-off

An epic is handed off as a whole. Apply `ready-for-agent` to the epic only when every open child task carries `ready-for-agent` or `ready-for-human`; closed and deferred children do not count. Membership follows the `parent` field: a task moved out of the epic with `bd update --parent ""` keeps its dotted id but no longer counts. Until then the runner takes none of the epic's tasks, even those already marked ready, so `main` holds no part of an epic whose remaining work may still change its decisions. The one exception is a registered deviation; see [Spec conflicts during implementation](#spec-conflicts-during-implementation).

The runner checks this before each task: the nearest epic above the task carries `ready-for-agent`, and none of the epic's open children is unlabelled or `needs-info`. Follow-ups are left out of this check: an open follow-up keeps the epic open but does not pause its other tasks. A task the runner returns as `needs-info` pauses the rest of its epic until preparation resolves it. A `ready-for-human` task does not hold the epic back; its dependants wait in bd until the owner closes it. Tasks outside any epic are handed off one by one.

Preparation also records the epic's `load_bearing` requirements: the decisions most of the epic builds on, such as a shared status model, contracts between modules or limits. Ask the owner which ones they are when the epic is handed off. It records the epic's `shared` criteria too: the ones every task repeats.

### Epic with open follow-ups

Before each pass the runner updates every handed-off epic from the state of its children:

- `follow_ups=true` while every child except the follow-ups is closed or deferred and some follow-up is open; the key is removed otherwise.
- When that phase begins and some follow-up still lacks `ready-for-agent`, the runner takes the epic back: `needs-info` instead of `ready-for-agent`. The epic's ready follow-ups wait with it.

The runner never hands an epic off. Once every open follow-up is prepared and carries `ready-for-agent`, preparation (the `task-prep` skill) hands the epic off again with the owner's approval, as in the first hand-off, and the runner implements the follow-ups. A follow-up that implementing a follow-up files takes the epic back again. Removing `ready-for-agent` pauses an epic in any phase.

An epic with open follow-ups is not finished, and its follow-ups list the known deviations in `main`.

## Readiness checklist

Before applying `ready-for-agent`:

- Every linked document is in `main` on `origin` with content identical to the owner's copy, uncommitted changes included, and the anchors resolve. Push `main` first, then run `node scripts/check-spec-sync.ts <id>` for the task, and for the epic before handing it off; it fetches `origin` and exits 0 only when every document matches, otherwise it lists each one as missing at the exchange point, different in content, or missing on disk.
- Each acceptance criterion is observable and names how it is checked (test, command or inspection).
- No requirement or criterion refers to behaviour it does not name ("as before", "unchanged", "correctly"). A task that moves or rebuilds existing code lists the behaviours it keeps as criteria. A criterion that nothing else changes is not allowed: it names no behaviour.
- Every operation the task adds or changes has an outcome, or an open question, for each situation in the architecture rules' section on situations every operation answers.
- The solution design states the contracts the task touches exactly enough to implement without guessing, and each of its decisions lists the options the owner discarded with the reason or "none recorded".
- No open question blocks the task; non-blocking assumptions are recorded in the documents.
- `node scripts/check-spec-altitude.ts` run on the task's linked PRD, requirements and solution design, by path, exits 0. In the PRD and requirements no warning remains. In the solution design a remaining warning names a library, one of its options or a stored column, which the design carries on purpose; it needs no further record. A line that must name legacy code to identify it carries `<!-- altitude-ok: <reason> -->`.
- Blocking dependencies are wired in bd.

The runner re-checks the first item and the presence of acceptance criteria deterministically. A document missing from `main` on GitHub makes the task wait, without a return, until it appears; missing document links or acceptance criteria return the task as `needs-info`.

## Execution

### Three places

- **The exchange point** is `main` on `origin`, the project's repository on GitHub. Code and documents pass between the owner and the runner only through it.
- **The runner's copy** is a separate clone of `origin`. The runner's program runs from it, in the version from the exchange point, and the agents' worktrees live in it. It stays on its `main` branch, which holds the runner's program and moves only when the program is updated. The runner reads the exchange point from `origin/main`: every fetch overwrites it, so a write to it from a sandbox has no effect, and a fetch never changes the program's files. The runner trusts the commit ids it fetched and checked, not branch names.
- **The owner's copy** is where the owner works. The runner and the agents neither read nor change its branches, history or files. The one exception is the task database: the runner uses the owner's bd database directly, so its export in the owner's copy changes while the runner works.

Every agent runs in a Sandcastle `docker()` sandbox built from `.sandcastle/Dockerfile` as it is in the fetched `main`: the project's toolchain, PostgreSQL with the schema migrated from the commit the image was built from, and Claude Code. The sandbox sees its own worktree and the git data of the runner's copy, nothing else of the host: no owner's copy, no task database, no Docker, no GitHub credentials. Only the runner pushes. Inside the sandbox the agent runs without permission prompts; the container is the boundary.

### Cycle

The runner runs as many tasks at the same time as its slots allow, one by default. It starts the next task whenever a slot is free and a task is ready; the cycle below keeps working while tasks run. Every run of a task has its own state, branch, sandboxes and log, and an error in one run returns that task and leaves the others running; an [environment failure](#environment-retries) is retried first. Fetches at the start of a cycle and the deliveries of all runs, from the fetch to the push, pass through one queue, one at a time in the order they arrive; a rejected push still guards against changes from outside the runner.


1. Fetch `main` from `origin` into `origin/main`. When GitHub cannot be reached, log git's message, take no task and try again in the next cycle.
2. When the runner's program in the fetched `main` differs from the version the runner started from, log it and notify the owner once per version. The runner keeps working in its own version.
3. Rebuild the sandbox image from the content of the fetched `main` when `pnpm-lock.yaml` or `.sandcastle/Dockerfile` there differ from the ones the image was built from.
4. Reconcile the epics and pick the first task from `bd ready` with `ready-for-agent`, neither `ready-for-human` nor `needs-info`, and an epic that passes the epic hand-off check. A task whose linked documents are not in the fetched `main` stays ready and unclaimed; the runner logs the missing paths and moves on to the next one. The claim is a conditional write that succeeds only when the task has no assignee; when another run claimed it first, the runner skips it without a comment and without changing its labels.

### One task

1. Create the task branch of the claimed task at the fetched `main` commit, or at the kept work of a returned attempt for a [continuation](#continuation): `<epic>-<task>-<title slug>`, for example `0mq-13-wprowadzic-wspolne-zarzadzanie-polaczeniami` for `oferty-pracy-0mq.13`. Ids drop the project prefix; the task part is relative to the epic, and a task outside any epic uses its own id alone. Branches made by hand follow the same prefix.
2. Run the implementing agent (`claude-opus-5-5`, effort `medium` by default) in a sandbox on that branch with the task and its documents, and for a continuation with what [Continuation](#continuation) lists. The agent runs the gate itself before finishing, writes a result file and commits on its branch; bd, delivery and `main` belong to the runner.
3. Check, in the same warm sandbox: the result file exists, the worktree is clean, the branch has commits and rebases cleanly on the `main` commit the work must sit on (the fetched one, or a newer one from delivery), the result's shape and deviations pass the [deterministic checks](#what-the-runner-checks), and the gate passes.
4. In a fresh sandbox on a copy of the branch, run the gate again, start PostgreSQL with the schema migrated so the reviewer can run single tests, then run a separate reviewing agent against the diff of the task's whole change against `main` (for a continuation the kept commits included), the documents, the acceptance criteria and the result's assumptions and deviations. Its verdict is `pass`, `pass-with-deferral` (every deviation accepted) or `fail` with findings. A result with deviations needs `pass-with-deferral`. Only committed work reaches this step.
5. When step 3 or 4 fails, send the report back into the implementing agent's session in the same warm sandbox (Sandcastle resume), so it keeps its context, and repeat from step 3. A rebase conflict is such a failure too: the report names the conflicting files and the commits of `main` that changed them, and the agent rebases and resolves it itself. Three feedback turns per attempt at most, counted from zero in every attempt and shared by every kind of failure, including those from delivery but not [environment failures](#environment-retries), which have their own count; a `blocked` result returns the task at once. When a fourth turn would be needed, the runner first resumes the session once more and asks the agent for a [state note](#state-note); that request is not a feedback turn.
6. Deliver, before the warm sandbox closes, as described in [Delivery](#delivery).
7. After delivery: comment the evidence, the assumptions and the deviations, file a follow-up for each deviation and wire it to block the tasks that depend on it, add the assumptions to the epic's assumptions task, file new scope as `discovered-from` tasks with `needs-triage`, close the task with the delivered commit, remove the branch an earlier return left on GitHub and the task's `kept_branch` and `kept_base`, and notify the owner that the work is on GitHub.

### Delivery

Only work that passed the gate on exactly the `main` commit it is pushed onto reaches GitHub. The runner keeps, for the run of the task, the commit of `main` on which the work last passed the gate and the number of delivery retries.

1. Fetch `main` from `origin`. When GitHub is unreachable, the checked work waits with its sandbox open: the runner retries after the usual pause between cycles, without a limit, and takes no new task meanwhile. The wait does not survive a restart of the runner.
2. When `main` equals the commit of the last gate, go to step 5.
3. Otherwise `main` changed: count a retry and replay the task branch on top of the new `main`, keeping the history linear. A conflict aborts the replay and becomes a feedback turn (step 5 of [One task](#one-task)).
4. When `pnpm-lock.yaml` or `.sandcastle/Dockerfile` differ in the new `main` from the commit the warm sandbox was opened from, rebuild the image from the new `main` first. Then run the gate in a fresh sandbox on a copy of the replayed branch. When the change of `main` since the last gate includes any document the task links, the reviewer checks the task's whole change again. A failure becomes a feedback turn; on success the new `main` is the commit of the last gate. Go back to step 1.
5. Push the checked commit to `main` on `origin` without forcing. When the push fails, the runner fetches again to learn why, not from git's message: GitHub unreachable, as in step 1; `main` changed, go back to step 3; `main` unchanged, return the task with git's message.

The task is returned when a fourth feedback turn would be needed, when `main` changes a sixth time during delivery, when the environment fails a third time in the attempt (see [Environment retries](#environment-retries)), and when a feedback turn would be needed after the image was rebuilt during the task: the agent's sandbox is then out of date.

**Return of a task.** Remove `ready-for-agent`, add `needs-info`, release the claim and comment the concrete reason. When the task has a branch, push it to GitHub as `agent/<task branch>`, forced over an earlier return, and name it in the comment; when that push fails, the comment says the work stayed only in the runner's copy. After a successful push the task records the kept work: `kept_branch` is the return branch and `kept_base` the commit of `main` the attempt worked on: the commit it started from, or, for kept work it never replayed, the older commit that work is built on. A replay onto a newer `main` during delivery does not move it, so the owner's answer still shows every document change the attempt did not work on, overwriting an earlier return's values. The comment starts with `Runner returned the task.` and, when there is anything to carry, ends with a fenced `json` block holding `state_note`, the [state note](#state-note) the agent wrote, and `last_review`, the last review report of the attempt or of the attempt it continued. The next attempt reads that block; the owner's agent can read it too.

The runner never syncs Dolt.

### State note

What the implementing agent leaves when an attempt stops before it is done; the agents' `task-state-note` skill, mounted in the agent's sandbox, defines its shape. The runner keeps it as a JSON object in the result file's `state_note` field:

- An agent that finishes `blocked` writes it with its question; the return carries it.
- When the feedback turns are used up, the runner asks the agent once, in its running session, to write the note and change nothing else, then reads `state_note` from the result file, which it removes before the request so that only a note written in answer counts. A failed turn, a missing note or one that is not a JSON object leaves the return without a note; the comment still gives the reason. A failed turn here is not an environment retry.

### Continuation

The next attempt of a task with recorded kept work is a continuation, whatever the cause of the return:

1. When the task carries `start-fresh`, the runner removes the label and clears `kept_branch` and `kept_base` right after the claim; the attempt starts from `main`.
2. Otherwise it fetches `kept_branch` from GitHub and creates the task branch at it. When GitHub no longer has the branch, the attempt starts from `main` and the task's log says why; the task is not returned for it. When GitHub lists the branch but does not give it, for example because it cannot be reached, the task waits in selection like a task whose documents are missing: the runner logs why, does not claim it, takes the next task, and tries again in a later cycle; the kept work stays recorded. If that happens between the selection and the start, the runner releases the claim and logs it.
3. The agent receives, beside what every attempt receives: the state note of the returned attempt when its return comment has one, the owner's answer, and the last review report when there was one. The owner's answer is every comment of the task added after its latest return comment, and `git diff <kept_base> <fetched main>` limited to the task's linked documents. A malformed data block is logged and the attempt goes on without it.
4. The first check after the agent's turn replays the branch on the fetched `main`, as every check does. A conflict is a feedback turn whose report names the conflicting files and the commits of `main` since `kept_base` that change them, as during delivery.
5. The review covers the task's whole change against `main`, the kept commits included.

No conversation is resumed across attempts: a continuation is a new agent with the kept code and the state note.

### Environment retries

An **environment failure** is an error thrown by an operation of a sandbox: opening it, a command in it, the agent's or the reviewer's turn, closing it. It is told apart by where the error comes from, not by its text. A failed gate or check, a failed review, a `blocked` result and an error of the task database or of git in the runner's copy are not environment failures. An environment failure is not a matter for the owner, so the runner retries by itself:

- **In the implementing agent's sandbox**, the runner closes the sandbox, ignoring a further error, opens a new one on the same branch and starts a new agent there. The work directory lives in the runner's copy, outside the container, so the previous agent's commits and uncommitted files stay. The new agent receives the task as at the start of the attempt (for a continuation, with what [Continuation](#continuation) lists), plus the first line of the failure and the attempt's last review report when there was one. The previous agent's conversation is not resumed. The new sandbox runs on the image built for the `main` the work sits on, so it is no longer out of date after a rebuild during delivery.
- **In a fresh sandbox** of the gate or the review, the runner repeats that check in a new fresh sandbox.

An attempt has at most two environment retries, counted together for both kinds of sandbox, from zero in every attempt, and apart from the feedback turns: a retry uses no feedback turn. A new sandbox that fails to open counts as the next failure. The third environment failure of an attempt returns the task; the return's comment says that the cause is the environment and quotes every environment failure of the attempt. A failure while closing the agent's sandbox after the attempt has ended, delivered or about to be returned, is only logged. A restart of the runner during a task is not retried: the task stays claimed, as [Running the runner](#running-the-runner) says.

### Running the runner

Prepare the runner's copy once, from the owner's copy:

- `node .sandcastle/setup.ts [--dir <path>]` clones `origin` into an empty directory, by default beside the owner's copy with the suffix `-runner`; stays on its `main` branch; runs `npm ci` in `.sandcastle/`; copies `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) from the owner's `.sandcastle/.env`; and records the owner's task database in `.sandcastle/runner.json`. Run on an existing runner's copy, it fast-forwards its `main` to `main` on GitHub (putting a copy left detached by an earlier version back on `main`) and reinstalls the dependencies, keeps the settings, and refuses when the program files there have local changes. A plain `git pull` in the runner's copy updates the program as well; run `npm ci` in `.sandcastle/` after it when the dependencies changed.

Then run the runner in a terminal from the runner's copy. It refuses to start without the token or the task database setting.

- `node .sandcastle/runner.ts --dry-run` fetches GitHub and lists the candidates and the verdict for each, without writing to the task database or building the image.
- `node .sandcastle/runner.ts --once` processes at most one task; without `--once` it polls every `--interval` minutes.
- `--slots <n>` runs up to `n` tasks at the same time; the default is 1.
- `--task <id>`, `--model`, `--effort` and `--rebuild-image` override the defaults.

A change to the runner takes effect after it reaches `main` on GitHub, the preparing command runs again and the runner is restarted. Logs live in `.sandcastle/logs/` of the runner's copy: `runner.log` for entries not tied to a task, and one file per run of a task, named after the task id. Stopping the runner during a task leaves the task claimed; release it with `bd unclaim`.

In the owner's copy, set git once so that pulling the runner's work puts uncommitted changes aside and restores them by itself:

```bash
git config pull.rebase true && git config rebase.autoStash true
```

## Commands

Inside the sandbox, run project commands directly from the worktree root:

- `scripts/gate.sh` is the gate: `pnpm install --offline --frozen-lockfile`, the formatting check `scripts/check-format.ts`, `pnpm lint`, `pnpm typecheck` and `scripts/test-integration.sh`. The gate runs the same way in the agent's sandbox, in the runner's fresh sandbox and when the owner runs it by hand.
- `scripts/check-format.ts` runs Prettier's check on the files the task changed: those that differ between the merge base with `main` and the working tree, uncommitted and untracked files included. It skips deleted files and files Prettier ignores or has no parser for; it names every file that is not formatted. When the copy knows both the local `main` and the fetched `origin/main`, the nearer merge base counts. Without any merge base it checks the files of the last commit. Files the task did not change are not checked, because several files on `main` already fail the check; `pnpm format:check` checks the whole repository.
- `scripts/test-integration.sh` starts PostgreSQL, applies pending migrations, builds the app, runs the web server and the worker in the background, runs every test including integration, and stops what it started.
- `scripts/check-spec-altitude.ts` checks specification documents for detail below their level: code file names, paths into code directories, function or class code and code blocks other than diagrams are errors; inline code that reads as an identifier, a member access or a call is a warning to review.
- `scripts/check-spec-sync.ts <id>` runs in the owner's copy at hand-off, not in the sandbox: it fetches `main` from `origin` and checks that the documents a task or epic links match the files on disk.
- Single checks run as usual, for example `pnpm vitest run tests/offers.test.ts`; install dependencies first with `pnpm install --offline --frozen-lockfile`.

## Discoveries during implementation

The agent classifies anything it learns that the documents do not cover:

- **Code defect** in the task: fix it within the task.
- **Spec conflict**, a gap or contradiction in the documents: classify it as described in [Spec conflicts during implementation](#spec-conflicts-during-implementation). The outcome is an assumption, a deviation with a follow-up, or `blocked`.
- **New scope** outside the task: note it in the result under `new_scope`; the runner files it as a bd task linked `discovered-from` the current one, with `needs-triage`.

## Spec conflicts during implementation

A spec conflict blocks only the work that depends on its answer. The agent records a local conflict and carries on; the owner settles it asynchronously in a follow-up. A conflict whose answer the rest of the epic depends on still stops the task.

### Precedence

When requirements pull apart, the interim choice follows one fixed order:

1. Invariants and hard limits: time and size limits, data safety, security.
2. Existing behaviour: no regression of what the application does today.
3. New behaviour the task introduces.

Read "at most N" and "up to X s" as upper bounds that must hold together, not as duties to reach the bound.

### Classification

The agent walks these questions in order and stops at the first that decides. No step may take an option the solution design records as discarded, because the owner has already rejected it: no interpretation in step 1 and no interim code in step 5.

0. **Would only a discarded option resolve the conflict?** Then `blocked`; the question names the option and quotes the reason recorded for discarding it, or says that none was recorded.
1. **Is every acceptance criterion met under one interpretation, chosen by precedence?** Then it is an **assumption**: decide, record and carry on.
2. **Does the conflict touch a requirement in the epic's `load_bearing` list?** Then `blocked`.
3. **Would the interim code be one-way:** a schema change or migration, a change to the meaning of stored data, a public module contract, an external integration, security? Then `blocked`.
4. **Is there no variant in which the epic stays consistent?** Then `blocked`.
5. **Does the deviation qualify** (below) and fit the limits? Then it is a **deviation**: implement the interim behaviour, mark it and describe the follow-up. Otherwise `blocked`.

An **assumption** needs all four: every criterion is met, the choice follows precedence, reversing it later is a local change, and a test covers the case the assumption rests on. An assumption may settle a `load_bearing` requirement when every criterion is met; the reviewer then checks it strictly and the owner confirms it first. Example: one requirement sorts a list by date, another puts pinned items first. Pinned items first, each group by date, meets both.

A **deviation** leaves a criterion or requirement unmet on purpose. Example: a shared rule says every export includes archived records, while a criterion of the task forbids changing what today's export contains for one client. Precedence keeps today's export; the shared rule for that client is deferred to a follow-up.

### What qualifies as a deviation

The kind is one of:

- a contradiction between at most two requirements;
- one requirement left underspecified, without effect on the others;
- a dependency on another task that is not done yet, with an interim patch or the requirement left unmet until then.

And every constraint holds:

- it is local to one module and touches one requirement;
- the interim code is isolated, so the follow-up replaces it without reworking anything else;
- it changes at most three files, not counting one-line edits such as a constant or a rename;
- it defers at most part of the task's criteria: at least one criterion is met, and the deferred ones are not the task's main outcome;
- at most two other open tasks of the epic mention the conflicting IDs, and those become blocked by the follow-up.

Limits: at most 2 deviations per task and at most 3 open follow-ups per epic; a task outside any epic has only the first. Past either limit the task finishes `blocked`.

### What the agent leaves behind

- **The interim code** carries the marker `FOLLOW-UP(<task id>/DEV-<n>)` in a comment at each place the follow-up will change. A test of interim behaviour has the same marker in its name, and an `it.todo` names the target behaviour, so whoever takes the follow-up knows which tests to flip.
- **The follow-up description**, written with the `write-documents` skill, for a developer who arrives without any context: the business context of the requirements, the conflict quoted with links to the requirement IDs, current behaviour with `file:line` at the commit, the interim decision and why it is safe, why a follow-up rather than a block (each qualification criterion), target options with their trade-offs, the decision the owner has to make, the marker, and how to verify the target. In the language of the specifications.
- **Each assumption** in the result with the requirements, the gap, the decision, the precedence rule applied and what changes if the owner decides otherwise, and a test of the case it rests on, so the reading is pinned before anyone confirms it.

Later tasks of the epic receive the open follow-ups in their prompt. They build no new behaviour on interim code. When they must touch it, they leave the marker in place and add the place to the follow-up through `new_scope`.

### What the runner checks

Deterministically, before the review: the result's shape; the limits; one or two requirement IDs per deviation; deferred criteria that are criteria of the task, not all of them, and none in `load_bearing`; every criterion either in the evidence or deferred; the marker added by the task's own diff; and at most two other open, non-follow-up tasks of the epic mentioning the deviation's IDs in their fields, not counting the epic's `shared` criteria, which every task names. An ID written inside a range such as `F2-01–F2-05` counts as mentioned; ranges in `load_bearing` count the same way. A failed check goes back to the agent as feedback.

The reviewer then judges what a script cannot: whether each deviation qualifies, whether the interim choice follows precedence, whether the follow-up description stands on its own, whether every assumption really meets every criterion and has a test of its case, whether an assumption on a `load_bearing` requirement fixes its meaning for the rest of the epic, and whether the change builds on another follow-up's interim code.

### Follow-ups and assumptions in bd

After the merge the runner creates each follow-up as a child of the epic (standalone for a task outside any epic), with `needs-info`, `metadata.type=follow-up`, `metadata.marker`, `metadata.origin` and `discovered-from` the task. Tasks of the epic that mention the deviation's IDs get the follow-up as a blocker. The follow-up goes through preparation like any task: the owner decides, documents are updated, and `ready-for-agent` hands it off. Its acceptance criteria include removing its markers.

Assumptions are collected in one triage task per epic, `metadata.type=assumptions` with `needs-triage`, outside the epic so it holds nothing back. The owner confirms each assumption in the solution design, or turns it into a change. Assumptions on `load_bearing` requirements are flagged there; confirm them first, since later tasks build on that reading.

A change to a requirement that would alter the epic's outcome is not a follow-up. Finish the epic in its consistent variant and prepare the change as a new epic.

## After merge

The owner pulls `main` from GitHub and tests it. Open follow-ups of the epic list the known deviations in `main`; they are not bugs. A defect found there becomes a new bug linked `discovered-from` the original task and goes through preparation. Check the epic's open follow-ups and its assumptions task, the flagged assumptions first.
