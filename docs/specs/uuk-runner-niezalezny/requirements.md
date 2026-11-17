# Runner independent of the owner's working copy — Requirements

Beads epic: `oferty-pracy-uuk`. Goal and scope: [PRD](PRD.md). Technical decisions: [solution design](solution-design.md).

The requirements come from the owner's decisions in the conversation of 17 November 2026. Section `U<n>` describes the Beads task `oferty-pracy-uuk.<n>`. Requirement IDs (`U<n>-R..`) and criterion IDs (`U<n>-AC..`) are stable, and the Beads task cites criteria by ID.

<a id="pojecia"></a>

## Terms

| Term | Meaning |
| --- | --- |
| Owner's copy | The project directory in which the owner writes and commits. |
| Runner's copy | A separate copy of the project in which the runner creates the agents' environments. |
| Exchange point | The `main` branch of the project's repository on GitHub. The only place through which code and documents pass between the owner and the runner. |
| Gate | The set of quality checks every piece of work must pass before it is merged. |
| Delivery | Moving the agent's checked work to the exchange point. |
| Feedback turn | Sending a report back to the agent in the same session so that it corrects the work. The process contract allows three turns per task. |
| Return of a task | Giving a task back to preparation with the reason, when the runner cannot finish it. |

<a id="wspolne"></a>

## Shared criteria

They apply to every task of the epic and are cited in each of them.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| W-AC01 | The runner's type check and automated tests pass. | Running the runner's checks |
| W-AC02 | The tests of code exchange work without a network: a repository created for the test stands in for the exchange point. | Review of the tests |

<a id="u1"></a>

## Task uuk.1 — A ready task has its documents on GitHub

The runner sees only what is at the exchange point. Handing a task off therefore guarantees that the task's documents are there with the content the owner approved.

| Requirement | Content |
| --- | --- |
| U1-R01 | A task or an epic gets the readiness label only when every document its links lead to is at the exchange point with content identical to the owner's copy. What counts is the content of the files on the owner's disk, including changes not yet committed. |
| U1-R02 | One check, run for a named task, verifies this. It succeeds, or it lists every document that does not match with the reason: missing at the exchange point, or different content. |
| U1-R03 | The check compares against the current state of the exchange point, fetched when the check runs. When GitHub is unreachable, it fails and gives that reason. |
| U1-R04 | The check changes nothing in the owner's copy: branches, files and uncommitted changes stay as they were. |
| U1-R05 | Before applying the readiness label, task preparation pushes the documents to the exchange point and runs the check. On failure it does not apply the label and shows the owner the result. |
| U1-R06 | The readiness checklist in the process contract requires the documents to match the exchange point and names the check that verifies it. |

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| U1-AC01 | A task document exists only in the owner's copy: the check fails and lists that document as missing. | Automated test with a stand-in exchange point |
| U1-AC02 | A document has a commit in the owner's copy that is not at the exchange point: the check lists it as differing in content. | Same as above |
| U1-AC03 | A document has an uncommitted change in the owner's copy: the check lists it as differing in content. | Same as above |
| U1-AC04 | All documents of the task are identical: the check succeeds. | Same as above |
| U1-AC05 | The exchange point is unreachable: the check fails with that reason. | Same as above |
| U1-AC06 | After the check the branches and files of the owner's copy are as they were before it. | Same as above |
| U1-AC07 | The readiness checklist and the description of task preparation include pushing the documents and running the check before the label is applied. | Review of the documents |

<a id="u2"></a>

## Task uuk.2 — The runner in its own copy, exchange through GitHub

The runner stops using the owner's copy. It fetches the state from the exchange point and delivers finished work there. Task uuk.3 handles a change of the exchange point during a task; until then such a change ends with the return of the task.

### Separating the copies

| Requirement | Content |
| --- | --- |
| U2-R01 | The runner and the agents neither read nor change the branches, the history and the project files in the owner's copy. The exception is the owner's task database with its export, which the runner uses directly. |
| U2-R02 | The state of the owner's copy does not affect the runner's work: the checked-out branch, uncommitted changes and commits not pushed to the exchange point neither hold up nor interrupt any task. |
| U2-R03 | The agent has no access to GitHub and none of the data that gives such access. Only the runner pushes to the exchange point. |
| U2-R04 | The runner's program runs from the runner's copy, in the version from the exchange point. One command prepares the runner's copy once; after that the owner starts the runner with one command from that copy. The same preparing command, run again, updates the runner's program. |
| U2-R05 | The location of the task database is a setting of the runner. The other parts of the runner do not depend on where the database is. |
| U2-R06 | When the exchange point holds a newer version of the runner's program than the running one, the runner keeps working in its own version, records this in the log and notifies the owner once per version. The owner switches to the new version: they update the runner's copy and start the runner again. |

### Fetching the state

| Requirement | Content |
| --- | --- |
| U2-R07 | Before every check of ready tasks the runner fetches the current state of the exchange point. It judges the readiness of a task's documents on that state, starts the agent's work from it and builds the agent's environment from it. |
| U2-R08 | When the exchange point cannot be fetched, the runner takes no task, records the reason and tries again in the next cycle. |
| U2-R09 | A ready task whose documents are missing from the fetched state is neither taken nor returned. The runner records the missing documents in the log and checks them again in the next cycle. Such a task does not hold up the others. |

### Delivery

| Requirement | Content |
| --- | --- |
| U2-R10 | Work reaches the exchange point only after it passes the gate and the review, as today. |
| U2-R11 | Delivery does not overwrite changes that appeared at the exchange point after the task started. |
| U2-R12 | When the exchange point has changed since the task started, or is unreachable at the moment of delivery, the runner returns the task with that reason. Task uuk.3 replaces this return. |
| U2-R13 | After delivery the runner closes the task and records the evidence, the assumptions and the deviations as today. The notification says that the work is at the exchange point. |

### Return of a task and messages

| Requirement | Content |
| --- | --- |
| U2-R14 | When it returns a task, the runner pushes the branch with the agent's work to GitHub under a shared prefix and gives its name in a comment on the task. When GitHub is unreachable, the comment says that the work stayed only in the runner's copy. |
| U2-R15 | After a task is merged, the runner removes from GitHub the branch left by its earlier return. |
| U2-R16 | Every message about waiting and every return gives the concrete reason: the names of the files, documents or commits it concerns. |
| U2-R17 | The process contract and the tracker guide describe the new flow. These disappear from them: the ban on the runner pushing, the check of deviations before pushing, the check that `main` did not change during a task, and the requirement to start from a clean copy. |

Owner's decisions:

- The exchange point is GitHub, not a local directory. The runner does not read commits straight from the owner's copy.
- The runner pushes `main` itself. The rule of checking deviations before publication is out of date.
- The task database stays single and local. Task `oferty-pracy-r03` investigates synchronising it between copies.
- The runner's program runs from the runner's copy.
- The runner waits for the missing documents of a ready task instead of returning it.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| U2-AC01 | The owner's copy has uncommitted changes, another branch checked out and an unpushed commit, and the task database is where the setting says: the runner takes a ready task and delivers the work to the exchange point. | Automated test with a stand-in exchange point |
| U2-AC02 | After a full run of a task the branches and project files in the owner's copy are as they were before it. | Same as above |
| U2-AC03 | The exchange point is unreachable when fetching: the runner takes no task and records the reason. | Same as above |
| U2-AC04 | A document of a ready task is missing from the exchange point: the runner neither takes nor returns the task, records the document's name and takes another ready task. Once the document appears, it takes this task too in the next cycle. | Same as above |
| U2-AC05 | A commit appears at the exchange point during a task: nothing overwrites it, and the task is returned with that commit's identifier. The exchange point is unreachable at the moment of delivery: the task is returned with that reason. | Same as above |
| U2-AC06 | A returned task has the branch with the agent's work on GitHub, and its name is in the comment. After the task is later merged, the branch is gone. | Same as above |
| U2-AC07 | A newer version of the runner's program appears at the exchange point: the runner finishes the task in its own version and reports the newer one once. | Same as above |
| U2-AC08 | The agent's environment contains neither GitHub credentials nor the directory of the owner's copy. | Check of a running agent environment |
| U2-AC09 | The preparing command creates the runner's copy in an empty place, and the runner started from it in preview mode lists the ready tasks. Run again, it updates the program to the version from the exchange point. | Running the command |
| U2-AC10 | A real task goes through the whole flow under the new runner while the owner's copy has uncommitted changes: it ends with a merge at the exchange point, and the owner's copy stays unchanged. | Trial with the owner taking part |
| U2-AC11 | The process contract and the tracker guide describe the new flow and do not contain the rules listed in U2-R17. | Review of the documents |

<a id="u3"></a>

## Task uuk.3 — A change of the exchange point does not invalidate the agent's work

A change of the exchange point during a task becomes an ordinary event: the runner adds the agent's work on top of it, repeats the checks and delivers the result. The task replaces the return from U2-R12.

| Requirement | Content |
| --- | --- |
| U3-R01 | Only a state that passed the gate on exactly the version of the exchange point it is delivered onto reaches the exchange point. |
| U3-R02 | When the exchange point has changed since the last gate, the runner puts the agent's work on top of the new state and repeats the gate. |
| U3-R03 | When the changes of the exchange point include any document the task's links lead to, the runner repeats the review as well. The review covers the whole work of the task. |
| U3-R04 | When the exchange point changes between the fetch and the delivery, the runner retries the delivery from the fetch. |
| U3-R05 | A conflict while putting the work on top of the new state, and a gate or review that fails afterwards, go back to the agent as a feedback turn. The report on a conflict lists the conflicting files and the commits of the exchange point that caused it. These turns count towards the shared limit of feedback turns. |
| U3-R06 | The runner retries a delivery because of changes of the exchange point at most five times. Then it returns the task with the reason. |
| U3-R07 | When GitHub is unreachable at the moment of delivery, the checked work waits. The runner retries the delivery in every cycle before it takes a new task, and does not return the task for this reason. The waiting does not survive a restart of the runner. |
| U3-R08 | When a change of the exchange point during a task includes the project's dependency list or the recipe of the agent's environment, the gate in a fresh environment runs on an environment built from the new state. If the agent would then have to correct the work in the environment from before the change, the runner returns the task with that reason. |
| U3-R09 | The process contract describes delivery with a changing exchange point. |

Owner's decision: the agent resolves a conflict first; the task goes back to the owner only after the limit of feedback turns is used up.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| U3-AC01 | A non-conflicting commit appears at the exchange point during a task: the agent's work is put on top of it, the gate runs again, and the exchange point contains both. | Automated test with a stand-in exchange point |
| U3-AC02 | The exchange point changes between the fetch and the delivery: the first delivery is rejected, the other party's change is kept, and the retried delivery succeeds. | Same as above |
| U3-AC03 | The change of the exchange point includes a document of the task: the review runs again. It does not: only the gate is repeated. | Same as above |
| U3-AC04 | The change of the exchange point conflicts with the agent's work: nothing reaches the exchange point, and the agent gets a report with the conflicting files and the commits that caused the conflict. After its correction the work reaches the exchange point. | Same as above |
| U3-AC05 | The gate fails after the work is put on top of the new state: the report goes back to the agent as a feedback turn, and a fourth turn ends with the return of the task. | Same as above |
| U3-AC06 | After five retries of a delivery because of changes of the exchange point the task is returned with that reason. | Same as above |
| U3-AC07 | The exchange point is unreachable at the moment of delivery: the task is not returned, and once the exchange point is back the delivery succeeds before the runner takes a new task. | Same as above |
| U3-AC08 | The change of the exchange point includes the project's dependency list: the gate in a fresh environment runs after the environment is built from the new state. When a feedback turn is needed afterwards, the task is returned with that reason. | Same as above |
| U3-AC09 | During a real task the owner pushes a commit to the exchange point: the task ends with a merge, and the exchange point contains the owner's commit and the agent's work. | Trial with the owner taking part |
| U3-AC10 | The process contract describes the delivery steps, the limits and the cases of return from this section. | Review of the documents |

<a id="u4"></a>

## Task uuk.4 — Tasks independent of each other

The runner still runs one task at a time. The task removes what would force a rebuild for several agents.

| Requirement | Content |
| --- | --- |
| U4-R01 | Every task has its own log, its own branch and its own environment. The run of one task changes nothing another task uses. |
| U4-R02 | The number of tasks run at the same time is a setting of the runner with the default value 1. With a larger value the runner runs that many tasks in parallel. |
| U4-R03 | Two runs do not take the same task. The run that lost the claim skips the task without returning it. |
| U4-R04 | Deliveries from parallel tasks reach the exchange point one after another, each by the delivery rules of task uuk.3. |
| U4-R05 | An error in one task, or its return, does not interrupt the others. |

Out of scope: a trial with several real agents at once, and choosing which tasks are worth running in parallel.

| Criterion | Acceptance condition | Check |
| --- | --- | --- |
| U4-AC01 | With the setting at 2, two independent tasks with stand-in agents run in parallel: the exchange point contains both changes, and each task has a separate log. | Automated test with a stand-in exchange point |
| U4-AC02 | A task claimed earlier by another run is skipped and is not returned. | Same as above |
| U4-AC03 | Of two parallel tasks one ends with a return: the other is merged. | Same as above |
| U4-AC04 | With the default setting the runner runs one task at a time. | Same as above |
