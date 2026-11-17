# Task management panel — Requirements

Status: **scope approved, specification after review ready for implementation**, 2026-11-05. Beads: `oferty-pracy-334.15`. The need for the panel and for manual checking, stopping and skipping of a task was confirmed. The owner confirmed the scope and the action rules below; the technical details of the SD and the runtime contracts must be verified during implementation. Basis: [PRD](../../PRD.md), [cross-cutting requirements](../../requirements.md).

## Confirmed scope

First scope: AI tasks of profile, assessments and research, also with local groups of up to 20 and OpenAI Batch. Source syncs and other background jobs are outside the first scope; we do not create an interface for generic control of arbitrary pg-boss jobs. The panel is in the existing application, with the current private access.

## Requirements and criteria

| ID | Rule | Observable acceptance condition |
| --- | --- | --- |
| PZ-01 | List and details of operations | Visible: type, subject, group, provider/model, application state, last known runtime state, date of the last confirmation and the current error. Lack of contact does not mean stopped. |
| PZ-02 | "Sprawdź teraz" (Check now) | The request forces an attempt to update the existing operation/session, without creating a new inference or session. An unavailable runtime gives information about the failed check and keeps the last observation with its date. |
| PZ-03 | "Zatrzymaj" (Stop) | A pending task does not start; a running one receives a stop request and a publication block. The adapter confirms that the process has ended, not the click itself. Lack of confirmation stays uncertain. |
| PZ-04 | "Pomiń" (Skip) | The task is excluded from further processing and publication without pretending that the runtime has been stopped. Completed results of other items stay. A late result is kept for diagnostics, but does not become an active assessment/report. |
| PZ-05 | Logical state and actual execution | A skipped task can still have a runtime running/unknown; the user sees this and can still request a check/stop. Skipping does not zero the cost and does not mean success. |
| PZ-06 | Explicit retry | A new execution has its own identifier and a reference to the previous one. It does not overwrite history. An explicit retry is allowed also while running/unknown. The previous execution loses the right to publish, receives a stop attempt, and any later response from it stays available for viewing without publication. |
| PZ-07 | Handling groups | An action targets a single AI task: an item or a group of up to 20; no action on the whole parent request. The success/error/cancelled/skipped/unknown counters are separate. A group action does not change completed items. |
| PZ-08 | Command history and races | Repeating the same command does not create a double effect. Stop/skip atomically resolves the race with publication; if the result was already published, the panel shows this fact instead of withdrawing it. All commands and their effects are kept indefinitely. |

## Resolution of PZ-O1–PZ-O6 — 2026-11-05

- PZ-O1 closed: the first scope is AI only.
- PZ-O2 closed: skipping blocks publication and lets the group continue, without deleting history.
- PZ-O3 closed: the user can explicitly retry running/unknown. The old execution is stopped if possible, and always loses the permission to publish. We store its response for viewing.
- PZ-O4 closed: skipping a running task includes a stop attempt, without treating a lack of confirmation as stopped.
- PZ-O5 stays a technical detail: a check of direct Ollama without an execution ID shows that confirmation is not possible; it does not generate a control response.
- PZ-O6 closed: in Batch, blocking publication of one item does not require cancelling the whole batch. Apply remote stopping of a batch only for an action on its corresponding group task, with a visible scope. We do not split historical groups >20; reading old records requires compatibility.

Also confirmed: a completed publication is not withdrawn by clicking stop/skip; the Google flow through a dedicated browser and waiting for user action on a block are accepted. The details of restarting after an intervention and of state verification are a technical contract of the [SD](solution-design.md). This does not mean approval to start implementing the whole initiative.

## Queue and intervention — confirmed 2026-11-05

[LA-11–LA-15](../../requirements.md) apply to all local AI work. The panel shows waiting in the queue and the execution that blocks the next one, also when it is skipped, logically cancelled or in the unknown state. An explicit retry is still allowed and cuts off the old publication, but the new execution waits for the confirmed end of the previous agent. This replaces the earlier possibility of an immediate start without abort confirmation. Stop/skip does not mean that resources are released.

The "Wznów" (Resume) button after an intervention continues the same execution/session, without creating a new one. An unavailable or lost browser state gives an explicit error instead of a pretended continuation. PZ-01/03/04/06/08 cover these behaviours; PZ-08 also covers idempotent resumption. In this scope we do not add automatic login or editing of queue priorities.

## Panel agreement after grill-me

LA-11 and LA-16–18: the panel is required in the shared deployment of the whole epic. Waiting and the blocking execution ID concern one shared queue of local profile, assessments and research. Stop/check/retry are task control, not service repair; do not add an automatic infrastructure restart or a button that skips runtime uncertainty.

PZ-06 requires a copy of the old input/instructions/schema/model/parameters on a manual retry, even after a change of profile and `.env`. New data requires a new request. A format/evidence/report error is visible and does not start an automatic repair generation. PZ-01/05/08 cover mixed local tasks and a durable resolution after manual handling of a failure according to the instructions. Login and parking of sessions with moving on to further tasks stay in backlog item 281; the current resume concerns only an intervention in public access.

## Execution review result

2026-11-05, task 334.20: item/group, revision, legacy guard, pagination/capabilities and reading of artefacts were resolved in the SD and runtime. Stages 6/8 are required for implementation. Headless Chrome has a private DevTools preview and manual intervention in the same session; this does not change PZ-01–08. There is no open product decision for the panel; the criteria require implementation and evidence.
