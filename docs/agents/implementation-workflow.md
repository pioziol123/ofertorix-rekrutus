# Implementation workflow

Work moves through two phases separated by a **hand-off**:

1. **Preparation** happens with the owner. Any input (a bd epic, a ticket, a document, a chat request) becomes specification documents and a bd task that meets the readiness checklist. The `task-prep` skill runs this phase. Applying `ready-for-agent` is the hand-off.
2. **Execution** happens unattended. The runner (`node .sandcastle/runner.ts`) takes ready tasks one at a time, has an agent implement each in its own sandbox, runs the gates, merges into `master` and closes the task. The agent follows the `implement-task` skill. The owner's next contact with the work is testing `master`.

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
- **Solution design**: every technical decision, the requirements restated in precise technical language. It names libraries, mechanisms and data semantics, but not concrete paths, file names or function names; the implementer chooses those.

Specifications are written in Polish and call the unit of work *zadanie*.

An epic's documents live in `docs/specs/<epic>-<slug>/`, where `<epic>` is the epic's bd id without the project prefix, for example `docs/specs/0mq-architektura-modulow/` for `oferty-pracy-0mq`. Specifications written before this rule keep their directories.

ADRs, architecture documents and RFCs supplement these documents. Link them from the PRD or the solution design; every epic still has a PRD.

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

A task leaves preparation with `ready-for-agent` only. Mark a task `ready-for-human` when its work needs the owner during implementation, for example a manual product check or access only the owner has.

## Metadata the runner reads and writes

| Where | Key | Set by | Meaning |
| --- | --- | --- | --- |
| Epic | `load_bearing` | Preparation | Comma-separated requirement and criterion IDs the epic rests on, for example `R-03,T2-AC04`. A conflict touching one of them always blocks. Missing means none is marked. |
| Epic | `follow_ups` | Runner | `true` while every other child is closed and open follow-ups remain. See [Epic with open follow-ups](#epic-with-open-follow-ups). |
| Task | `type` | Runner | `follow-up` on a task created from a deviation. |
| Task | `marker`, `origin` | Runner | On a follow-up: the code marker it owns and the task that created it. |
| Task | `type`, `epic` | Runner | `assumptions` and the epic id on the triage task that collects assumptions to confirm. |

## Epic hand-off

An epic is handed off as a whole. Apply `ready-for-agent` to the epic only when every open child task carries `ready-for-agent` or `ready-for-human`; closed and deferred children do not count. Membership follows the `parent` field: a task moved out of the epic with `bd update --parent ""` keeps its dotted id but no longer counts. Until then the runner takes none of the epic's tasks, even those already marked ready, so `master` holds no part of an epic whose remaining work may still change its decisions. The one exception is a registered deviation; see [Spec conflicts during implementation](#spec-conflicts-during-implementation).

The runner checks this before each task: the nearest epic above the task carries `ready-for-agent`, and none of the epic's open children is unlabelled or `needs-info`. Follow-ups are left out of this check: an open follow-up keeps the epic open but does not pause its other tasks. A task the runner returns as `needs-info` pauses the rest of its epic until preparation resolves it. A `ready-for-human` task does not hold the epic back; its dependants wait in bd until the owner closes it. Tasks outside any epic are handed off one by one.

Preparation also records the epic's `load_bearing` requirements: the decisions most of the epic builds on, such as a shared status model, contracts between modules or limits. Ask the owner which ones they are when the epic is handed off.

### Epic with open follow-ups

Before each pass the runner updates every handed-off epic from the state of its children:

- `follow_ups=true` while every child except the follow-ups is closed or deferred and some follow-up is open; the key is removed otherwise.
- When that phase begins and some follow-up still lacks `ready-for-agent`, the runner takes the epic back: `needs-info` instead of `ready-for-agent`. The epic's ready follow-ups wait with it.

The runner never hands an epic off. Once every open follow-up is prepared and carries `ready-for-agent`, preparation (the `task-prep` skill) hands the epic off again with the owner's approval, as in the first hand-off, and the runner implements the follow-ups. A follow-up that implementing a follow-up files takes the epic back again. Removing `ready-for-agent` pauses an epic in any phase.

An epic with open follow-ups is not finished, and its follow-ups list the known deviations in `master`.

## Readiness checklist

Before applying `ready-for-agent`:

- Every linked document exists in the default branch and the anchors resolve.
- Each acceptance criterion is observable and names how it is checked (test, command or inspection).
- The solution design states the contracts the task touches exactly enough to implement without guessing.
- No open question blocks the task; non-blocking assumptions are recorded in the documents.
- Blocking dependencies are wired in bd.

The runner re-checks the first item and the presence of acceptance criteria deterministically and returns the task as `needs-info` when they fail.

## Execution

Every agent runs in a Sandcastle `docker()` sandbox built from `.sandcastle/Dockerfile`: the project's toolchain, PostgreSQL with the schema migrated from the commit the image was built from, and Claude Code. The sandbox sees its own worktree and nothing else of the host: no owner database, no Docker, no files outside the repository's git data. Inside it the agent runs without permission prompts; the container is the boundary.

For each task, in order:

1. Pick the first task from `bd ready` with `ready-for-agent`, neither `ready-for-human` nor `needs-info`, and an epic that passes the epic hand-off check; claim it. Rebuild the sandbox image first when `pnpm-lock.yaml` or `.sandcastle/Dockerfile` changed on `master`.
2. Create a sandbox from `master` on the task branch `<epic>-<task>-<title slug>`, for example `0mq-13-wprowadzic-wspolne-zarzadzanie-polaczeniami` for `oferty-pracy-0mq.13`. Ids drop the project prefix; the task part is relative to the epic, and a task outside any epic uses its own id alone. Branches made by hand follow the same prefix.
3. Run the implementing agent (`claude-opus-5-5`, effort `medium` by default) with the task and its documents. The agent runs the gate itself before finishing, writes a result file and commits on its branch; bd, merging and `master` belong to the runner.
4. Check, in the same warm sandbox: `master` did not move during the run (the sandbox can write the shared git data; the runner restores it and stops if it did), the result file exists, the worktree is clean, the branch has commits and rebases cleanly on `master`, the result's shape and deviations pass the [deterministic checks](#what-the-runner-checks), and the gate passes.
5. In a fresh sandbox on a copy of the branch, run the gate again, then a separate reviewing agent against the diff, the documents, the acceptance criteria and the result's assumptions and deviations. Its verdict is `pass`, `pass-with-deferral` (every deviation accepted) or `fail` with findings. A result with deviations needs `pass-with-deferral`. Only committed work reaches this step.
6. When step 4 or 5 fails, send the report back into the implementing agent's session in the same warm sandbox (Sandcastle resume), so it keeps its context, and repeat from step 4. After three such feedback turns, or on a `blocked` result, a rebase conflict or a moved `master`, remove `ready-for-agent`, add `needs-info`, comment the reason and keep the branch for inspection.
7. On success: fast-forward `master` to the branch, comment the evidence, the assumptions and the deviations, file a follow-up for each deviation and wire it to block the tasks that depend on it, add the assumptions to the epic's assumptions task, file new scope as `discovered-from` tasks with `needs-triage`, and close the task.

The runner never pushes and never syncs Dolt; pushing `master` stays with the owner.

Run it in a terminal from the main checkout, on a clean `master`, after `npm install` in `.sandcastle/` and with `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) in `.sandcastle/.env`:

- `node .sandcastle/runner.ts --dry-run` lists the candidates and the readiness verdict for each, without writing anything.
- `node .sandcastle/runner.ts --once` processes at most one task; without `--once` it polls every `--interval` minutes.
- `--task <id>`, `--model`, `--effort` and `--rebuild-image` override the defaults.

Logs live in `.sandcastle/logs/`.

## Commands

Inside the sandbox, run project commands directly from the worktree root:

- `scripts/gate.sh` is the gate: `pnpm install --offline --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` and `scripts/test-integration.sh`.
- `scripts/test-integration.sh` starts PostgreSQL, applies pending migrations, builds the app, runs the web server and the worker in the background, runs every test including integration, and stops what it started.
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

The agent walks these questions in order and stops at the first that decides:

1. **Is every acceptance criterion met under one interpretation, chosen by precedence?** Then it is an **assumption**: decide, record and carry on.
2. **Does the conflict touch a requirement in the epic's `load_bearing` list?** Then `blocked`.
3. **Would the interim code be one-way:** a schema change or migration, a change to the meaning of stored data, a public module contract, an external integration, security? Then `blocked`.
4. **Is there no variant in which the epic stays consistent?** Then `blocked`.
5. **Does the deviation qualify** (below) and fit the limits? Then it is a **deviation**: implement the interim behaviour, mark it and describe the follow-up. Otherwise `blocked`.

An **assumption** needs all three: every criterion is met, the choice follows precedence, and reversing it later is a local change. Example: one requirement sorts a list by date, another puts pinned items first. Pinned items first, each group by date, meets both.

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
- **Each assumption** in the result with the requirements, the gap, the decision, the precedence rule applied and what changes if the owner decides otherwise.

Later tasks of the epic receive the open follow-ups in their prompt. They build no new behaviour on interim code. When they must touch it, they leave the marker in place and add the place to the follow-up through `new_scope`.

### What the runner checks

Deterministically, before the review: the result's shape; the limits; one or two requirement IDs per deviation; deferred criteria that are criteria of the task, not all of them, and none in `load_bearing`; every criterion either in the evidence or deferred; the marker added by the task's own diff; and at most two other open, non-follow-up tasks of the epic mentioning the deviation's IDs in their fields. A failed check goes back to the agent as feedback.

The reviewer then judges what a script cannot: whether each deviation qualifies, whether the interim choice follows precedence, whether the follow-up description stands on its own, whether every assumption really meets every criterion, and whether the change builds on another follow-up's interim code.

### Follow-ups and assumptions in bd

After the merge the runner creates each follow-up as a child of the epic (standalone for a task outside any epic), with `needs-info`, `metadata.type=follow-up`, `metadata.marker`, `metadata.origin` and `discovered-from` the task. Tasks of the epic that mention the deviation's IDs get the follow-up as a blocker. The follow-up goes through preparation like any task: the owner decides, documents are updated, and `ready-for-agent` hands it off. Its acceptance criteria include removing its markers.

Assumptions are collected in one triage task per epic, `metadata.type=assumptions` with `needs-triage`, outside the epic so it holds nothing back. The owner confirms each assumption in the solution design, or turns it into a change.

A change to a requirement that would alter the epic's outcome is not a follow-up. Finish the epic in its consistent variant and prepare the change as a new epic.

## After merge

The owner tests `master`. Open follow-ups of the epic list the known deviations in `master`; they are not bugs. A defect found there becomes a new bug linked `discovered-from` the original task and goes through preparation. Before pushing `master`, check the epic's open follow-ups.
