# Cheaper return to returned tasks — Requirements

Beads epic: `oferty-pracy-5yd`. Goal and scope: [PRD](PRD.md). Technical decisions: [solution design](solution-design.md).

The requirements come from the owner's decisions in the conversation of 18 November 2026. Each section describes one Beads task of the epic. Requirement IDs (`<section>-R..`) and criterion IDs (`<section>-AC..`) are stable, and the Beads task cites criteria by ID.

<a id="terms"></a>

## Terms

| Term | Meaning |
| --- | --- |
| Attempt | One run of a task by the runner, from claiming it to delivery or return. |
| Return of a task | Giving a task back to preparation with the reason, when the runner cannot finish the attempt. The task gets `needs-info`. |
| Kept work | The commits of a returned attempt, which the runner pushes to GitHub on a branch with the return prefix. |
| Continuation | An attempt that starts from the kept work of the previous attempt instead of from `main`. |
| State note | What the implementing agent leaves when an attempt stops before it is done: the open question, the state of each criterion, what remains, the decisions with their reasons, approaches dropped, and the state of the checks. The agents' skills define its shape. |
| Owner's answer | The comments added to the task after its return, and the change of the task's documents since the commit the returned attempt worked on. |
| Feedback turn | A report sent back to the implementing agent in its running session so that it corrects the work. Three per attempt. |
| Environment failure | An error with which opening a sandbox, a command in it or the agent's process ends. A failed check, a failed review and an error of the task database are not environment failures. |
| Owner finding | A review finding whose removal needs a choice the documents leave open, or a change of a document. Every other finding is a fix finding. |
| Assumption | A decision the implementing agent takes itself where the documents leave a question open, recorded for the owner to confirm later. |
| Assumption marker | A comment `ASSUMPTION(<task id>/<assumption id>)` at each place of the code that relies on an assumption. | <!-- altitude-ok: the marker's literal form is what agents and the owner search for -->

<a id="shared"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| W-AC01 | The runner's type check and automated tests pass. | Running the runner's checks |
| W-AC02 | The process contract describes the changed behaviour, and no statement in it contradicts the change. | Review of the documents |

<a id="fmt"></a>

## Task FMT — The gate checks formatting of the task's changes

Small lane. The shared criterion of other epics requires formatted code, but the gate does not check formatting, so the reviewer fails tasks for it.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| FMT-AC01 | A file the task changed is not formatted: the gate fails and its message names that file. | Automated test |
| FMT-AC02 | Only files the task did not change are not formatted: the gate passes. | Automated test |
| FMT-AC03 | Formatting is checked the same way in the agent's sandbox, in the runner's fresh sandbox, and when the owner runs the gate by hand. | Review |
| FMT-AC04 | The process contract names the formatting check in its description of the gate. | Review of the documents |

<a id="con"></a>

## Task CON — A returned task continues the kept work

Today an attempt always starts from `main`, so a returned task is implemented again from nothing. A continuation starts from the kept work and gives the new agent what the previous one knew and what the owner decided.

| Requirement | Content |
| --- | --- |
| CON-R01 | When a task is returned with kept work, the runner records in the task which kept work it is and the commit of `main` the attempt worked on. |
| CON-R02 | The next attempt of a task with recorded kept work is a continuation, whatever the cause of the return. |
| CON-R03 | A continuation starts from the kept work replayed on the current `main`. A conflict during the replay is resolved by the agent as a feedback turn, as during delivery today. |
| CON-R04 | The agent of a continuation receives, beside what every attempt receives: the state note of the returned attempt when there is one, the owner's answer, and the last review report when there was one. |
| CON-R05 | The owner can order a fresh start with a label on the task. The runner then ignores the kept work and removes the label when it claims the task. |
| CON-R06 | When the recorded kept work is no longer on GitHub, the attempt starts from `main`, and the runner logs why. The task is not returned for it. |
| CON-R07 | The review of a continuation covers the task's whole change against `main`. |
| CON-R08 | Feedback turns and environment retries count from zero in every attempt. |
| CON-R09 | When an attempt is about to be returned because of an owner finding or because its feedback turns are used up, the runner first asks the running agent for a state note. This request is not a feedback turn. When the agent writes no note, the task is returned without one. |
| CON-R10 | The state note the agent writes travels with the return: the runner keeps it in the return's comment as data, so the owner's agent and the next attempt can read it. |
| CON-R11 | The agents' skill that writes the state note is available in the implementing agent's sandbox. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| CON-AC01 | A task returned with kept work and handed off again: the new attempt's branch starts from the kept commits replayed on the current `main`, and the agent receives the note, the owner's comments added after the return, the change of the task's documents since the recorded commit, and the last review report. | Automated test |
| CON-AC02 | Comments added before the return are not part of the owner's answer. | Automated test |
| CON-AC03 | The replay of the kept work conflicts with `main`: the agent receives a feedback turn naming the files and commits, as during delivery. | Automated test |
| CON-AC04 | The task carries the fresh-start label: the attempt starts from `main`, and the label is gone after the claim. | Automated test |
| CON-AC05 | The kept work recorded in the task is missing on GitHub: the attempt starts from `main`, the log says why, and the task is not returned. | Automated test |
| CON-AC06 | An attempt whose feedback turns are used up: the agent gets one request for a state note, the note is in the return's comment, and the turn counter shows three turns. | Automated test |
| CON-AC07 | The agent answers the request for a state note without writing one: the task is returned with its reason and without a note. | Automated test |
| CON-AC08 | A continuation's review receives the diff of the whole task against `main`. | Automated test |
| CON-AC09 | The skill for the state note is mounted in the implementing agent's sandbox. | Review |

<a id="env"></a>

## Task ENV — Retry after an environment failure

An environment failure is not a matter for the owner. The runner retries by itself, on the work that survived the failure.

| Requirement | Content |
| --- | --- |
| ENV-R01 | An environment failure in the implementing agent's sandbox does not return the task while retries remain. The runner opens a new sandbox on the same work directory, so committed and uncommitted work stays, and starts a new agent there. |
| ENV-R02 | The new agent receives the task as a continuation does, with the information that the previous agent stopped on an environment failure and the last review report when there was one. The previous agent's conversation is not resumed. |
| ENV-R03 | An environment failure in the fresh sandbox of the gate or the review repeats that check in a new fresh sandbox. |
| ENV-R04 | An attempt has at most two environment retries, counted together for both kinds of sandbox and apart from feedback turns. |
| ENV-R05 | After the second retry a further environment failure returns the task. The return's comment says the cause is the environment and quotes every failure of the attempt. |
| ENV-R06 | A restart of the runner during a task is outside this task: the task stays claimed as today. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| ENV-AC01 | The agent's process fails in the first turn: a new agent starts in a new sandbox on the same work directory, an uncommitted file of the failed agent is still there, and the task is delivered. | Automated test |
| ENV-AC02 | The gate's fresh sandbox fails to open: the gate runs again in a new fresh sandbox, and the feedback turn counter is unchanged. | Automated test |
| ENV-AC03 | A third environment failure in one attempt: the task is returned, and the comment names the environment as the cause and quotes all three failures. | Automated test |
| ENV-AC04 | A failed gate, a failed review and an error of the task database do not count as environment failures. | Automated test |

<a id="rev"></a>

## Task REV — The reviewer separates corrections from the owner's decisions

Feedback turns are for what the agent can fix. A question only the owner can settle ends the attempt at once.

| Requirement | Content |
| --- | --- |
| REV-R01 | The reviewer marks every finding as a fix finding or an owner finding. Taking an option the solution design records as discarded is a fix finding: the documents settle it. |
| REV-R02 | An owner finding states the conflict with the quoted requirements, the options with their consequences, and the reviewer's recommendation, in the shape of the state note's question. |
| REV-R03 | When at least one finding is an owner finding, the attempt ends without a feedback turn: the runner asks the agent for a state note, which carries the owner findings and the fix findings, and returns the task. |
| REV-R04 | When every finding is a fix finding, it goes back to the agent as a feedback turn, as today. |
| REV-R05 | A stop the agent did not need is a fix finding: an agent that finished as blocked where an assumption or a follow-up was allowed (section AUT). |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| REV-AC01 | A review with one owner finding and one fix finding: no feedback turn, one request for a state note, the task returned, and the comment carries both findings. | Automated test |
| REV-AC02 | A review with fix findings only: a feedback turn with those findings. | Automated test |
| REV-AC03 | A review whose findings carry no marking: every finding counts as a fix finding, and the runner behaves as for REV-AC02. | Automated test |
| REV-AC04 | The reviewer's instruction defines both kinds, the shape of an owner finding, and the rule that a discarded option and an unneeded stop are fix findings. | Review |

<a id="aut"></a>

## Task AUT — Agents take reversible decisions themselves and know the epic's assumptions

The agent stops only for what cannot be undone by changing code. Everything else becomes an assumption or a follow-up, and later tasks of the epic build on assumptions knowingly.

| Requirement | Content |
| --- | --- |
| AUT-R01 | The agent looks for the answer to an open question in the documents, the architecture rules, the glossary, the ADRs, confirmed assumptions and the code. The code is evidence of existing patterns and behaviour; the documents are evidence of what new behaviour is meant to be. An assumption cites its sources. |
| AUT-R02 | An assumption fits the epic's goal and scope in its PRD and names the part of the PRD it serves, beside the conditions the process contract sets today. |
| AUT-R03 | A new public module contract may be an assumption when it follows an existing similar contract or contract pattern, which the assumption names. |
| AUT-R04 | When the way a requirement or design decision prescribes cannot be followed, the agent may meet the same requirement another way that is consistent with the epic's goal and the other requirements, and meets every criterion. This is an assumption. When the requirement itself would stay unmet, it is a deviation with a follow-up. |
| AUT-R05 | Only these stop a task: a change of the database schema or of the meaning of stored data, security, an external integration, an option the solution design records as discarded, and a conflict that neither an assumption nor a qualifying deviation settles. A stop explains why neither was enough. |
| AUT-R06 | The agent classifies in this order: an assumption, otherwise a deviation, otherwise a stop. |
| AUT-R07 | Deviation limits: at most three deviations per task and six open follow-ups per epic; at most two requirements per deviation; one module; at most four other open tasks of the epic mention the deviation's IDs. The limit on the number of changed files is removed; every place of interim code carries its marker. At least one criterion of the task is met, and the deferred ones are not its main outcome. |
| AUT-R08 | Every place of the code that relies on an assumption carries its assumption marker, added by the task's own change. |
| AUT-R09 | Every attempt of a task in an epic receives the epic's unconfirmed assumptions: the id, the decision, what changes if it is reversed, and the marker. |
| AUT-R10 | A later task that only uses an assumption's code follows the assumption. A task that would build new behaviour on it uses it only through the marked places, does not copy the assumed reading to new places, and marks every new place that depends on it with the same marker. |
| AUT-R11 | When the owner rejects an assumption, the change task the owner's agent creates covers every place carrying the assumption's marker, those of later tasks included. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| AUT-AC01 | A result with an assumption whose marker the task's change does not add fails the runner's checks before the review. | Automated test |
| AUT-AC02 | A second task of an epic receives in its prompt the unconfirmed assumption of the first, with its id, decision, reversal and marker; a confirmed one is not in the prompt. | Automated test |
| AUT-AC03 | A result with three deviations passes the runner's limit checks; a result with four fails them. The epic limit is six open follow-ups. | Automated test |
| AUT-AC04 | A deviation whose interim code spans more than three files passes the runner's checks when every place carries the marker. | Automated test |
| AUT-AC05 | The process contract states the classification order, the sources an assumption may rest on, the stop conditions, the new limits, the assumption marker and the rule for later tasks. | Review of the documents |
| AUT-AC06 | The reviewer's instruction checks an assumption's sources, its fit with the PRD, a contract's pattern, the markers, and that the change follows or isolates the epic's assumptions. | Review |
| AUT-AC07 | The process contract says how a rejected assumption becomes a change task that covers every marked place. | Review of the documents |
| AUT-AC08 | A delivered task with two assumptions: the task database holds two separate open assumption items linked to the task, each with its marker; closing one removes it from the next task's prompt. | Automated test |
