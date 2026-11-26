# Stage 9 — implementation readiness (Goldfish)

Scope: `docs/specs/lq3-lista-aplikacji/solution-design.md` (SD) and `docs/research/lq3-egm-review/tickets-export.md` (DetailedRange: lq3, lq3.1, lq3.2, lq3.3). Read against requirements.md, the readiness checklist in `docs/agents/implementation-workflow.md`, the architecture rules and the current code.

Totals: 0 Blocker, 8 Major, 7 Nit.

The SD has strong operation contracts: SQL shape, error classes, a situations table, discarded options. The gaps below are about who builds what, the HTTP contract between pages and modules, and a few places where two literal readings of the text lead to different code.

## 🟡 Major

### M1. Operations and infrastructure are not allocated to tasks (SD lines 40-70, 86; tickets lq3.1-lq3.3)
Operations carry a "client", but the SD never says which task builds each one. The tickets say nothing either.
- Operation 5, "Application details" (SD 50), has two clients: offer details (T1) and the drawer (T2). T1 needs it to show the stage field. T1-R01 shows no note and no history, but the operation returns both.
- One migration (SD 32-36, 86) creates both tables and the Moja lista index. The SD does not say which task owns it. The owner is presumably T1, since T2 and T3 wait for T1.
- The module-boundaries test list, the module-map row (`docs/architecture/moduly.md`), the module README and the `view.ts` entry are all "joined" in the Rollout paragraph with no task named.
- The salary-label move (SD 61), the "Moja lista" link in the header (SD 71) and the Offers-by-IDs read (SD 58) belong to T2 only by inference.

Consequence: two parallel readers could build op 5 twice, or T1 could ship a narrower read that T2 must replace. Add a task-to-operation table, or one line per ticket saying "this task adds operations N..M, the migration, ...".

### M2. Shared paging and multi-choice elements: who extracts them is open (SD D8, D9, Risks line 99; lq3.2, lq3.3)
- nq3.1 is still in progress (◐). Its acceptance criteria (T1-AC06, T1-AC07) describe behaviour on its own page. They do not require reusable elements.
- The nq3 SD (`docs/specs/nq3-panel-synchronizacji/solution-design.md`) says nothing about shared components.
- D8 says the paging "becomes one shared element". T2-AC07 is a review criterion on lq3.2, so lq3.2 evidently does the extraction. The text never says so.
- D9 says the stage filter "uses the multi-choice element of the page Synchronizacje". If nq3.1 builds it inline, T3 has to extract it. No lq3.3 criterion, and nothing else in lq3.3, covers extraction or reuse. T3-AC01..05 are all behavioural.
- nq3.2-nq3.4 also edit the Synchronizacje page and are not yet in main.

Consequence: the implementer of lq3.2 or lq3.3 has to decide whether to refactor another epic's code, how large the element's props contract is, and what to do about conflicts. State which task extracts which element, the minimum contract that must stay unchanged (nq3 T1-AC06 and T1-AC07 still pass), and add a criterion to lq3.3 for the multi-choice reuse.

### M3. The HTTP contract between pages and modules is not stated, and the message transport is unsafe (SD 53, 65-67; A-R07, A-R10)
- The SD gives status codes (409, 404, 422) but no routes, methods, request fields, response bodies or read routes. T1 builds the routes, and T2's drawer and T3's list consume them.
- For offer details the SD says the page reads "the application details by offer ID". Today offer details come from `GET /api/offers/[id]` via `readOffer`. The SD does not say whether the stage joins that route or the page makes a second fetch.
- The A-R07 message "Etap tej aplikacji się zmienił — odśwież stronę" and the A-R10 message "Notatka może mieć najwyżej 10 000 znaków" contain non-Latin-1 characters ("ł", "ś", "—"). The existing handler `server/utils/companies.ts` sends messages in `statusMessage`, which is an HTTP status line. Every message there is plain ASCII. Non-Latin-1 characters in a status line are invalid in Node's HTTP layer and risk a 500 or stripped text. The page convention for readable messages is `error.data.data.message` (`app/components/OfferMatching.vue:53`).
- The SD does not say who owns the message text. Under rule 4 of the "costs of design decisions" in the architecture rules (a fixed list with two owners), the text should live in the Recruitments view entry or in the server error, not in both. D10 covers stages and labels, not messages.

Consequence: the implementer designs the wire contract and the message ownership alone, and the T1-AC03 route test on a running server may fail on the first try. Specify: the message goes in the response body, not in `statusMessage`. Name its single owner, and fix the minimal route table.

### M4. Move with expected equal to target: the SD and A-AC08 diverge on the literal reading (SD 47, 74-77; A-R13, A-AC08)
- SD operation 2: "A pair outside A-R03 is invalid input". The pair X→X is outside A-R03, so a call with expected = target gives 422.
- A-AC08, "choosing the current stage again records no stage change and returns success", will naturally be implemented as `move(expected = current, target = current)`. That call gives 422, so the test either fails or is rewritten.
- A-R13 holds only with a stale expected stage: the update finds no row and the current stage equals the target. The stage field never offers the current stage (A-R04), so this is the only real route.

Consequence: a fresh reader will write the A-AC08 test two ways. State in the SD that expected = target is invalid input, and that A-AC08 is exercised by a call whose expected stage differs from the stored one and whose target equals the stored one. Alternatively define the same-stage call as success without a write.

### M5. "now()" of the database as the moment of every stage (SD 44) against the Polish time rules (architecture rules, "Polish time" rules 2 and 4)
- The rules say code that "takes 'now' to store it" does so through the time library, and "now" is an argument so tests can fix it.
- The SD chooses SQL `now()` so the row and the history record share one moment. That is a reasonable reason, but it is not in the D table and does not name the rules it departs from. The decisions list says nothing of a cost accepted.
- Tests cannot inject a moment. Ties, the midnight case in T2-AC02 and the order in T2-AC04 / T2-AC08 can only be built by direct SQL or by two applications in one transaction. The SD does not say how.

Consequence: the reviewer may flag a rule violation as an owner finding. State the choice as a decision (reason; why it complies with rules 2 and 4, or the accepted exception) and give the test recipe, such as "equal moments: two creates in one transaction; midnight: the display function with a fixed moment".

### M6. Offers that the Offers read does not return, and the unavailability mark (SD 66, 58; T2-R02, A-R08)
- SD 66: "An item whose offer is missing from the answer shows its stage only." The title, company, mark and date are not defined (an empty cell, a placeholder text?). The click on the row and the drawer content (T2-R09) and the link "Otwórz ofertę" are not defined for it either.
- "Niedostępna w źródle" is shown "when its ad is unavailable at the source" (T2-R02), but `SourceAd.availability` has three values: available, unavailable, expired (`modules/offers/domain/filters.ts`). A-R08 names both "unavailability or expiry". The SD does not say whether expired shows the mark.

Consequence: two product decisions are left to the implementer. Fix both in the SD or requirements.

### M7. Concurrency, the load-bearing rule, is not in the verification list (SD 74-77, 88-92; epic `load_bearing` A-R07)
The situations table promises "two creates of one offer: one inserts, the other follows the rule" and "the loser gets a conflict or success". Verification lists only sequential cases: "every allowed and refused pair, A-R13, A-R07, restart". Nothing asks for tests of:
- two parallel creates with different targets;
- two parallel moves from one expected stage with different targets;
- a parallel move and a note save (the note does not touch the stage).

The tests run on an isolated database with the shared pool of 5 connections, so they are feasible. Add them to T1 and T2.

### M8. T3 Offers read: construction of the stage read in the offer list is under-specified for the query-count test (SD 59, 92; T3-AC05)
- "Reads the current stage of every application in one query" is defined. The count test (0, 1 and 50 applications) needs the way to count queries on the shared pool. The SD gives no mechanism and no baseline number. T3-AC05 asks for "the same number" only.
- The decision of how `Filters.stages` is parsed is given, but the existing `parseFilters` throws on any invalid value (`modules/offers/domain/filters.ts`). The SD says unknown stages are left out. Say explicitly that the `stage` key is the one exception, so the implementer does not copy the throwing behaviour.

These two are small. I put them at Major only because T3-AC04 and T3-AC05 fail in surprising ways when they are guessed wrong. Reduce to Nit if the owner accepts this.

## 🟢 Nit

- **N1. Salary in the drawer** (T2-R09, SD 58, 61). An offer has several `salaries`, each with an origin note, and the list shows each one. "Salary" in Offers-by-IDs and "the salary range" in the drawer do not say whether all salaries and the origin notes are shown, nor what is shown for none. Say "the same rendering as the list's salary block".
- **N2. Note content that PostgreSQL refuses** (SD 49, 78). A note holding U+0000, or a lone surrogate from JSON, makes the `UPDATE` fail with a database error, which becomes a 422 without the A-R10 message. State the behaviour (refuse as invalid input, or strip).
- **N3. Stage field component** (A-R04, SD 65-67). The offer details and the drawer both need "one stage field". The SD does not say that T2 reuses the component T1 builds. Say it, as rule 3 of the costs of design decisions asks (a second mechanism for the same thing).
- **N4. Quality gates absent in the tickets.** nq3.1 carries PS-AC01 and PS-AC02 (all checks pass, module boundaries kept). lq3.1-lq3.3 carry none. The runner's gate covers this anyway, so this is only consistency.
- **N5. Epic metadata.** The epic lists `load_bearing` but no `shared` criteria. A-AC04 is repeated by lq3.1 and lq3.2, and the epic has no `ready-for-agent` label yet (the epic hand-off step). Check the `shared` entry when handing off.
- **N6. Module directory name.** The tickets and the SD say "Recruitments" / "Rekrutacje". The boundaries test, README link and map use a directory name (`modules/recruitments/`). The SD does not state it, though the name is derived easily. Add it to the allocation table of M1.
- **N7. Test fixture for offers.** Start-application tests need an ad in the Sources catalogue. Existing helpers in `tests/offers.integration.test.ts` serve, but the SD does not point at the pattern.

## Checked and found sufficient

- Storage columns, checks, uniqueness and the index (SD 32-38) are exact. The migration style matches the existing files (`.cjs`, raw SQL, `timestamptz`).
- Create and move SQL semantics, the read-committed behaviour of `ON CONFLICT DO NOTHING` followed by a read, and the no-row-lock rule match architecture rule 6 under database access.
- The situations table covers every operation in all four situations (architecture rules, "Situations every operation answers").
- Dependency direction (Offers → Recruitments, the Recruitments module imports nothing) fits the dependency rules. The browser-safe `view.ts` entry matches the module-boundaries test.
- Every acceptance criterion of requirements.md appears in exactly the intended ticket: A-AC01..08, T1-AC01..03, T2-AC01..10, T3-AC01..05. Dependencies are wired as the SD says. The T1-AC02 sequence is valid under A-R03.
- Dates: `formatDate` gives `DD.MM.RRRR` and `formatDateTime` gives `DD.MM.RRRR HH:mm` (`lib/time/display.ts`).
