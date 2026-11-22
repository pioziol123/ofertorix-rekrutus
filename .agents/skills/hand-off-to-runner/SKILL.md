---
name: hand-off-to-runner
description: Hand a prepared bd task or epic to the runner, or hand back a task the runner returned, and prove the runner sees it. Use when the conversation is about giving work to the runner, applying ready-for-agent, putting a needs-info task back in the runner's queue, or a task the runner does not pick up.
---

# Hand a task to the runner

A hand-off is done when the runner's own dry run says `would implement` for the task. A label change alone proves nothing: the runner reads labels, status, assignee, blockers, the epic and the documents on `main` at GitHub, and a hand-off that skips one of them leaves the task silently unseen.

The process contract (named in the agent instructions) owns the rules; this skill is the order of checks. Read the process contract's sections Labels, Epic hand-off, Readiness checklist and Continuation once before step 1. Answer in the owner's language and domain terms, as the agent instructions' section on talking to the owner says.

## Steps

1. **Name what is handed.** List the task ids the owner named in this conversation, and the epic when a task has one. Read each with `bd show <id>`. Labels go only on what the owner named. Done when the list is written down and each entry is a task, bug or feature (the runner never takes an epic itself).

2. **Check each task in bd.** Done when every line holds, each read from `bd show`:
   - status `open`, no future `defer_until`, no assignee. A leftover claim from a stopped run is released with `bd unclaim <id>`.
   - every dependency under DEPENDS ON is closed. An open blocker, including a follow-up the runner wired, keeps the task out of `bd ready`.
   - `metadata.prd`, `metadata.requirements`, `metadata.sd` and `spec_id` are set, or `metadata.lane=small` with `metadata.prd`; `acceptance_criteria` holds one `AC-ID: observable result` per line.
   - labels: `ready-for-agent` is the one to apply; `needs-info` and `ready-for-human` are absent; `start-fresh` is present only when the owner ordered a restart from `main`.

3. **Settle a returned task first.** A task with a comment beginning "Runner returned the task" has `kept_branch` and `kept_base` in its metadata. Done when:
   - the owner's decision is a comment added after that return comment, because the next agent reads only the state note, the comments after the return and the documents' diff;
   - `git ls-remote --heads origin <kept_branch>` lists the branch, or the owner chose `start-fresh`;
   - an open question of the return is answered through the `answer-returned-task` skill, which ends by calling this one.

4. **Put the documents on GitHub.** Run the readiness checklist of the process contract on the task. Then commit only the documents the task links, with a message that starts with the task id and names what the documents now say, and push `main` to `origin`; the owner's request to hand off covers this commit and push, nothing wider. Run `node scripts/check-spec-sync.ts <task id>` and, for an epic, the same with the epic id. Done when both exit 0 and `node scripts/check-spec-altitude.ts <linked documents>` exits 0. When a check fails, every label stays as it is (a returned task keeps `needs-info`) and the owner sees the check's output.

5. **Check the epic.** The nearest epic carries `ready-for-agent`, and every open child that is not a follow-up, closed, deferred or `ready-for-human` carries `ready-for-agent` without `needs-info`. One returned or unprepared sibling stops the whole epic. The epic's own `ready-for-agent` is applied when the owner asks for it, for a first hand-off and for an epic the runner took back (`needs-info`, `follow_ups=true`, which gets `ready-for-agent` in place of `needs-info`). The epic's `metadata.load_bearing` and `metadata.shared` are present; when they are missing, the owner hears that the epic still needs preparation and no epic label is applied. Done when `bd show <epic id>` agrees, or the owner has been told which sibling or missing field holds the epic.

6. **Apply the labels in one command per task**, after the push of step 4:

   ```bash
   bd update <task id> --remove-label needs-info --add-label ready-for-agent
   ```

   A returned task has lost `ready-for-agent`, so removing `needs-info` alone leaves it unlabelled and invisible. Done when `bd show` lists `ready-for-agent` and no `needs-info`.

7. **Prove the runner sees it.** The runner's copy is the clone beside this one with the suffix `-runner`.

   ```bash
   cd ../oferty-pracy-runner && node .sandcastle/runner.ts --dry-run
   ```

   The dry run writes nothing to bd. Done when each handed task shows `would implement`. A task that is missing from the candidates fails a condition of step 2; `bd ready --explain` names the blocker. `waits: epic …` sends you to step 5, `waits: documents not on main …` to step 4, `would return as needs-info: …` to step 2.

8. **Report.** One short message to the owner in Polish: which tasks the runner will take next, which wait and what they wait for, and the dry run's verdict. When the dry run says the runner's program is newer, add the owner's command to update it (`node .sandcastle/setup.ts`). Starting the runner (`node .sandcastle/runner.ts`) is the owner's act; give the command and stop there. The task list and the labels are the hand-off, so no further question is needed.
