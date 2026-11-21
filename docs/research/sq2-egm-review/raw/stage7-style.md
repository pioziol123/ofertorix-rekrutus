# Stage 7 — Critic Review (style), Goldfish `egm-style`

Mode: REVIEW. FeatureRange: `docs/specs/sq2-zlecenia-ai/PRD.md` (whole), `docs/specs/sq2-zlecenia-ai/requirements.md` (whole). GoldfishContext: `GLOSSARY.md` (AI module and Technical terms sections).

Summary: 0 Blocker, 7 Major, 12 Nit.

## Major

### M1. "Operation" names three different things, against the glossary
- Severity: 🟡 Major
- Scope: requirements.md 52 (T1-R01), 60 (T1-R09), 66 (T1-AC01), 241 (T7-R01), 269 (T8-R01), 302 (T9-R01); also 22, 257, 290, 317, 358, 367 ("public operations", "read operations").
- Discrepancy: The glossary defines **Operation** as one call to an executor and says explicitly: do not use "operation" for the requesting module's own matter. The requirements also use it for the requesting module's database transaction ("places an assignment as part of its own operation", "the requesting operation", "in one operation: all are placed or none") and for a module's public functions ("public operations", "the operations of T1"). T1-AC01 uses two meanings in one sentence: "An assignment placed in a committed operation exists ... with one pending operation".
- Rationale: The term carries the central concept of the epic (state, cost, retries). An implementer reading T8-R01 "in one operation" can take it as one executor call. Use a separate word for the transaction (e.g. "the requesting module's save" or "transaction") and for public API ("public functions" / "contract").

### M2. "Settle" / "settled" collides with the glossary action Settle
- Severity: 🟡 Major
- Scope: requirements.md 128 (T3-R05 "a settlement below the potential cost"), 144 (T3-AC08), 211 (T6-R03 "cost stays as settled"), 224, 329/339 (T10 "settled costs"), 365, 381 (T12-R03 "ends and is settled"), 391, 416; PRD.md 47.
- Discrepancy: The glossary defines **Settle** (Rozlicz) as the owner entering the actual cost of an operation whose cost was unknown. The requirements use "settled" for the automatic end-of-operation cost computation (T3-R06), while PRD 47 uses "Settling a cost the provider did not report" in the glossary sense and puts it out of scope (`oferty-pracy-qld`).
- Rationale: A reader cannot tell whether T6-R03 or T12-R03 requires the owner action that the PRD puts out of scope. Use "with a known actual cost" / "its cost recorded" for the automatic case, and keep "settle" for the owner action only.

### M3. "Time limit" is overloaded between the assignment and the queue
- Severity: 🟡 Major
- Scope: requirements.md 92 (T2-R05 "time limit of the executor's queue"), 104 (T2-AC03 "the queue's time limit"), 185 (T5-R01 "the queue's time limit passed"), 195 (T5-AC01 "a short queue time limit"); versus 56, 214–216, 379 and PRD 24, 56 (assignment time limit).
- Discrepancy: The glossary has **Assignment time limit** and, separately, the queue setting "time limit of an attempt". The requirements write "time limit" bare for the assignment and "queue's time limit" for the attempt limit; "maximum run time" is a third limit in the same rules.
- Rationale: T5-R01 and T6-R07/R08 both trigger on a passed "time limit" with different outcomes (uncertain vs. failed with "time limit exceeded"). Use the glossary names: "assignment time limit" and "attempt time limit of the queue".

### M4. PRD overstates the time-limit guarantee
- Severity: 🟡 Major — CALIBRATE
- Scope: PRD.md 24 ("every assignment ends within the time limit"), 56 ("No assignment stays unfinished past the time limit, whatever it waited for").
- Discrepancy: T6-R08 (requirements 216) and the glossary (**Assignment time limit**: "An operation already running is allowed to finish first") let an assignment stay in progress past the limit while its operation runs, and succeed afterwards.
- Rationale: A success criterion that the requirements deliberately do not meet cannot be verified. Narrow it: "No assignment stays unfinished past the time limit except while an operation started before the limit is still running (at most its maximum run time)."

### M5. "Starts without any other action" outruns T3-R05
- Severity: 🟡 Major — CALIBRATE
- Scope: PRD.md 55; requirements.md 410 (T13-R06), 420 (T13-AC05 "carried out within two minutes").
- Discrepancy: T3-R05 (128) says that after a top-up waiting operations "begin to wait for their executor within two minutes" and join the end of the executor's line (T3-R01: one operation at a time per executor). T13-AC05 promises the assignment is "carried out within two minutes", which holds only when the executor is idle.
- Rationale: The acceptance criterion is stricter than the rule it checks and can fail for a correct implementation. Align PRD 55, T13-R06 and T13-AC05 with T3-R05 ("is released to its executor within two minutes"; in AC05 state the executor is idle).

### M6. "Everything else restates the PRD" is not true
- Severity: 🟡 Major — CALIBRATE
- Scope: requirements.md 7.
- Discrepancy: Many requirements have no source tag and are not in the PRD: T1-R08 (59), T1-R09 (60), T2-R06 (93, the 90 s / 120 s limits), T4-R07 (162), T5-R03 (187, five minutes), T6-R05 (213), T6-R07 (215, two minutes), T6-R09 (217), T11-R05 (358), T13-R04 (408).
- Rationale: The sentence tells a reviewer that untagged rules need no owner basis. Either tag these (e.g. "carried from today's behaviour", "design value") or replace the sentence with "Untagged requirements keep today's behaviour or are design values without an owner decision."

### M7. PRD 47 uses the old-path term "reserved amount" for the new model
- Severity: 🟡 Major
- Scope: PRD.md 47 ("such a cost stays charged to its month at the reserved amount").
- Discrepancy: The new model's term is **Potential cost** (glossary; ZA-R04 at requirements 35: the charge is "its potential cost otherwise"). "Reserved amount" is the old path's term (PRD 16, T10-R01/R02, T9-R03).
- Rationale: In the same document "reserved amount" otherwise means the old path, so the sentence reads as if the old mechanism survives. Write "at its potential cost".

## Nit

### N1. "Periodic process" is not a glossary term
- Scope: requirements.md 11, 141, 227, 255, 332, 342.
- The glossary names the **Scheduler** (proces harmonogramu) and **Periodic operation**. "Periodic process" mixes them. T10-R04 "keeps three steps" means three periodic operations. Use the glossary terms.

### N2. "Line" for the executor's waiting order collides with **Queue**
- Scope: requirements.md 128 (T3-R05), 433 (O-4); PRD.md 61 ("keeps no waiting line").
- The glossary defines a queue as "a named line of queue jobs" and requirements 11 says there is one queue per executor. "Its executor's line" can be read as the queue or as a separate order. State which one.

### N3. "Attempts" for old-path records, a glossary _Avoid_ word
- Scope: PRD.md 33; requirements.md 276, 289, 329, 331, 339.
- The glossary lists "attempt" under _Avoid_ for **Operation**. The usage is deliberate (old-path records), but it is not introduced. Name it once, e.g. "attempts (the old path's records)", or use "old-path executions". Queue-job "attempt" (172, 196) is correct.

### N4. "AI tasks panel" uses an _Avoid_ word
- Scope: PRD.md 29, 82; requirements.md 342 and T11 heading (346).
- **Assignment** lists "task" under _Avoid_. The panel's UI name is "Zadania AI"; in English text "AI assignments panel" or the quoted UI name avoids the clash with bd tasks, which the same documents also call tasks.

### N5. "As today" / "today" without an anchor
- Scope: requirements.md 55, 93, 162, 242, 269, 271, 273, 303; PRD.md 38.
- "Today" ages once the epic ships. Write "as before this epic" or "as on 20 November 2026".

### N6. Heading "One retry rule today" misleads
- Scope: requirements.md 162 (T4-R07).
- The heading reads as a description of the present; the rule removes the current extra attempt. Suggest "**No retry inside an operation.**"

### N7. Heading "Delay" does not match the rule
- Scope: requirements.md 213 (T6-R05).
- The rule is that delivery does not wait for an executor. Suggest "**Delivery does not wait for an executor.**"

### N8. T5-R03 covers only one of T5-R01's triggers
- Scope: requirements.md 187.
- "Within five minutes of the loss of its process" does not cover the case where the queue's attempt time limit passed (185). Say "of the moment its work stopped".

### N9. "At most once" vs "once"
- Scope: requirements.md 217 (T6-R09), 229 (T6-AC07).
- The rule promises "at most once"; the criterion checks "takes effect once". Use the same quantifier; "exactly once for a completed delivery" seems intended.

### N10. Criterion IDs out of order
- Scope: requirements.md 289–290 (T8-AC09 before T8-AC08), 316–317 (T9-AC06 before T9-AC05).
- IDs are stable, so keep them, but place rows in ID order or note why AC09/AC06 were inserted.

### N11. "Stage 14" has no referent
- Scope: PRD.md 67.
- The stages table has no numbers, so "Stage 14 of the earlier division" means nothing to a fresh reader. Drop the sentence or say "the stage 'executors in the panel' of the 18 November division".

### N12. Minor wordiness and vague quantifiers
- PRD.md 7 "redesigned the whole area from scratch": "whole" and "from scratch" repeat each other; keep one.
- PRD.md 24 "as little other work as possible": unmeasurable lead-in; the list after the colon carries the content; drop the lead-in or write "An assignment holds back no other work beyond:".
- PRD.md 32 "returns within minutes instead of up to a day": with one operation at a time per executor (T3-R01) 20 assessments run in sequence (up to 20 × 90 s). CALIBRATE to "each assessment returns within minutes of its start".
- PRD.md 33 "The few earlier attempts": "few" is vague; the parenthesis already gives the size.
- PRD.md 14, 16, 21, 31 paraphrase "the module that asks for the work" before the glossary term **requesting module** is used at 38 and 53; use the term from the start.
- requirements.md 128 "dearer": prefer "more expensive".
- requirements.md 57, 330, 437 "matter": undefined outside the glossary's _Avoid_ note; one gloss on first use helps.
