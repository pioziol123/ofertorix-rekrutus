# Implementation workflow

Work moves through two phases separated by a **hand-off**:

1. **Preparation** happens with the owner. Any input (a bd epic, a ticket, a document, a chat request) becomes specification documents and a bd task that meets the readiness checklist. The `task-prep` skill runs this phase. Applying `ready-for-agent` is the hand-off.
2. **Execution** happens unattended. The runner (`node scripts/agent-runner.ts`) takes ready tasks one at a time, has an agent implement each in its own worktree, runs the gates, merges into `master` and closes the task. The agent follows the `implement-task` skill. The owner's next contact with the work is testing `master`.

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

For each task, in order:

1. Pick the first task from `bd ready` with `ready-for-agent` and neither `ready-for-human` nor `needs-info`; claim it.
2. Create a worktree on branch `agent/<task-id>` from `master`.
3. Run the implementing agent (Claude Code by default: Opus, effort `medium`) with the task and its documents. The agent writes a result file and never touches bd or `master`.
4. Rebase the branch on `master` and run the gate in the worktree (see Commands).
5. Run a separate reviewing agent in a fresh process against the diff, the documents and the acceptance criteria. Its verdict is `pass` or `fail` with findings.
6. On success: fast-forward `master` to the branch, close the task with the evidence as a comment, remove the worktree.
7. On failure: rerun step 3 once with the failure report, then gates and review again. A second failure, a `blocked` result or a merge conflict removes `ready-for-agent`, adds `needs-info`, comments the reason and keeps the worktree for inspection.

The runner never pushes and never syncs Dolt; pushing `master` stays with the owner.

Run it in a terminal from the main checkout, on a clean `master`:

- `node scripts/agent-runner.ts --dry-run` lists the candidates, the readiness verdict for each and the commands it would use, without writing anything.
- `node scripts/agent-runner.ts --once` processes at most one task; without `--once` it polls every `--interval` minutes.
- `--task <id>`, `--agent claude|codex`, `--model`, `--effort`, `--budget` and `--gate` override the defaults.

Worktrees and logs live in `../oferty-pracy-agent-worktrees/`.

## Commands

Dependencies and tools exist only in Docker. Agents and the runner use a separate Compose project, `oferty-pracy-agent`, bound to the current worktree, with its own database and dependency volumes and its web port on 3199. Tests and migrations there never touch the owner's development stack.

- `scripts/agent-exec.sh <command>` runs one command in its `tools` service, for example `scripts/agent-exec.sh pnpm vitest run tests/offers.test.ts`.
- `scripts/agent-gate.sh` is the gate: install, build, start `web` and `worker` from the worktree, run `pnpm check` with integration tests, stop the services.
- `scripts/agent-compose.sh <args>` is the underlying `docker compose` call for anything else.
