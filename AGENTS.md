# Agent Instructions

This file is the index of the project's agent documentation. It names each family of documents, says when to read it and where it starts. Every other document reaches another family through the name this index gives it.

## Documentation map

| Name | Entry | Read it |
| --- | --- | --- |
| **Process contract** | `docs/agents/implementation-workflow.md` | Before preparing or implementing a task. It defines the specification documents, bd tasks and their labels, the hand-off, the runner and how spec conflicts are classified. |
| **Architecture rules** | `docs/architecture/` (files below) | Before designing, implementing or reviewing a change. They bind every task, whether or not its documents cite them. |
| **Domain docs** | `docs/agents/domain.md` | Before exploration, specification or design. It lists the glossary, confirmed product decisions and ADRs. |
| **Tracker guide** | `docs/agents/issue-tracker.md` | Before bd operations. Use bd for specifications, tasks and dependencies. |
| **Triage labels** | `docs/agents/triage-labels.md` | When classifying issues. It defines the labels that say what state an issue is in and who acts next. |
| **Specifications** | `docs/specs/` | When working on an epic or task: the PRD, requirements and solution design it links. The process contract sets their layout. |
| **Research** | `docs/research/` | When a question may already have been investigated, and to store the assets of a new investigation. Each file or directory holds one investigation; the bd issue it resolved links to it. Findings describe what was true when gathered; confirmed decisions live in the domain docs and specifications. |

The architecture rules span several files with different roles:

- `docs/architecture/moduly-i-zasady-kodu.md` holds the binding rules: dependencies between modules, code structure, database access and the costs of design decisions. Check every design option and every change against them.
- `docs/architecture/moduly.md` maps modules to what they own. Use it to place a change in the module that owns its data and rules.
- `docs/architecture/README.md` describes the current code as C4 diagrams. It orients you in the system; it does not bind decisions.

## How documents refer to each other

Paths to agent documentation live in this file only. A process document, a skill or a runner prompt names another family by its name from the map above, for example "the architecture rules", and the reader finds the path here. A document may still give paths to the files it describes itself and to files of its own family. Specifications may link a specific rule they cite as evidence. When a family moves or splits, update its row in the map.


## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

### Repository opt-in: autonomous task completion

This repository opts in to autonomous completion of implementation tasks. It relaxes the Conservative profile for commits and local merges only:

- An agent may commit, merge the task's work into the local default branch, and close its bd task when all gates pass: tests, typecheck, lint, the checks named by the task's acceptance criteria, and an independent spec-conformance review in a fresh context. Record in bd before closing the evidence for each acceptance criterion, or the registered deviation that defers it.
- If any gate fails, or a spec conflict is discovered that `docs/agents/implementation-workflow.md` (section "Spec conflicts during implementation") classifies as blocking, do not merge; report it and leave the task open. Assumptions and qualifying deviations are recorded and merged as that section describes.
- Pushing to any remote and Dolt remote sync still require explicit user authorization.
- A current user instruction not to commit or merge still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
