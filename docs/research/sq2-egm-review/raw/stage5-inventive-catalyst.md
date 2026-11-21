# Stage 5 — Inventive Catalyst (Goldfish) — Zoom Out review of sq2 "AI assignments"

Persona: egm-inventive-catalyst, Mode REVIEW. Standard: zoom-out-standard. Sources: PRD.md, requirements.md, solution-design.md (SD), tickets-export.md; baseline 2ba design (B1, B5, B6), architecture rules, good practices.

The overall architecture is balanced: one queue per executor with exclusivity for "one at a time", charge at start under a month-row lock, conditional writes for "one winner", one function for "what follows the end". The findings below are places where the design takes on a cost it does not need, or leaves a gap.

## 🔴 Blocker

### B-1. A result the module did not take leaves its matter stuck "in progress", and a new request is refused for good
- Files: requirements.md:211 (T6-R03), :212 (T6-R04), :242 (T7-R02), :306/:312 (T9-R04, T9-AC01); solution-design.md:253-254, :287-288.
- Discrepancy: when the receiver raises an error or none is registered, the assignment fails with `delivery_failed` and "the receiver is not called again" (T6-R03). The failure entry is called only for other reasons (T6-R04), and when it raises an error the module is not told either. So in these cases the requesting module's own row for its matter is never updated. Each module "guards its own matter against a second request in progress with a conditional write on its own row" (SD:288). That row still says "in progress", so a second request is refused (Profile per CV, Companies per company) for good. The only fix is in the database, which is the PRD's first and fourth problems (PRD:13, :16), and it contradicts Success (PRD:54).
- Rationale: the view itself recovers, because it falls back to the status read (SD:287), but the guard does not. Either the guard counts a final assignment as "not in progress" (it reads the status the way the view does), or the AI module guarantees one notification for every final status. Finding M-1 picks the first.

## 🟡 Major

### M-1. Drop the receiver's failure entry and the delivery queue: modules already pull the status for failures (Inversion)
- Files: requirements.md:209-217 (T6-R01, R04, R05, R09); solution-design.md:46, :73-76 (ZA-D06), :250-264; PRD:21.
- False compromise: "Reject and the time limit cannot call a receiver, so every delivery needs a separate queue, and the pool grows to 3" (ZA-D06). Yet the design already needs the module to learn of failure by reading the status: the view is computed from the status read (SD:287), and the `delivery_failed` path and the failed-notice path (B-1) never tell the module. So pushing failures guarantees nothing the module can rely on.
- Proposed resolution: pull instead of push. The receiver has one entry, for a result, called inline in the executor job's end transaction (the job runs in a worker process where receivers are registered). On a receiver error, the transaction rolls back and a second transaction sets `delivery_failed`, as the SD already does. A failure is never delivered: modules show it and release their guard from the status read (fixes B-1). This removes the delivery queue and its migration, the failure entry, "delivered at" for failures, the noted delivery error, T6-R04, T6-R05, ZA-D06 and the pool size change, and it gives one delivery path.
- Secondary liabilities: the requesting module's row can say "in progress" while the AI module says failed, so the truth for a failure lies in the AI module and each module's guard and view must combine both. A receiver runs while the executor's exclusive slot is held, which is short: it is one save. The PRD wording "gets exactly one outcome" (PRD:21, :53) changes to "receives the result once; reads the failure". This needs the owner's decision (Q77/Q78).

### M-2. An interrupted operation that never sent anything is classed as uncertain and needs the owner (Blessing in disguise)
- Files: requirements.md:185-189 (T5-R01, R02, R05), :95 (T2-R08), :161 (T4-R06 / O-9); solution-design.md:34, :233.
- False compromise: every interrupted operation is uncertain, keeps its potential cost charged and moves the assignment to "needs attention". That includes every deployment or lost worker during a 30-minute local run or a queued paid one. The design treats "we cannot know what happened" as unavoidable.
- Proposed resolution: the exchange table is written before anything is sent (T2-R08, SD:34). An interrupted operation with no `request` row provably reached no provider. End it as an ordinary failure with cost zero, the same rule as the mapping table's "error before the request was sent" (SD:150) and O-9. T4-R02 then adds the next operation. Only operations with a sent request stay uncertain. This uses data that is already written and needs no new mechanism.
- Secondary liabilities: correctness rests on the executors writing before they send, which needs a test per executor. It also reads as a narrow exception to T5-R05 ("no automatic repeat") and needs the owner's confirmation. It adds one read to the interrupted path.

### M-3. Coexistence accounting between T1 and T10 is temporary code with no user (YAGNI)
- Files: solution-design.md:78-80 (ZA-D07), :192; requirements.md:9; PRD:34, :62.
- False compromise: while both ways exist, the room of a month counts the old attempts' charge plus the new operations' charge, and both job definitions share the executors' queues. All of this is written to be deleted in T10. The system does not run in production, and the epic is released as a whole (PRD:62).
- Proposed resolution: between tasks, only the checks must pass. Let the new path compute room from its own operations only until T10, where the carried charge (T10-R01) joins the two. Alternatively, keep separate queues for the old definitions. Either way, no combined room code is written only to be deleted.
- Secondary liabilities: if the owner spends real money locally between tasks, the month's limit could be exceeded by up to the old path's charges until T10. This needs a one-line owner confirmation.

## 🟢 Nit

### N-1. The limit of 3 automatic operations is stored on every assignment
- File: solution-design.md:30. The column exists only for a speculative per-module limit; a constant in code is enough (architecture rules, cost 1: a feature without a consumer). Liability: a later per-module limit needs a migration.

### N-2. A missing receiver fails assignments at runtime instead of failing the build
- Files: requirements.md:211; solution-design.md:262. Add a test like B1-D15: every settings name has a registered receiver (Beforehand cushioning). The "none registered" runtime case then becomes unreachable. Liability: one test to maintain.

### N-3. Reusing the archive table was "not weighed"
- File: solution-design.md:164. Weigh the existing archive table against a new exchange table before agreeing (architecture rules, cost 3: a second mechanism) and record why. Liability: none beyond the write-up.

### N-4. The budget step could self-schedule instead of being a step of the periodic process
- Files: solution-design.md:188; requirements.md:128. An operation without room could re-send its own job with a delay (startAfter), which keeps its place roughly by time and does not hold exclusivity. The periodic step and its room arithmetic are fine as written; note this only as the rejected alternative. Liability: job churn while many operations wait.

Count: 1 Blocker, 3 Major, 4 Nit.
