# Stage 6 — Comprehension Test (egm-comprehension)

Scope: PRD.md, requirements.md (FeatureRange); solution-design.md, tickets-export.md (DetailedRange). Read only these four files.

## What this proposes

A requesting module (Profile, Matching, Companies) stops calling AI providers through the old contract and instead places an **assignment** inside its own database transaction: frozen content (instruction, input, optional response format, agent tools) plus an executor and parameters fixed from a "settings name". The AI module turns each assignment into one or more **operations**. Each executor (paid/OpenAI, local model) runs one operation at a time through its own exclusive queue. The monthly budget is charged when an operation starts. Ordinary failures retry automatically up to 3 operations. Non-retryable, uncertain or exhausted ones move the assignment to "needs attention". Every assignment ends within 7 days. The requesting module gets exactly one delivery (a result, or "failed" with no reason) through a receiver that runs in the delivery transaction. The owner gets a "Zadania AI" panel with a list, details, a counter, Retry/Reject and budget limits. Old data is not moved: only each month's budget charge is carried over as one amount, and the old records stay as an unread archive.

## How the existing system works, per this document

Today the AI module has a contract built on "executions" and "attempts". The budget is reserved when work is requested. A shared slot with a lease serves local work, and states and causes such as "uncertain" or "waiting for budget" are exposed to requesting modules, which show them. Matching assesses offers through the OpenAI batch mode, a group of offers gets its budget as a whole, and Matching and Companies write attempts directly. Profile resumes preparations by itself in a periodic step. The AI module checks results against the response format. The paid adapter retries once after a transient error. The limit (100 PLN) can only be changed in the database. The separate background-work epic (2ba) will first move AI work onto shared queue and worker libraries: two queues, a failure handler and a periodic process. These documents assume that state but do not describe it.

## Findings

### 🟡 Major 1 — The background-work mechanism (B1/B6) the design rests on is not explained
- Scope: solution-design.md lines 3, 9, 44–48, 54, 62, 66, 74, 218, 233–234; requirements.md line 11, T5-R03 (line 187); PRD line 61.
- Rationale: Key guarantees are cited only by ID from another document: exclusivity on a constant key, job attempts, the failure handler "after a job failed finally" (B1-R11), loss found "in about 30–90 s" (B1-R10), "exclusivity guarantees the attempt … has ended or was lost" (B1-D03), receivers loaded only in worker processes (B1-R15), the queue settings "As B6", and the pool size. The interrupted-operation design (T5), ZA-D04–D06 and the five-minute bound of T5-R03 cannot be checked without the other document. The local queue's time limit is never given, so T2-AC03 ("every maximum run time is below the queue's time limit") cannot be checked for the 30-minute local executor.

### 🟡 Major 2 — PRD says old and new paths never run side by side; requirements and design say they coexist from T1 to T10
- Scope: PRD.md line 62 versus requirements.md line 9 and solution-design.md ZA-D07 (lines 78–80, 192).
- Rationale: A fresh reader sees a direct contradiction. The likely intent is "no coexistence in a released version, only between tasks of one delivery", but no document says so. ZA-D07 also changes budget room while both paths exist, which the PRD constraint seems to forbid.

### 🟡 Major 3 — The old data model the migration acts on is never described
- Scope: requirements.md T10-R01/R02 (lines 329–330), T10-AC01; solution-design.md T10 (lines 312–319), T2 "Removed from the adapters" (line 136), ZA-D08 (line 161), T1 (line 111).
- Rationale: T10 depends on "earlier attempts", "reserved amounts", "work that had started and not ended", "executions", "the batch archive table taken over from Matching", "the shared-slot flag", "a lost lease" and "the index that allows one execution in progress per matter". None is defined. The fact that Matching and Companies write attempts without executions appears only in a Polish epic comment (tickets-export line 551–555). An implementer cannot tell which old rows count as "started and unfinished".

### 🟡 Major 4 — "Operation" and "attempt" each carry several meanings
- Scope: requirements.md T1-R01 (line 52), T7-R01, T9-R01; solution-design.md "Situations per operation" tables; T5-AC02; T10.
- Rationale: "Operation" means an AI operation (the core entity), a requesting module's transaction ("its own operation … rolled back"), a module's public API ("public operations") and a row of the situations tables. "Attempt" means a queue job attempt (T5-AC02, ZA-D05) and also an old-model AI record (T10). Sentences such as "places an assignment in the operation that marks the preparation as started" are easy to misread as an AI operation.

### 🟡 Major 5 — The "check before placing" (T1-R09) is not specified
- Scope: requirements.md T1-R09 (line 60), T1-AC07; solution-design.md line 30.
- Rationale: The documents do not say which executor needs this check, what it computes beyond "such as the version of a local model", who calls it, or how its opaque value is passed and validated. The design has no approach for it beyond "the check's value included" in the parameters. T1-AC07 cannot be implemented from these documents.

### 🟡 Major 6 — A PRD success measure conflicts with the carried budget charge
- Scope: PRD.md line 57 versus requirements.md T10-R01 (line 329) and T13-R01.
- Rationale: The PRD measure says the monthly total equals the sum of the month's operation charges, before and after migration. After migration the panel history is empty and the month's charge is the carried amount plus operation charges, so the stated measure is false for the migration month.

### 🟡 Major 7 — The epic description and sq2.1 are stale against the PRD
- Scope: tickets-export.md lines 11–103 (epic description, acceptance criteria, label `needs-info`, depends on 0mq.15), lines 742–774 (sq2.1); requirements.md line 441.
- Rationale: A newcomer opening the epic reads a "design from scratch" brief with Ollama/OpenCode, a batch type and a dependency on 0mq.15. A later comment (line 611–612) calls that dependency outdated, and the result is said to "require refinement". Nothing says the PRD supersedes it. sq2.1 cites Q75 and Q73 for OpenAI background mode and cancellation, but in the interview those numbers are Retry/time limit and frozen data. It also asks about a batch type that is now put off. requirements.md line 441 claims the T2 mapping table answers its questions, but questions 2–4 (background resumption, cancellation, batch mode) are not answered there.

### 🟢 Nit 1 — The periodic process cadence is not stated
- Scope: T3-R05, T6-R07, T13-AC05 ("within two minutes"). The interval that makes two minutes true is not given.

### 🟢 Nit 2 — The failure reason name and its code differ
- Scope: ZA-R05 "result not taken" versus `delivery_failed` (solution-design.md line 30). `time_limit` versus `time_limit_run` is also close enough to confuse.

### 🟢 Nit 3 — Some causes on the closed list are never defined or produced
- Scope: solution-design.md line 85. `aborted` and `unknown` (as used by the failure handler for a pending operation, line 218) have no explanation.

### 🟢 Nit 4 — "Materials" of an agent session and "source rules" are undefined
- Scope: T2-R06, T6-R01.

### 🟢 Nit 5 — Legacy labels are cited without meaning
- Scope: PRD.md line 7 and the epic. PZ-01–PZ-08, R-25, LA-xx and v4t.6 appear without a gloss.

### 🟢 Nit 6 — Worker pool size 3 has no owning task
- Scope: ZA-D06 consequence (solution-design.md line 76). No requirement or ticket carries this change.

### 🟢 Nit 7 — Criteria are out of order and a link path is broken in the tickets
- Scope: tickets-export.md lines 1277–1280, 1337–1340 (AC09 before AC08, AC06 before AC05); ZA-AC02 shows the path "/architecture/moduly-i-zasady-kodu.md".

### 🟢 Nit 8 — The ticket chain is stricter than the design order
- Scope: tickets-export.md line 1473 (sq2.12 depends on sq2.11) versus solution-design.md line 354 ("T11 needs only T3 and may be done earlier"). This is consistent but unexplained in the tickets.

### 🟢 Nit 9 — "The owner" is both a product decision-maker and the only user of the application
- Scope: PRD throughout. Neither role is stated explicitly.
