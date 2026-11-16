# Issue tracker

Use Beads (`bd`) in this repository for specifications, tasks,
dependencies and persistent project knowledge.

Start with `bd prime`. Use the installed beads skill for workflow guidance.

## Operations

- Inspect: `bd ready`, `bd list --json`, `bd show <id>`.
- Create specifications as epics and implementation tasks as their children.
- Include acceptance criteria in each implementation task.
- Apply the triage labels.
- Record blockers with `bd dep add <task> <blocker>`.
- Claim work with `bd update <id> --claim`.
- Close completed work with `bd close <id>`.

Specifications and implementation tasks use `ready-for-agent`
after their required review and approval. Implementation tasks
follow the process contract: document links in
metadata, the readiness checklist and the unattended runner.

Product documents and ADRs explain requirements and decisions;
Beads tracks work and its status.

## Authority

Git commits, pushes and remote Dolt synchronization require explicit
user authorization. No Git remote is currently configured.

## Wayfinding operations

- Create the canonical map as an epic labelled `wayfinder:map`.
- Create decision tickets as children with `--parent <map-id>` and
  `--no-inherit-labels`. Give each exactly one type label:
  `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`
  or `wayfinder:task`. Wayfinding issues carry only `wayfinder:` labels.
- Query map children with `bd list --parent <map-id> --json`.
  The frontier is `bd list --parent <map-id> --ready --no-assignee --json`.
- Wire native blockers with `bd dep add <dependent> <blocker>` after
  all referenced tickets exist.
- Claim a ticket with `bd update <id> --claim` before working on it.
- Record its resolution using `bd comment <id>`, then close it and append
  a named context pointer to the map's Decisions so far section.
- Refer to issues by title in prose, with `bd show <id>` as the local
  retrieval pointer. Store research assets under `docs/research/` and
  link their paths from the resolution comment.
- Keep research assets in the current checkout while Git commits and
  pushes lack authorization. Do not switch branches in the shared
  checkout while research agents are writing independent files.
