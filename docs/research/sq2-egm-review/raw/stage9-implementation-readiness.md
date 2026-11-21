# Stage 9: Implementation Readiness (Goldfish, persona egm-implementation-readiness)

Scope: docs/specs/sq2-zlecenia-ai/solution-design.md (SD), docs/research/sq2-egm-review/tickets-export.md (sq2 epic, sq2.1–sq2.14).
Code observed: main at dd24a87. Note: the queue/worker libraries of 2ba.1 are not in the code yet (only lib/queue.ts, the old path).
Project convention (implementation-workflow.md, "Solution design"): the SD names mechanisms, not paths or function names. I judge "exact file list" gaps against that convention, not against the generic standard, so they are not raised as findings.

## Findings

### 🔴 B1. Two job definitions on one executor queue are not possible under the B1 contract
- Where: SD lines 44–45 and 80 (ZA-D07: "the executors' queues carry the job definitions of both ways"); tickets sq2.4 to sq2.11.
- Discrepancy: in pg-boss a job's `name` is always the queue name, and a job row has no field for its kind (docs/research/kolejki-zachowania-2ba1.md, B.9). B1 keys the handler registry by definition name, and registering the same name twice throws (2ba SD lines 135, 140). The failure queue calls the failure handler "registered for the source definition". The old way's `{ executionId }` jobs and the new `{ operationId }` jobs therefore cannot be two definitions on the same queue. The only option the research shows is one definition with a discriminator in the job data, dispatched by one handler and one failure handler. The SD does not choose that, and it does not choose a change to the shared library either.
- Rationale: from T3 (sq2.4) on, the implementer must decide a shared-infrastructure contract: the job data shape, the dispatch, and whether the B1-D15 key-mode test still holds. Exclusivity across both ways, which ZA-D07 relies on, depends on that choice. This breaks the zero-decision rule, and it is a contract an unattended agent should not invent.

### 🟡 M1. No task owns each part of the schema
- Where: SD lines 26–38 (Data); tickets sq2.2 to sq2.4, sq2.11, sq2.14.
- Discrepancy: the SD does not say which task creates the four tables and the new columns. Examples: the exchange table (T2 or T1?); the carried-charge column, which T3's room formula needs (line 192) while T10-R01 owns its meaning; the one-row default-limit table, which T3-R07 needs while T13 sets its value; and the closed-list checks that later tasks extend, such as `delivery_failed` in T6 and `manual` in T12.
- Rationale: each runner task makes schema changes, which stop a task under the classification rules. Without a per-task schema split, tasks will either duplicate migrations or block.

### 🟡 M2. The delivery queue has no failure handler and no defined final failure
- Where: SD line 46, T6 (lines 250–256); ticket sq2.7.
- Discrepancy: the delivery queue uses the defaults (3 attempts) and the SD gives it no failure handler. Two cases are left without an outcome. A result delivery that fails finally leaves the assignment in progress with a succeeded operation. Later, the time-limit pass would see "no running operation" and fail it as `time_limit`, so a good result is lost under the wrong reason. A failure delivery that fails finally leaves `delivered at` empty forever.
- Rationale: the architecture rules' "resource limit" and "repeated call" situations are unanswered for the final failure of this queue. The implementer must design the outcome.

### 🟡 M3. The paid agent session has no maximum run time
- Where: SD line 135, T2-R05 and T2-R06; ticket sq2.3 (T2-AC03 "every declared maximum run time is below the queue's time limit").
- Discrepancy: only the local executor's value is given (30 minutes). The paid single answer has a 90-second per-request limit. The agent has 120 seconds per step but no step count and no total, and the code (openai-agent.ts) caps steps only through its tool calls. The value of a whole agent session is left to the implementer.
- Rationale: this is a numeric product and design choice that sets when research ends as an ordinary failure.

### 🟡 M4. The executor interface misses the agent's materials for delivery
- Where: SD lines 132–134 and 253 ("materials, read by the executor from its state"); tickets sq2.3 and sq2.7.
- Discrepancy: the interface lists only the declaration and "carry out one operation". T6 also needs a call that extracts the agent's materials from the executor state. The outcome type, the writer signatures and the declaration shape are not fixed as a *Contract* either, yet T3–T6 build on them.
- Rationale: these are cross-task contracts. The interface sq2.3 invents binds sq2.4–sq2.7 without review.

### 🟡 M5. Coexistence budget room is specified on one side only
- Where: SD lines 80 and 192; budget.ts `reserve()` and `readBudgetMonth/Months`.
- Discrepancy: the new start subtracts the old attempts' charge. The SD does not say that the old path's reservation, today summing only `ai_attempts`, must also subtract the new operations' charges. It also does not say whether the profile budget card counts both before T10.
- Rationale: two operations, one on each way, can overspend the month during T3–T10. Each implementer would decide this alone.

### 🟡 M6. The split of the "what follows the end" table between T3, T4 and T6 is unclear
- Where: SD lines 87–98, 186, 216; requirements T3 Scope ("until T4 and T6 an assignment … stays in progress").
- Discrepancy: the table is a single *Contract*. T4 "adds its failure rows", and T6 adds delivery and the time limit. The SD does not list which rows exist after each task, or what T3 does with a failed end (insert nothing, keep the status in progress).
- Rationale: the phasing checkpoint of each task is not defined. An agent may implement the whole table in T3 and break the scope of later tasks.

### 🟡 M7. Where the check value is stored is underspecified
- Where: SD line 30 ("executor parameters … the check's value included"); T1-R09, T1-AC07; check-execution.ts.
- Discrepancy: today the check result lives in an in-process WeakMap, and only the in-memory object is opaque. The SD does not define how the value is serialised into the assignment, or how a mismatch of key, provider or model is refused (today `invalid_request`). That error code is not in T1-R04's list.
- Rationale: this is a public contract change (an opaque value crossing a transaction and a process) with an error that is not specified.

### 🟢 N1. sq2.1 is labelled needs-triage and is not resolved
- Where: tickets lines 742–777; requirements line 441.
- Discrepancy: the requirements say the mapping table answers its questions, but the task stays open with `needs-triage`. Under the epic hand-off check, an open child without `ready-for-agent` or `ready-for-human` blocks the whole epic.

### 🟢 N2. The tickets carry no labels or epic metadata for hand-off
- Where: all of sq2.2–sq2.14; epic `needs-info`.
- Discrepancy: the tickets have no `ready-for-agent` label, the epic has no `load_bearing` or `shared` metadata (ZA-AC01 and ZA-AC02 are candidates), and `spec_id` is not shown. This is expected before hand-off, but it must be done.

### 🟢 N3. ZA-AC02 links the architecture rules with a broken path
- Where: every ticket, "/architecture/moduly-i-zasady-kodu.md".
- Discrepancy: the path is missing `docs/`.

### 🟢 N4. T11 can run earlier, but the ticket chain forbids it
- Where: SD line 354; tickets sq2.12 depends on sq2.11.
- Discrepancy: the SD says T11 can run earlier, while the ticket chain makes everything sequential. The design and the tickets agree in effect, but the note misleads.

### 🟢 N5. Criterion IDs are out of order
- Where: sq2.9 (T8-AC09 listed before T8-AC08), sq2.10 (T9-AC06 before T9-AC05).
- Discrepancy: cosmetic only.

## Counts
Blocker 1, Major 7, Nit 5.
