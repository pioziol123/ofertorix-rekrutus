# Stage 8: Intermediate Zoom Out (egm-zoom-out)

Scope: PRD.md, requirements.md and solution-design.md (SD) under `docs/specs/sq2-zlecenia-ai/`, and `docs/research/sq2-egm-review/tickets-export.md`. Earlier reports read: stage5 to stage9 under `raw/`. This report does not restate them one by one. It groups their findings by the decision that causes them and names the smallest change that removes each group, with the MVP in mind.

Context sufficiency: passes.

Counts: 🔴 1 · 🟡 4 · 🟢 4

## 🔴 Blocker

### B1. Running the old and new ways side by side (ZA-D07) causes one blocker and four majors, for a system that is not in production
- Where: SD 78–80, 192; PRD 34, 62; requirements 9; tickets sq2.4–sq2.11.
- Problem: earlier stages raised these as separate findings, but they all come from ZA-D07:
  - stage9 B1: two job definitions cannot share one executor queue under the B1 contract;
  - stage9 M5: on the old path, the budget room ignores the new operations;
  - stage5 M1: the budget card breaks between T10 and T13;
  - stage5 M2, stage7 structural M4 and comprehension M2: the PRD says the two paths never run side by side;
  - inventive M-3: the coexistence accounting has no user.
- Why it matters: PRD 34 says the system does not run in production yet. Unfinished work is simply ended at deployment. So keeping "one operation at a time" across both ways, and one shared budget between them, protects no user during T1–T10. Those guarantees are the expensive part of ZA-D07.
- Smallest fix: keep the step-by-step move between tasks, but drop the two coexistence guarantees for the development period.
  - The new way gets its own job definitions on its own executor queues, or the existing queues serve the new way only from T3 on.
  - Its budget room counts only its own operations.
  - The PRD's "no two paths" applies to the release.
  - The new budget read (months with limit, carried charge and operation charges) moves to T3, so the profile card never depends on T13.
  - This removes stage9 B1 and M5 without a change to the shared queue library. Record it as the owner's acceptance of a dev-only risk.

## 🟡 Major

### M1. Push delivery is the most complex part of the design, and it holds most of the cases left open
- Where: SD 46, 74–76, 250–264; requirements T6-R04, T6-R05, T6-R07–R09 (212–217); T7-R02, T9-R04.
- Problem: these open cases all come from one mechanism: a separate delivery queue, receivers called inside the AI module's transaction, a failure entry, `delivered at`, `delivery_failed` and a third worker process. The open cases:
  - a result lost to the time limit while its delivery waits (stage7 design M4);
  - a delivery that fails finally has no defined outcome (stage9 M2);
  - a matter stays stuck after a failed failure-delivery (design M5, inventive B-1);
  - deliveries compete with other work for processes (design M3, stage5 N10).
- Why it matters: for an MVP this is the riskiest part of the work, and it is not yet fully specified.
- Smallest fix: keep push delivery for results, and close the gaps with three rules:
  1. The time limit skips an assignment whose operation succeeded and is still undelivered.
  2. The delivery queue's failure handler sets `failed` / `delivery_failed` and `delivered at`.
  3. For failures, the requesting modules reconcile through the status read they already have (T1-R07) when a new request meets their guard.
- The cheaper path is inventive M-1: no failure entry at all. Either option needs one owner decision, not a design pass per case.

### M2. Every deployment while an operation runs adds an item that needs the owner's attention
- Where: requirements T5-R01 (185); SD 65–67, 233, 235.
- Problem: an interrupted operation always ends as uncertain, and its assignment needs attention. This holds even when the executor never sent a request. The exchange table already records each request before it is sent (T2-R08, SD 34), so the design already knows "nothing was sent".
- Why it matters: in an MVP that is deployed often, any operation that was running (company research can take up to an hour) lands in the panel for a manual Retry.
- Smallest fix: an interruption with no recorded request ends as an ordinary retryable failure with zero cost. This is one condition in T5, and it needs no new mechanism (expands inventive M-2).

### M3. Several items in the data model and mechanisms are not needed for the first version
- Where: SD 30 (stored limit of 3), 32 (price-list snapshot), 161–164 (new exchange table, reuse "not weighed"), 356–358; PRD 32.
- Problem: earlier stages raised these one at a time as nits (stage5 N2–N4, M4; inventive N-1, N-3). Taken together, they add a table, two JSON or constant columns and a read that the code already has (`batch-archive.ts`, `readExecutionArchive`, used by Matching's exchange view).
- Smallest fix:
  - Reuse or rename the archive table for the exchange.
  - Keep the limit of 3 as a constant in code.
  - Store the rates used, not the whole price list.
  - Each change makes T2, T8 and T10 smaller.

### M4. The paid executor has one slot, and the PRD's promise about speed and cost has no figures behind it
- Where: PRD 24, 32; SD 44, 52–54; requirements T2-R05, T2-R06 (92–93).
- Problem: assessments, profile work and company research share one paid operation at a time, and the agent session has no maximum run time (stage5 M3, design M2/M7, readiness M3).
- Why it matters: one company research can delay every assessment by up to the 60-minute queue limit. The PRD still promises results "within minutes", at "about twice" the cost, with no figure for how many assessments fit in a month.
- Smallest fix, for the MVP:
  - Set a total for the agent session, for example 20 minutes.
  - Accept the delay in the PRD as a stated risk.
  - Give one estimate of assessments per 100 PLN.
- No new mechanism is needed. A second queue for research would be YAGNI now.

## 🟢 Nit

- N1. The process gaps below are hand-off chores, not design problems. Do them in one pass before hand-off:
  - no task owns each part of the schema (readiness M1);
  - the executor interface is not stated as a contract (readiness M4);
  - the "what follows the end" table is not split between T3, T4 and T6 (readiness M6);
  - sq2.1 is stale, and the epic description is stale (stage5 N6, readiness N1);
  - the tickets have no hand-off labels;
  - the path in ZA-AC02 is broken.
- N2. The 13-task chain is linear, with T11 allowed earlier (SD 354). If B1 is accepted, T7–T10 could merge into fewer tasks, because the per-module steps exist mainly to keep both ways passing their checks.
- N3. The PRD has no risks section (design M1, structural M5). The accepted risks above (B1 for development only, M4 delay, M1 delivery choice) are what it should list. One short section would cover them.
- N4. The section "Towards more traffic" (SD 356–358) stays harmless, provided that nothing in T1–T13 is built for it.
