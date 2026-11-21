# Stage 7 Critic Review — Design Critic (egm-design)

Scope: `docs/specs/sq2-zlecenia-ai/PRD.md`, `docs/specs/sq2-zlecenia-ai/requirements.md`. Standard: feature-spec-standard. Baseline: GLOSSARY.md, architecture rules, 2ba PRD/requirements/solution design.

Counts: 🔴 0 · 🟡 9 · 🟢 7

## 🟡 Major

### M1. No alternatives and no risks in the FeatureRange
- **Where:** PRD.md whole file (sections Context to Stages); requirements.md whole file.
- **Discrepancy:** The standard says the spec must evaluate alternatives and list risks and limits. Neither document does. The PRD states major product choices as settled facts: one assignment per offer instead of batch mode (line 32, cost about x2), one operation at a time per executor (line 24), a fixed 7-day limit (req T6-R06), and treating every interruption as uncertain (T5-R01). It gives no rejected option and no risk section. Some "Discarded" entries exist only in the solution design (ZA-D06 and others).
- **Rationale:** The project convention keeps mechanics out of the PRD, but trade-offs between product options are product intent. Add a short "Options considered / Risks" section to the PRD covering at least: batch vs per-offer, the throughput of one-at-a-time (M2), and the money held by uncertain cost (line 47).

### M2. The throughput claim has no backing, and the cost has no estimate
- **Where:** PRD.md:24, 32; requirements T3-R01 (line 124), T8-R01 (line 269), T2-R06 (line 93).
- **Discrepancy:** The PRD says an assessment returns "within minutes instead of up to a day". But the paid executor carries out exactly one operation at a time in the whole system, and assessments, Profile proposals and company research (an agent session made of many 120-second steps) share it. Assessing 100 offers at once (allowed by T8-R01) creates 100 sequential paid operations of up to 90 s each. Up to 3 automatic tries each makes the worst case several hours, and one company research holds back every assessment. The documents also do not estimate how many assessments a month fit into 100 PLN now that each one costs about twice as much.
- **Rationale:** This assertion about performance and cost lacks justification. State the expected queue time for N offers and the monthly assessment capacity per 100 PLN, or narrow the claim.

### M3. Contention for worker processes with other background work is not addressed
- **Where:** PRD.md:24 ("holds back as little other work as possible"); req T6-R05 (line 213), T3-R01; 2ba B1-R07 (pool of 2, shared by every queue).
- **Discrepancy:** The worker's processes are shared by ad syncs (up to 1 h per attempt), CV reading, the paid and local executors (local up to 30 min) and deliveries. The solution design raises the pool to 3 (ZA-D06), but a running sync plus both executors still fills it. A delivery, including a Reject's notice, then waits for up to an hour. AI work in turn can delay syncs. T6-R05 only says the delivery "waits for a free process".
- **Rationale:** Here a single shared resource is the bottleneck. Add a requirement that bounds delivery delay, or record the accepted risk.

### M4. Time limit and a pending result delivery contradict each other: a paid result can be lost
- **Where:** req T6-R07 (line 215) vs T6-R08 (line 216) and T6-R02/R05; SD T6 "Time limit" (no running operation, so fail).
- **Discrepancy:** Delivery is separate background work (T6-R05). After an operation ends with a result, the assignment stays in progress with no running operation until the delivery runs. If the 7-day limit passes in that window, T6-R07 fails it with "time limit exceeded". ZA-R03 then makes the delivery find a failed assignment, and the requesting module gets "failed". This contradicts T6-R08 ("a result ... the assignment can succeed"). The cost is charged and the result is discarded.
- **Rationale:** An implementer cannot satisfy both rules. T6-R07 should exclude assignments that already have a result waiting for delivery. Add an AC for this case.

### M5. A failed failure-delivery leaves the requesting module's matter stuck, and only the database can fix it
- **Where:** req T6-R04 (line 212), T6-R09; T7-R02 (line 242), T9-R04 (line 305); PRD.md:13, 16, 21.
- **Discrepancy:** When the receiver throws while being told of a failure, the assignment stays failed and the error is "noted for the owner". But the requesting module never learns. Profile keeps showing "Przygotowywanie propozycji" and refuses a new preparation for that CV. Companies refuses new research for that company. Nothing defines what happens when the delivery background work itself fails finally (2ba B1-R11 failure handler); a lost result delivery leaves the assignment in progress until the time limit. Neither the panel nor the module offers a remedy. This recreates the PRD problems "can only be fixed in the database" and "a result nobody takes stays open", and breaks the goal "exactly one outcome".
- **Rationale:** Specify one of these: requesting modules reconcile through the status read (T1-R07), the owner gets a "deliver again" action, or the risk is accepted explicitly. Also specify the final failure of delivery work.

### M6. Kept exchanges may store secrets and personal data with no retention
- **Where:** req T2-R08 (line 95), T2-AC06; PRD.md:48 (deleting old AI data put off); architecture rules moduly-i-zasady-kodu.md:162 (diagnostics leave out sensitive data and secrets).
- **Discrepancy:** T2-R08 demands the "exact request sent to the provider" for every operation, always. Read literally, that includes authorisation headers or API keys. It certainly includes CV content and other personal data. Nothing deletes it, and agent sessions with web search create a large footprint.
- **Rationale:** Secrets in the database violate a binding rule, and the data grows without limit. State "without secrets", and either accept the personal-data retention explicitly or set a limit.

### M7. The paid executor's maximum run times are missing, so T2-R05 cannot be tested
- **Where:** req T2-R01, T2-R05 (line 92), T2-R06 (line 93), T2-AC03.
- **Discrepancy:** T2-R06 sets 30 minutes for the local executor but gives the paid services only per-request limits (90 s for a single answer, 120 s per agent step). It gives no total for an agent session. T2-R05 requires every maximum run time to be below the queue's time limit (60 min), and the solution design adds a timer "around the whole operation" with no value.
- **Rationale:** The value decides how long research can block the paid executor (M2) and how much money it can spend. Give the value, or state how it is derived.

### M8. The owner is sent to the panel, but the panel shows "succeeded" with nothing to inspect
- **Where:** req T7-R03/R04 (lines 243–244), T8-R03/R04, T9-R02/R03; T11-R03 (line 356, no raw response); ZA-R01 (succeeded is final).
- **Discrepancy:** When a requesting module rejects a result (format, quotes, evidence), the assignment is succeeded and its money is spent. The Profile message says "Szczegóły są w panelu zadań AI", but the panel shows a succeeded assignment with no reason and no raw response. The assignment is final, so Retry is not offered. The owner cannot learn why it failed and must request it again in the module.
- **Rationale:** The owner's message points to the wrong place. Either let the panel show the module's rejection (or the raw response), or change the message.

### M9. A Success criterion contradicts the carried-over budget
- **Where:** PRD.md:57 vs req T10-R01 (line 329), T13-R01.
- **Discrepancy:** Success says the panel's monthly total equals "the sum of the budget charges of the month's operations, before and after the migration". But earlier attempts are not operations: they are archived (T10-R03), and their charge is carried as one amount. The month's charge is the carried amount plus the operations' charges.
- **Rationale:** As written, the criterion is false for the deployment month and cannot be tested. Restate it to include the carried amount.

## 🟢 Nit

- **N1.** PRD.md:24 ("every assignment ends within the time limit") and :56 ("No assignment stays unfinished past the time limit") contradict T6-R08, under which a running operation may finish after the limit, up to its maximum run time (local: 30 min).
- **N2.** T6-R08 (line 216): an operation that ends uncertain after the limit makes the assignment fail with "time limit exceeded". The uncertain cost then never reaches "needs attention", and the stated reason misleads the owner.
- **N3.** T3-R02 + T3-R04/R05 (lines 125–128): an operation whose potential cost exceeds the remaining room, or the whole limit, waits without any signal until the 7-day failure. Cheaper later operations can pass it repeatedly, and each re-join goes to the end of the line, so the budget is re-checked repeatedly with no progress. Worth one sentence in the PRD's risks.
- **N4.** T3-R05 and T6-R07 promise "within two minutes", but the 2ba periodic process (B6-R09) starts a pass 60 s after the previous one ends, and a pass has no bounded duration. The bound holds only if a pass is short.
- **N5.** requirements.md:9 ("old way still serving the modules not yet moved") reads as contradicting PRD.md:62 ("no old and new path run side by side"). Say that the PRD means the release and the requirements mean intermediate commits on `main`, where both paths count against one month (SD ZA-D07).
- **N6.** The glossary (Interrupted operation "either retried or uncertain", Retry "only what still has no correct result", the status "partially succeeded", Approve, Abandonment) disagrees with T5-R01 and ZA-R01 until T10-AC04 fixes it. Mark the deferred terms now.
- **N7.** Order of acceptance criteria: T8-AC09 comes before T8-AC08 (lines 289–290), and T9-AC06 before T9-AC05 (lines 316–317). T1-R09 ("check before placing") does not say which executor needs it or what the value is, so the reader must consult the SD.
