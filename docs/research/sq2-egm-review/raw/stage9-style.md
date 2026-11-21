# Stage 9 — Implementation Readiness Test (style, egm-style Goldfish)

Scope: `docs/specs/sq2-zlecenia-ai/solution-design.md` (SD, whole file) and `docs/research/sq2-egm-review/tickets-export.md` (epic sq2 and tickets sq2.1–sq2.14). Context: `GLOSSARY.md`.

Summary: 0 Blocker, 8 Major, 8 Nit.

## 🟡 Major

### M1. Failure reasons have two names each, and nothing maps one to the other
- SD lines 30, 97, 253, 258, 336 (`rejected`, `time_limit`, `delivery_failed`); sq2.7 T6-AC02 ("result not taken"), T6-AC03, T6-AC05/AC06 ("time limit exceeded"); epic Q77 ("dostawa nieudana").
- Discrepancy: the SD gives only the stored codes. The tickets give only the owner-facing labels. Neither says that `delivery_failed` is the same thing as "result not taken". The glossary has no term for the reason.
- Rationale: an implementer of sq2.7 cannot tell whether "result not taken" is a code, a display text or the same thing as `delivery_failed`. Add one mapping of code to label (Polish text included) in the closed-lists contract.

### M2. "Periodic process" / "proces okresowy" is not the glossary term
- SD lines 24, 188, 258, 317; sq2.4 T3-AC05, sq2.7 T6-AC05, sq2.11 description ("proces okresowy ma trzy kroki"), sq2.8 T7-AC04.
- Discrepancy: the glossary names this process **Scheduler** (proces harmonogramu), and the steps it calls **Periodic operation**s. "Periodic process" is never defined.
- Rationale: an implementer has to guess that "periodic process" means the Scheduler, not the worker. Use "scheduler" and "periodic operation", or add the term as an alias.

### M3. "Attempt" / "próba" / "podejście" has three meanings
- SD lines 44, 65, 69–71, 200–201, 233–234, 240, 256 (a queue job attempt); lines 80, 192, 315 and sq2.11 T10-AC01 ("old attempts": records of the old way); line 219 and sq2.5 description (an extra provider call after a transient error). sq2.5 T4-AC05 and sq2.6 T5-AC02 say "attempt of the background work".
- Discrepancy: the glossary says to avoid "attempt" and "próba" for Operation. The SD and the tickets use the word for three different things without saying which one is meant. "Background work" is not a glossary term.
- Rationale: T4-AC05 and T5-AC02 can only be tested once the reader knows which kind of attempt is meant. Write "queue job attempt" for the first, "old-way attempt" (stara próba) for the second, and "repeated provider call" for the third.

### M4. "Operation" also names public functions and handler steps
- SD lines 188, 258, 285 ("the module's own requesting operation"), 317; the "Operation" column of the situation tables (lines 115, 198, 268, 342), which lists Place, Start, End, Deliver and Retry. sq2.2 T1-AC01 ("placed in a committed operation"), sq2.8 T7-AC04 ("No Profile operation requests AI work"), and the Polish "złożenie zlecenia w operacji modułu".
- Discrepancy: the glossary defines Operation as one call to an executor. Here the same word also means a module's public function, a step of the job handler and a database transaction.
- Rationale: T1-AC01 reads as if an AI operation is committed or rolled back. Say "public operation" or "module function" for functions, and "transaction" for transactions. Rename the table column to "Action".

### M5. "Zadania AI" / "zadanie" collides with Assignment
- Epic title ("zadań AI"), ticket titles sq2.12–sq2.14 ("Panel zadań AI"), sq2.11 T10-AC03 ("AI tasks panel"), SD line 334 ("Zadania AI"). Polish "zadanie" also means a bd task (for example "między zadaniami") and a queue job ("zadanie kolejki").
- Discrepancy: the glossary says to avoid "task" and "job" for Assignment (zlecenie AI). The panel lists assignments but is called a tasks panel, and "zadanie" is used three ways in the tickets.
- Rationale: the page label may be a settled UI choice. If so, state that "Zadania AI" is only the page name, and keep "zlecenie" for the entity in the tickets and the English text.

### M6. The glossary contradicts the SD for nine tasks
- Glossary: Interrupted operation ("either retried or becomes uncertain"), Needs attention ("retry, reject or approve"), Assignment type and Executor (batch), Assignment status (partially succeeded), Executor capacity, Approve, Settle, Abandonment. SD ZA-D04 and lines 30–32 say otherwise. SD line 319 and T10-AC04 put the glossary update off to T10 (sq2.11).
- Discrepancy: from T1 to T9 (sq2.2–sq2.10), implementers read glossary definitions that the SD has already overruled, and the definition of Interrupted operation describes the opposite behaviour.
- Rationale: the glossary is the domain reference. Mark the terms that are put off now, or move the glossary edit into sq2.2.

### M7. "Reserve" / "rezerwacja" is used for the old model and the new one
- SD line 62, line 294 ("no longer reads a reserved amount"), line 315; sq2.10 ("ani kwoty rezerwacji"); sq2.14 description ("zarezerwowane"); sq2.11 T10-AC01 ("reserved amounts"). Elsewhere the SD says "charged" (ZA-D03, line 181).
- Discrepancy: in the new model the glossary term is Potential cost and "Budget charge", and requirement T13-R01 says "amount held by running operations". Yet sq2.14 shows "zarezerwowane", while T9 removes the "reserved amount".
- Rationale: a reader cannot tell whether "reserved" is an old-model figure or a new one. Keep "rezerwacja" for the old way only. For the new model, use "koszt potencjalny trwających operacji" or "held".

### M8. sq2.1 is stale and its Q references are wrong
- Ticket oferty-pracy-sq2.1, items 1–4.
- Discrepancy: it cites Q75 (saving the work identifier at OpenAI) and Q73 (cancelling work at OpenAI). In the epic, Q75 is "Retry does not extend the time limit" and Q73 is "frozen input on retry". It lists "wykonawca niedostępny" as a separate kind, but SD line 150 treats it as an ordinary failure. It asks about the batch assignment type, which is put off. It is still an open child of the epic, numbered in the same range as T1–T13.
- Rationale: as written, it would send an agent after a superseded design. Correct or close it, or mark it as outside the T-series.

## 🟢 Nit

1. **"The check" has four meanings.** SD lines 28, 30 ("the check's value included"), 61 and 286, and sq2.2 T1-AC07 ("an executor that needs the check"). It means a database constraint, the value checked before placing (T1-R09), the budget check, and the result check. Name each one, for example "pre-placing check value" (CALIBRATE).
2. **The "Towards more traffic" claims outrun the design.** SD line 358 says the AI module "can move behind a network boundary without changing" the requesting modules. Line 264 says receivers run inside the AI module's delivery transaction, which rules that out. Narrow the claim or drop it (CALIBRATE).
3. **The same reason line repeats three times.** "Reason: none recorded beyond the agent's reasoning, which the owner accepted" appears in ZA-D05, D06 and D07. Shorten it to "Reason (agent's, accepted):".
4. **"Proposal" is used as a marker but never defined.** ZA-D08 uses it; line 5 and line 7 define only *Contract* and *Owner*.
5. **The delivery queue settings are vague.** Line 46 gives the delivery queue "the queue mechanism's defaults". Name the values, or the source that defines them.
6. **ACs are out of order and some lack references.** In sq2.9, T8-AC09 comes before T8-AC08; in sq2.10, T9-AC06 comes before T9-AC05. T7-AC06, T8-AC08 and T9-AC05 cite no requirement.
7. **ZA-AC02 gives a path that does not resolve.** In every ticket, ZA-AC02 points to "/architecture/moduly-i-zasady-kodu.md". The file is `docs/architecture/...`, and AGENTS.md asks for the family name ("the architecture rules") without a path.
8. **The numbering is offset by one.** SD T<n> is ticket sq2.<n+1>, and SD "Order of the tasks" (line 354) names T-numbers only. Add the bd id to each SD section heading, or add a mapping line. Smaller points in the same area: "Receiver" (odbiorca) and "Ordinary failure" (zwykły błąd) are not in the glossary, although the counterpart term "Non-retryable failure" is. The epic description and its comments from 18 November still describe batch, Approve, Settle, an own queue and leases, and there is no summary of the current state at the top.

## Keep (checked, not findings)
- SD line 7 (what the owner has and has not read) and line 9 (commit observed, and what is not yet implemented) are claims backed by sources.
- SD line 233, "Exclusivity guarantees…", is backed by B1-D03.
- These Polish terms map consistently: zlecenie AI = Assignment, operacja = Operation, wykonawca = Executor, „wymaga uwagi” = Needs attention, błąd bez ponawiania = Non-retryable failure, limit czasu zlecenia = Assignment time limit, maksymalny czas działania = Maximum run time, Ponów/Odrzuć = Retry/Reject, koszt potencjalny/faktyczny = Potential/Actual cost.
