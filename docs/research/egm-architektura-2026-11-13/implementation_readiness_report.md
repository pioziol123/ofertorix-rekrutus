# Stage 9 — Implementation readiness

## Readiness reviewer

Reviewer `/root/readiness` read the persona and implementation-readiness standard, input and context files, related Beads issues, architecture documents, module README files, domain documents, local-AI stages 02 and 05, runtime contracts and named source excerpts. No edits or test execution. Status evidence came from the supplied snapshot; the parent independently rechecked Beads after resuming and found the same task states and dependencies.

The plan is not ready for independent implementation of all twelve tasks. This is a finding about task preparation, not a demand for pseudocode or a redesign of the application.

| Task | Verdict | Missing preparation |
| --- | --- | --- |
| .1 | Needs preparation | Chunk/completion/error contract; preserve payloads and hashes. R2 |
| .2 | Nearly ready after .1 | Source/name mapping, registration and callers; choose unknown/duplicate behavior. |
| .3 | Conditional | Shared transaction for chunk counters with .4. R2 |
| .4 | Needs preparation | Persistence result, counters, duplicates and transaction. R2 |
| .5 | Needs preparation | Common execution protocol and source-specific completion rules. R2 |
| .6 | Needs preparation | Bulk DTOs and protected transactional reads. R4 |
| .7 | Conditional after .5 | Transactional finalization API and rollback verification. R2 |
| .8 | Functional scope clear; execution plan incomplete | File inventory, ownership with .12, UI/server boundary. R1/R5 |
| .9 | Not ready despite label | Durable result/publication handoff, legacy IDs and 334 dependencies. R1/R3 |
| .10 | Closest to ready | Shared lock protocol with .6. R4 |
| .11 | Not ready despite label | .6 dependency, AI accounting contract and ordering with .9/334.4/334.5. R1/R3/R4 |
| .12 | Not ready despite label | Ordering, concrete remaining moves and verification. R1/R5 |

**R1 — Major — Missing dependencies and overlapping ownership.** Input lines 831–832 explicitly require the read API from .6 for .11, but there is no native blocker. Lines 908–912 require coordination of .12 with .1 and .8 without ownership/order. Task .9 references open 334.2/.3/.6 and .11 references 334.4/.5 without defining integration order. Add .11→.6; assign migration ownership; identify which 334 outputs are already usable and which are prerequisites. Do not automatically block refactoring on unrelated live-runtime qualification. Define whether .9 or .11 owns shared attempt operations.

**R2 — Major — Connector/persistence/metadata protocol is incomplete.** `lib/sources/store.ts:59–82` detects observation duplicates and updates run counters in the same transaction as chunk persistence. `lib/sources/sync.ts:177–196` uses duplicates and unique observation counts to determine completeness. `lib/sources/himalayas-sync.ts:55–105` has rejection, duplicate, deadline and page-limit rules; lines 14–18 establish its direct CLI execution. A connector completion flag and unspecified counters do not establish how the split preserves these rules. Specify chunk/end/error data, duplicate/count validation ownership, persistence result and transaction boundaries. Preserve payload/hash semantics to avoid artificial revisions. Record source differences and retain direct CLI behavior where currently used.

**R3 — Major — Durable AI-result handoff and legacy execution identity are unspecified in .9.** Input lines 725–739 explain ownership but leave the handoff after an execution completes implicit. `lib/profile/ai.ts:92–121` currently couples input revision and attempt creation; `lib/profile/local-ai.ts:201–247` couples publication guard, attempt result, execution state and import update. Specify the durable result, owner of publication recovery, transaction checks for execution/token/text revision and mapping of paid legacy attempts to the new execution contract. State whether existing storage suffices or an additive migration is required. Verify crash between result and publication, duplicate delivery, obsolete revision/token, existing queued/unknown work and charging rejected content.

**R4 — Major — Shared transactional read contract is unspecified for .6/.10/.11.** The preservation requirement exists; it is not missing. However `lib/matching/ratings.ts:128–138` currently locks advertisement and active profile together using `FOR SHARE OF a,h`. Separate module refactors must use a common transaction context and compatible lock ordering, rather than reads through independent pool connections. Define protected and ordinary reads, minimal bulk DTOs and lock order. Verify concurrent profile confirmation/advertisement revision changes, one profile version per group and bounded bulk-query counts.

**R5 — Major — File moves and verification are underspecified for .8/.12.** Input lines 683–693 and 918–926 cover UI, API, worker, CLI and tests without a source→destination inventory or unambiguous entrypoint list. Define ownership, residual framework entrypoints, dependent imports/configuration and test relocation. Include check/build, relevant database integrations, rating filtering before pagination and a check that browser imports do not pull server dependencies through the module barrel.

## Style reviewer

Reviewer `/root/style_final` read the style persona, full input, three module README files, glossary and product requirements. No edits or tests.

**S1 — Major — Task .4 applies the completion condition too broadly.** Input lines 531–533 say availability changes require confirmed completeness. That condition should apply only to marking unseen advertisements unavailable. It must not prevent restoration when an advertisement is observed during a partial run or application of an explicit source status. Suggested wording: “Oznaczenie niewidzianych ogłoszeń jako niedostępnych wykonuje na jawne polecenie po potwierdzeniu kompletności, w zakresie przebiegu i dla źródła dopuszczającego takie wnioskowanie”.

## Codebase-details reviewer

Reviewer `/root/code_audit` completed after a usage-limit interruption and explicit resumption. It read the persona/standard, input, context and related issues, module README files, SOLID/JobSpy/Polish/Himalayas synchronization and source persistence, targeted AI budget/publication and matching locks, plus test/package/compiler/runtime configuration. Semantic search could not decrypt its keychain session; named-file inspection remained available. No tests, changes or external calls. Not an exhaustive review of every source reference, UI or migration.

**B1 — Major — Availability condition.** Confirms S1: `lib/sources/store.ts:43–46` restores availability on every observed upsert. Only absence-based invalidation requires completeness (`lib/sources/sync.ts:201–211`).

**B2 — Major — Execution differences need explicit preservation.** SOLID uses scope-level deduplication, scheduled-day suppression and 3600-second expiry (`lib/sources/sync.ts:47–70`). JobSpy/Polish use source-level deduplication and 300-second expiry (`jobspy-sync.ts:70–92`, `polish-sync.ts:71–98`). Failure classification differs (`sync.ts:85–90`, `jobspy-sync.ts:23–27`, `polish-sync.ts:22–26`). Himalayas runs synchronously (`himalayas-sync.ts:14–54`, `scripts/himalayas-sync.ts:7–9`). JobSpy checks a saved configuration fingerprint; Polish executes the saved query (`jobspy-sync.ts:166–174`, `polish-sync.ts:172–182`). Define preservation/change decisions in a per-family matrix and request/result contracts for .1–.5.

**B3 — Major — Transaction ownership and lock lifetime.** `lib/sources/store.ts:5–26` owns transactions, while synchronization holds a session advisory lock across fetching/recovery/writes with connection-loss protection (`lib/sources/sync.ts:145–169,222–230`). Matching uses `FOR SHARE OF a,h` and publishes in the caller transaction (`lib/matching/ratings.ts:128–153`). Define context, owner, non-nesting rule, ordering and lock lifetime across .3–.6/.10/.11. Verify rollback, duplicate delivery, lost session and concurrent changes.

**B4 — Major — AI publication and reservation protocol.** Paid profile settlement/import publication share a transaction (`lib/profile/ai.ts:311–338`). Local completion records runtime end then validates execution/token/text revision (`lib/profile/local-ai.ts:197–219,232–242`). `reserve` checks budget under a lock but does not itself persist a reservation (`lib/ai/budget.ts:32–56`). Define the caller-owned transaction, result delivery, stale-result fencing and reservation insertion, reusing current mechanisms. A new public wrapper around `reserve` alone is insufficient.

**B5 — Major — Concrete move/config map missing.** Python runner paths are runtime dependencies (`lib/sources/jobspy.ts:274–278`, `lib/sources/polish.ts:395`, `tests/test_jobspy_runner.py:16`). `tsconfig.tools.json:13` names only lib/worker/scripts; package scripts fix CLI and initialization paths (`package.json:14,23–29`). Define source→destination moves, shims, test imports and explicit module tool typecheck coverage. Missing proposed modules are not findings.

**B6 — Major — Regression execution plan incomplete.** Existing integration suites require `RUN_INTEGRATION=1` and create isolated schemas (`tests/sources.integration.test.ts:17–18,28–54`); advisory locks require serial test files (`vitest.config.ts:5–7`). Python checks depend on `JOBSPY_PYTHON` (`tests/polish-python.test.ts:5–14`). Map acceptance criteria to concrete tests and runnable commands/environment, preserve fakes and distinguish skipped verification from passes.
