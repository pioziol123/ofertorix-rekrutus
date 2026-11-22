---
name: egm-review-task
description: Run the EGM (Elephant-Goldfish Model) consolidated review on one bd epic or task, given only its bd id. Use when the owner asks for "egm review", "review epika/taska przy pomocy egm", or "przygotuj review" of a prepared epic or task, before it is handed to the runner.
---

# EGM review of a bd epic or task

Run this skill in a subagent on model Sonnet 5.5 with medium effort (Agent tool: `model: "sonnet"`; when a caller spawns it, the caller sets these). The reviewers it spawns inherit the same model unless the owner says otherwise.

Input: one bd id, for example `oferty-pracy-nq3` or `oferty-pracy-nq3.2`. Nothing else is needed; this skill says where everything is. Output: a consolidated review report in Polish plus the reviewers' raw reports, in `docs/research/<key>-egm-review/`. The review is read-only: it changes no specification, no bd task and no git state.

## 1. Collect the material

1. `bd show <id> --long` and `bd show <id> --json`. Note `issue_type`, `parent` and `spec_id`. The line `Spec:` of a task, or `spec_id` of an epic, names a file in `docs/specs/<epic-key>-<name>/`. That directory is the specification set: `PRD.md`, `requirements.md`, `solution-design.md`. If the id has no spec, stop and tell the owner; there is nothing for reviewers to read.
2. Epic: take every child with `bd list --parent <id> --all` (closed and deferred included, marked as such in the export). A task: take the task and its parent epic. The epic gives the goal; the sibling tasks give dependencies, so list them with `bd show` but review only the task.
3. Export the tickets without colour codes to `docs/research/<key>-egm-review/tickets-export.md`: for each id, `bd show <id> --long`, separated by `---`. `<key>` is the epic's short key, e.g. `nq3`; for a task use the task's epic key and the suffix of the task, e.g. `nq3-2`. Check that the file has no escape characters.
4. Create `docs/research/<key>-egm-review/raw/`. If the directory already holds reports, ask the owner whether to overwrite or to use a new suffix `-2`.
5. Goldfish context (baseline reading, not under review): `GLOSSARY.md`; the architecture rules (`docs/architecture/moduly-i-zasady-kodu.md`, `moduly.md`, `README.md`); `docs/agents/implementation-workflow.md`; any prototype or earlier spec the PRD or the design links (follow the relative links in the three documents); `docs/research/` files the PRD cites. Documents outside the repository or URLs need the owner's approval.

Say in one line what you found (id, type, spec directory, number of tickets) and go on.

## 2. Find the EGM plugin

The review plugin lives in `~/.codex/plugins/cache/egm/egm/<version>/`. Take the single version directory that exists; never guess a version. Read its `skills/egm-review/SKILL.md` and `docs/claude.md` once, since they can change between versions; this skill follows them in the consolidated mode. If the plugin is missing, stop and tell the owner.

## 3. Run the consolidated review

The owner's standing choice is the consolidated report: all five stages without stopping. Use a different mode only if the owner asks. Stages 5, 6, 7 and 9 do not depend on each other when nothing edits the documents between them, so run their reviewers in one message as background agents; run stage 8 afterwards. Spawn `general-purpose` agents with the prompts in [prompts.md](prompts.md), filling `<ROOT>` (absolute repo path), `<EGM>` (plugin root), `<SPEC>` (the specification directory), `<OUT>` (the research directory), `<KEY>`, `<EPIC>` and `<CONTEXT>`. For a task review add to every prompt: "Review only task `<id>` (its section of the requirements and design, its ticket); read the rest for context and report cross-task problems only when they touch this task."

Nine reviewers in the first wave: stage 5 zoom-out and inventive catalyst; stage 6 comprehension; stage 7 design, structural and style; stage 9 implementation readiness, codebase details and style. Stage 8 is one zoom-out reviewer that reads the six earlier reports. Wait for the notifications; do not poll.

Reviewers write only their report under `<OUT>/raw/`. After the wave, run `git status --short` and check that no project file changed besides `<OUT>`.

## 4. Consolidate

Read every raw report (the summaries the agents return are not enough for line references). Write `<OUT>/consolidated_review_report.md` in Polish, in the owner's domain language: who is affected and what breaks first, mechanism after. Expand every label, requirement id and code term the owner has not used. Structure:

- header: date, method, what was read, whether documents were uncommitted, counts per severity in the raw reports;
- overall assessment in a few sentences: can the tickets go to the runner;
- 🔴 blockers;
- decisions for the owner: problems where the documents hide a choice that only the owner can make, with the options and their consequences, each ending "Decyzja należy do Ciebie";
- 🟡 major findings grouped by theme (terms with several meanings, contradictions, gaps that stop an implementer, structure, scope), duplicates merged;
- 🟢 minor findings in one list;
- reservations: what a reviewer did not read, findings the stage 8 reviewer judged overstated (check each against the code or documents before keeping it), and what nobody measured;
- origin map: table of point → raw report and finding ids.

Verify disputed claims yourself before putting them in the report. Do not drop a blocker or a major because it is awkward for an earlier owner decision; say which decision it questions.

## 5. Report to the owner

Give the path of the report, the blocker, the decisions for the owner in one line each, and the reservations. End with the question which decision to discuss first. Do not edit the specification, change bd tasks, commit or push. Follow-up fixes are separate work and need the owner's go-ahead.
