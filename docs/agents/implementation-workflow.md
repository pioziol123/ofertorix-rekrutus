# Implementation workflow

Work moves through two phases separated by a **hand-off**:

1. **Preparation** happens with the owner. Any input (a bd epic, a ticket, a document, a chat request) becomes specification documents and a bd task that meets the readiness checklist. The `task-prep` skill runs this phase. Applying `ready-for-agent` is the hand-off.
2. **Execution** happens unattended. The runner (`node .sandcastle/runner.ts`) takes ready tasks one at a time, has an agent implement each in its own sandbox, runs the gates, merges into `master` and closes the task. The agent follows the `implement-task` skill. The owner's next contact with the work is testing `master`.

The `spec-docs` skill owns how the documents are written. This file owns how documents, tasks and the runner connect.

## Documents

| Document | Scope | bd |
| --- | --- | --- |
| PRD | Epic: problem, outcomes, scope, stages | The epic; `spec_id` is the PRD path |
| Requirements | Slice: observable behaviour and acceptance criteria with stable IDs | Linked from the task |
| Solution design | Slice: decisions, exact contracts, verification | Linked from the task |

ADRs, architecture documents and RFCs supplement these documents. Link them from the PRD or the solution design; every epic still has a PRD.

A **slice** is one vertical, demoable increment that a person can review in one sitting. Split a slice when it holds behaviours that can be accepted separately, needs more than about 15 acceptance criteria, or changes the public contract of more than one module. Several slices can share one requirements or design file when each slice owns a section with stable IDs.

## The implementation task

One bd task (type `task`, `bug` or `feature`) per slice, a child of its epic. The task points at the documents and holds no copy of their rules:

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

## Readiness checklist

Before applying `ready-for-agent`:

- Every linked document exists in the default branch and the anchors resolve.
- Each acceptance criterion is observable and names how it is checked (test, command or inspection).
- The solution design states the contracts the slice touches exactly enough to implement without guessing.
- No open question blocks the slice; non-blocking assumptions are recorded in the documents.
- Blocking dependencies are wired in bd.

The runner re-checks the first item and the presence of acceptance criteria deterministically and returns the task as `needs-info` when they fail.

## Execution

Every agent runs in a Sandcastle `docker()` sandbox built from `.sandcastle/Dockerfile`: the project's toolchain, PostgreSQL with the schema migrated from the commit the image was built from, and Claude Code. The sandbox sees its own worktree and nothing else of the host: no owner database, no Docker, no files outside the repository's git data. Inside it the agent runs without permission prompts; the container is the boundary.

For each task, in order:

1. Pick the first task from `bd ready` with `ready-for-agent` and neither `ready-for-human` nor `needs-info`; claim it. Rebuild the sandbox image first when `pnpm-lock.yaml` or `.sandcastle/Dockerfile` changed on `master`.
2. Create a sandbox on branch `agent/<task-id>` from `master`.
3. Run the implementing agent (`claude-opus-5-5`, effort `medium` by default) with the task and its documents. The agent writes a result file and commits on its branch; bd, merging and `master` belong to the runner.
4. Check that `master` did not move during the run (the sandbox can write the shared git data); restore it and stop if it did. Check the result file, a clean worktree and at least one commit, then rebase the branch on `master`.
5. In a fresh sandbox on a copy of the branch, run the gate (see Commands), then a separate reviewing agent against the diff, the documents and the acceptance criteria. Its verdict is `pass` or `fail` with findings. Only committed work reaches this step.
6. On success: fast-forward `master` to the branch, comment the evidence, file follow-ups as `discovered-from` tasks with `needs-triage`, close the task.
7. On failure: rerun step 3 once on the same branch with the failure report, then step 5 again. A second failure, a `blocked` result or a rebase conflict removes `ready-for-agent`, adds `needs-info`, comments the reason and keeps the branch for inspection.

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

- **Code defect** in the slice: fix it within the slice.
- **Specification gap or contradiction** that changes behaviour or a contract: stop and return `blocked` with the question. The task goes back to preparation.
- **New scope** outside the slice: note it in the result as a follow-up; the runner files it as a bd task linked `discovered-from` the current one, with `needs-triage`.

## After merge

The owner tests `master`. A defect found there becomes a new bug linked `discovered-from` the original task and goes through preparation.
