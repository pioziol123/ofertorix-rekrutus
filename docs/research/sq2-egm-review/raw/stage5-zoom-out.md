# Stage 5: Initial Zoom Out Review (egm-zoom-out)

Target: the specification set for epic `oferty-pracy-sq2` (PRD.md, requirements.md, solution-design.md, tickets-export.md). Code checked at `dd24a87`.

Context sufficiency: passes. The PRD states the problem, the goal and the scope cuts clearly.

## 🟡 Major

### M1. The budget card on the profile page breaks between T10 and T13, and T7-AC05 depends on a later task
- Files: requirements.md 246, 256, 331, 409; solution-design.md 316, 333; tickets sq2.8, sq2.11 to sq2.14 (linear chain, tickets-export.md 1224 to 1597).
- Discrepancy: `server/api/profile/index.get.ts` calls `readBudgetHistory`. That read sums `ai_attempts` joined to `ai_budget_months` (modules/ai/infrastructure/persistence/budget.ts lines 64 to 67). T10 renames these tables to an archive that "no code references" (SD 316). The read that replaces the card's read arrives only in T11 to T13 (SD 333), and the bd chain puts T10 before T11. T7-AC05, part of task sq2.8, already asks for "the months of T13-R05", a requirement that task sq2.14 delivers.
- Rationale: this breaks the rule that the application passes all its checks between tasks (requirements 9). Either the new budget read (months with limit, carried charge and operation charges) moves into T3 or T10, or T7-AC05 stops citing T13.

### M2. ZA-D07 (old and new paths side by side) contradicts the PRD constraint, and no simpler option was weighed
- Files: PRD.md 62; requirements.md 9; solution-design.md 78 to 80, 192.
- Discrepancy: the PRD says "no old and new path run side by side". ZA-D07 keeps them side by side from T1 to T10. The cost is a budget room computed over two charge sources, executor queues that carry two job definitions, and a doubled set of tests. ZA-D07 lists no discarded option. Two simpler options were not weighed. The first is to evolve the existing `execution` and `attempt` model in place: it already has receivers, retries as new executions, settings keys, a budget lock and a snapshot of the request (modules/ai/README.md, request-execution.ts, result-receiver.ts). The second is to move the budget early, so that only one charge source exists.
- Rationale: a second mechanism is the cost the architecture rules warn about. The PRD line needs rewording to "no two paths after deployment", or the decision needs its alternatives recorded.

### M3. The paid executor's maximum run time is not specified, and the queue's time limit may cut off company research
- Files: requirements.md 92 to 93 (T2-R05, T2-R06); solution-design.md 44, 76.
- Discrepancy: T2-R05 requires every maximum run time to be below the queue's 60-minute limit. T2-R06 fixes only the local executor's value (30 min) and the per-request limits (90 s, 120 s per agent step). ZA-D06 itself speaks of "an hour of research".
- Rationale: an agent session that runs close to 60 minutes either reaches the queue's time limit, which ends it as uncertain and moves the assignment to needs attention, or has no defined ordinary failure. The paid single answer and the agent session each need a stated value below 60 minutes. Without one, T2-AC03 cannot be checked.

### M4. ZA-D08 leaves the reuse of the existing archive table unexamined
- Files: solution-design.md 161 to 164; requirements.md 95.
- Discrepancy: the design says "Not weighed: reusing the existing archive table". `modules/ai/infrastructure/persistence/batch-archive.ts` and `readExecutionArchive` already store exact requests and raw responses, and Matching's exchange view already uses them (modules/matching/read-assessment-archive.ts).
- Rationale: the design proposes a new table and a new read for a capability that exists. The choice needs a reason, or the existing store should be adapted.

## 🟢 Nit

- N1. PRD.md 61 says the AI module "keeps no waiting line and no supervision of its own". Its operations waiting for the budget, walked by pending-since in the periodic pass (SD 188), and the time-limit step are such a line and such supervision. The wording should be narrowed to "no line for executors".
- N2. Each assignment stores its automatic operation limit, always 3 (SD 30). This is a constant, and storing it is speculative (YAGNI).
- N3. Each operation stores a JSON snapshot of the whole price list (SD 32). The prices live in code and change only on deploy, so storing the rates used, or a version of the price list, would be enough.
- N4. The section "Towards more traffic" (SD 356 to 358) is speculative. It is harmless, but it is not needed in the design.
- N5. The format check moves into three receivers (SD 286). A shared helper (the zod `parseResult` in modules/ai/domain/response-schema.ts, moved to lib) avoids writing it three times.
- N6. The epic description and its acceptance criteria are stale: batch, OpenCode, "design from scratch", the `needs-info` label and the dependency on 0mq.15 that the epic's own comment calls outdated (tickets-export.md 11 to 107). Task sq2.1 is still open with needs-triage and asks about batch mode and background mode, which are out of scope. The requirements (441) say the mapping table answers its questions, so sq2.1 should be closed or superseded.
- N7. The glossary still describes deferred terms until T10 (SD 319). Implementers of T1 to T9 read a glossary that does not match their task, so it should be updated now.
- N8. The bd chain is strictly linear, while the requirements state narrower dependencies (T11 needs only T3, T8 needs T6). This is intentional per SD 354, but the tickets do not say so.
- N9. In requirements.md 289 to 290 and 316 to 317, the criteria are numbered out of order (AC09 before AC08, AC06 before AC05).
- N10. ZA-D06 raises the pool to 3, but delivery jobs still compete with CV reading and sync jobs for processes (B1-D07). T6-R05's "waits only for a free process" holds, but the stated reason for 3 is incomplete.
