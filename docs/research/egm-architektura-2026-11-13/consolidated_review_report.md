# Assessment of the preparation of the epic "Code architecture fixes"

The review of epic `oferty-pracy-0mq` finds that the chosen split into modules is justified. However, some tasks leave the implementer decisions that affect how the application behaves. The most important gaps concern cooperation while fetching ads, shared transactions, and the handover and settlement of AI results. Resolving them reduces the risk that tidying the code silently changes how the system works.

The report helps the project owner assess these findings and decide what to clarify in the tasks. For each point it explains the basis of the assessment, the possible consequences and the proposed direction of a solution. The proposals are not approved requirements.

## Scope and how to read the assessment

The basis is the review of 13 November 2026: all 12 open tasks of the epic, the documentation in `docs/architecture/`, the relevant module descriptions and selected flows in the code. The review checked conformance with the adopted rules: a module is responsible for its own data, other parts of the system use its public operations, and changes that belong to one use case may take part in a shared transaction.

The assessment refers to the code at commit `a6f54a6855c786b8a375401ccf6511b3c0cc624a`. It was a static review: no application, tests, build or AI models were run. The described effects are refactoring risks, unless existing behaviour is named explicitly. The report does not prove that these defects occur in the running application.

This edition includes the clarification of F1 and the content of the task on saving results as checked on 14 November. The other points keep the assessment from the original review; their currency was not re-audited.

The labels `.1`–`.12` are short forms of the identifiers `oferty-pracy-0mq.1`–`oferty-pracy-0mq.12`. Points F1–F7 were judged significant, because if left unexplained they can lead to a change in behaviour or to incompatible implementations. F8 is a note that tidies the scope. A missing clarification alone does not mean that the task's goal is wrong.

## F1. Fetch completeness is the condition for inferring from an ad's absence

**Concerns:** `.4` — saving fetch results, and `.7` — the availability rule after a complete run.

### Context and finding

A sync fetches ads from a set scope of one source. Results may arrive in chunks, and a later error does not invalidate valid data received earlier. So the information about a specific ad that was found must be kept apart from a conclusion drawn from its absence.

The original description of task `.4` made the availability update depend on confirmed completeness. Such broad wording could also cover restoring the availability of an ad that has just been found. Yet the existing save already does this while receiving results, even when the whole run ends up partial.

Three bases of information matter:

| Basis | What it allows us to establish | Does it require a complete run? |
| --- | --- | --- |
| Ad found in the results of active offers | Its availability can be confirmed during the fetch. | No. |
| Status or expiry date passed by the source | The closing or expiry of a specific ad can be kept. | No. |
| A known ad missing from the results | Marking it as unavailable can be considered. | Yes, but completeness alone is not enough: the source must allow such inference, and the comparison must concern the same source and scope. |

Receiving the content alone does not prove that the ad is active: the source may still return an expired posting. The current application stores availability and computes expiry from the date as separate pieces of information. The refactor should not merge them implicitly or erase the expiry information after a new fetch.

### Why it matters

For example, ad A was unavailable and B was available. The next fetch found an active A, and then the connection was interrupted. There is a basis to restore A's availability. There is no basis to change B: it may have been in the part of the results that was not fetched.

Making both changes depend on a complete run would delay the use of reliable information about A. On the other hand, treating every absence as unavailability could wrongly mark B as unavailable. These are two different rules, even though both concern availability.

### Resolution status

This distinction is already recorded in the description, implementation hints and acceptance criteria of `.4`. Assessing absent ads separately belongs to `.7`; a separate responsibility does not mean a new queue or background process must be started. The general rules are also explained in the [availability description in the Sources module](../../../modules/sources/README.md#how-availability-is-established).

F1 is therefore clarified at the level of the requirements of `.4`, but it does not confirm that the refactor was carried out. No new precedence rules for conflicting signals were set, and handling of an explicit closed status was not confirmed in all connectors. Such changes would need a separate assessment. The task still depends on the agreements described in F2 and F3.

## F2. A common way of fetching requires deciding which differences stay

**Concerns:** `.1`–`.5`, partly `.7`.

### Context and finding

A connector connects to a source and translates its data into the form the application uses. The common interface is meant to let the same application logic drive the fetch, regardless of the chosen connector. However, establishing that a connector returns chunks of ads and information about completeness does not define the whole cooperation.

In the checked code, saving a chunk detects repeated observations and updates counters. The results of that save are then used when assessing completeness. So an agreement is needed that covers both fetching and saving: who counts unique ads, what a duplicate means, and who makes the final decision on the run's outcome.

In addition, the existing paths behave differently:

| Area | Difference found in the review | Why it needs a decision |
| --- | --- | --- |
| Repeated request | Some paths recognise already requested work by source and scope, others by source alone. | Unifying them may allow parallel fetches or block requests that were allowed before. |
| Schedule and wait time | The guards against a second start on the same day and the work expiry times differ. | A common executor may change how often a fetch runs or whether it can run at all. |
| Error after part of the data was received | The number of pages or observations is used to tell a partial result from a failed one. | After the refactor the same run may get a different status. |
| Start from the terminal | There is a path without a queue that returns the result directly to the command. | Forcing a queue will change how that command is used. |
| Configuration change after the request | One path checks whether the configuration still matches the saved version; another runs the saved query. | It must be decided whether waiting work is executed or rejected after a settings change. |

### Possible effect and proposal for assessment

Without these decisions, two implementers may produce compatible data types but give them different meanings. For example, a counter may mean the number of all received entries or the number of unique ads. With a repeated entry the results will differ, which can affect the completeness assessment and the later determination of unavailability.

The proposal is one agreed description of the cooperation: the meaning of a chunk, of completion and of an error, the save result, the counters, and the responsibility for duplicates. For the differences in the table, it is worth stating which we keep and which we change on purpose. Choosing a connector also requires defining the relation between a source and a connector name, and the reaction to a name that is unknown or registered twice.

A separate boundary to preserve is the detection of content changes. A change in code organisation, or in how the same data is represented, should not by itself create new versions of all ads. Assessing this proposal therefore comes down to one question: should the epic only tidy the existing fetching, or also deliberately unify selected behaviours?

## F3. The split into modules must keep the shared save and the protection against concurrent change

**Concerns:** `.3`–`.7`, `.10`, `.11`.

### Context and finding

The architecture rules allow a shared transaction: several modules perform their own operations, but all changes commit or roll back together. The tasks refer to this rule, but they do not define a common way for the new public operations to apply it.

This is not only about committing the save. In the existing flows, database locks protect the state while an operation runs. For example, publishing a match assessment protects both the ad and the active profile at the same time. After reads are split between modules, this protection must be kept. Two independent reads are not its equivalent.

### Why it matters

Imagine that the application checks the current profile version, and then another operation changes the profile before the assessment is saved. If the refactor removes the existing protection, a result based on earlier data may be published as current.

A similar problem concerns the finalisation of a fetch: marking unseen ads as unavailable and saving the complete end of the run should share the same fate. A failure between independent saves could leave a state that the existing transaction did not allow. The sync also holds a session lock during the fetch; losing the connection must still take away the executor's ability to continue the protected work safely.

### Proposal for assessment

Before these tasks are implemented independently, it is worth agreeing who starts the transaction, how it is passed to participating operations and how long locks are held. An operation that takes part in a shared transaction should not silently replace it with its own independent transaction. An ordinary read for a view and a read that protects a later save may need separate conditions of use.

The agreement should also cover bulk reads from Sources and Profile. Splitting an existing query should not turn a list of a hundred items into a hundred separate queries.

Evidence that the rules are preserved would be scenarios of rolling back the finalisation, losing the fetch session, delivering the same work twice, and a concurrent change of the profile or an ad during publication. The proposal concerns clarifying an existing architecture rule; it does not require choosing a new transaction mechanism up front.

## F4. An AI result, its publication and its cost have separate success conditions

**Concerns:** `.9` — AI profile proposal, `.11` — removing workarounds between modules; related tasks of epic `oferty-pracy-334`.

### Context and finding

The AI module executes a request and settles its cost. The module that uses the result assesses whether it can be applied to the current data. So generating a response is not the same as publishing it, that is, saving the result as the valid proposal or assessment.

The checked code already contains safeguards: the paid profile path settles the attempt and updates the import in a shared transaction, and the local path checks the execution identity, the right to publish and the version of the input text. However, the descriptions of the new module boundaries do not set the full way of handing over a durable result, recovering publication and settling the attempt.

The difference between checking the budget and reserving it also matters. The existing function used when reserving funds locks and checks the budget, but it does not itself save a durable reservation. Exposing it under a new public name will not provide a complete operation for reserving funds.

### Why it matters

The model may already have returned a paid result while the application stops work before publishing it. After resuming, the application should be able to use the stored result instead of calling the model again. If the input data changed in the meantime, publication may be rejected, but the cost incurred still needs settling.

An incomplete agreement between modules therefore risks losing the result, paying twice, or applying a response to stale data. Moving the functions into the AI module does not by itself solve these cases.

### Proposal for assessment

It is worth defining the full flow: request, storing the result, reading it, checking the publication conditions, publication and settlement. An owner is also needed for the operation that combines actions of several modules, plus a rule for resuming after an interruption. For groups of assessments it must be explained how the budget of a whole group is reserved and how individual attempts are settled.

The decision must take into account existing data and work in the queue: their identifiers, waiting work, and executions whose result remains uncertain. Only on that basis can one judge whether the current storage is enough or the data schema needs extending.

Whether the solution is sound can be checked by an interruption between generation and publication, a repeated delivery of work, an attempt to publish an old result, and settling the cost even though the content was rejected. The recommendation is to use existing mechanisms; the review did not show a need to build a new task execution engine.

## F5. Dependencies and the split of responsibility do not set an unambiguous order of work

**Concerns:** `.1`, `.6`, `.8`, `.9`, `.11`, `.12`.

### Context and finding

A dependency between tasks means that one needs a specific result of the other. The checked epic records part of this order: `.2` depends on `.1`, `.5` on `.2`, `.3` and `.4`, and `.7` on `.5`.

Gaps remain, however. Task `.11` requires the ad read created in `.6`, but in the checked graph it did not have this dependency. Task `.12` covers moving files that partly already belong to `.1` and `.8`. The instruction "coordinate" alone does not decide who does the shared part.

Tasks `.9` and `.11` also refer to the AI work in epic `oferty-pracy-334`. The open status of that work does not prove that the required code does not exist: some mechanisms have been delivered, and the remaining acceptance also includes separate checks in the running environment.

### Possible effect and proposal for assessment

An implementer may start work without the needed interface, create their own variant of it, or move again files changed by another task. The opposite risk is waiting needlessly for the whole neighbouring epic, even though the needed part is already available.

The proposal is to record the dependency of `.11` on `.6` and to assign each group of moves to one task. One possible variant is to leave in `.12` only what `.1` and `.8` do not move; the choice of order remains the project owner's decision.

For the AI integration it is worth naming the specific required results from tasks `334.2`–`334.6` and splitting the responsibility of `.9` and `.11` for shared AI attempt operations. This makes it possible to assess the real blockers without equating a whole task not yet accepted with the needed code being missing.

## F6. Moving files may change how the application is started

**Concerns:** `.8` — Offers module, `.12` — module directories, partly `.1` — connectors.

### Context and finding

The description "move all files that belong to the module" does not decide the boundary between module logic and the view, HTTP route, terminal command, queue handling and tests. Some of these files must stay in a location the framework recognises, or keep an entry point in the current place.

The review also found dependencies on file locations: adapters run Python scripts at specific paths, and tests know these locations. The type-checking configuration for tools did not name the `modules/` directory explicitly. Imported files may still be checked, but new standalone entry points need to be covered.

### Why it matters

Fixing TypeScript imports does not guarantee that the worker will still find the Python script, or that a new tool will be checked before it runs. In addition, a shared public export file of a module can join view code with server dependencies. Then an import the browser needs may unintentionally pull in database access code.

### Proposal for assessment

Before the moves, it is worth setting a map of current and target locations, naming the entry points that stay, and the needed changes to startup and configuration. The map would be working material for the task; the report does not need to repeat the whole file list.

The plan should also explain how to expose publicly the code views need without including server dependencies. Changed entry points and integrations should be reflected in the architecture diagrams. Missing target files before the refactor are natural; the note concerns the unsettled scope of the moves and their effects.

## F7. Test results must be tied to the scenarios that were actually run

**Concerns:** the whole epic, especially `.8`, `.9`, `.11`, `.12`.

### Context and finding

The acceptance criteria list some behaviours to preserve, but they do not state unambiguously how they will be checked. In the existing configuration, integration tests are skipped without `RUN_INTEGRATION=1`. They require isolated application and queue schemas to be prepared; their files run serially because of locks that span the database. Some Python adapter tests also require `JOBSPY_PYTHON`.

This means that a passing plain `pnpm test` may not cover the scenarios most important for this refactor: transactions, locks, the queue and data saving.

### Possible effect and proposal for assessment

Without linking the criteria to the checks that were run, it is easy to treat a task as verified even though the tests of the required path were skipped. The risk concerns the strength of the acceptance evidence, not the number of tests.

The proposal is to assign the relevant existing suites and the missing scenarios to the criteria. The plan should include type checking with `pnpm check`, building with `pnpm build`, integrations run against a prepared isolated database, and tests of the Python adapters in use.

The most important areas are saving and completeness of a fetch, assessment lists and history, profile changes, publication of AI results, and the costs of groups and of company research. The mere existence of tests in these areas does not confirm coverage of the new criteria. Most behaviours can be checked with fake sources and models, without paid calls. The acceptance result should distinguish checks that were run from those skipped or blocked by the environment.

## F8. Grouping ads belongs to the Offers module

**Concerns:** `.8` and the module map. **Resolved.**

The Offers module groups ads that concern the same recruitment into one job offer. This is an established responsibility of the module, not an optional direction of its development. The Sources module is responsible for individual postings and does not take over grouping.

The module's responsibility must be kept apart from the scope of implementation: task `.8` tidies the existing code and keeps the list and details working. Implementing the grouping function stays outside the scope of this refactor. The descriptions should neither question the owner of this function nor suggest that tidying the code delivers it.

## How the findings affect the assessment of each task

The table collects the assessment of readiness for implementation, not the execution status in Beads. "Conditional" means that the task's goal is clear enough, but execution needs a shared agreement named in the report. The assessment comes from the review of 13 November, taking into account the clarification of F1 in `.4`.

| Task | Readiness assessment | What needs attention |
| --- | --- | --- |
| `.1` — connector interface | Needs clarification of the cooperation and the scope of moves. | Meaning of chunks, errors and completeness, and preserving source differences — F2, F6. |
| `.2` — connector selection (`ConnectorProvider`) | Close to ready once the interface from `.1` is set. | Linking a source to a connector and the reaction to invalid registration — F2. |
| `.3` — run metadata | Conditionally prepared. | Counters, transaction boundary and locks — F2, F3. |
| `.4` — saving results | F1 clarified; shared agreements remain. | Save result, counters and participation in the transaction — F2, F3. |
| `.5` — collector execution | Needs clarification of the common run. | Preserving fetch differences and protecting execution — F2, F3. |
| `.6` — ad read | Needs the conditions of the public read to be defined. | Bulk results and reads that protect a later save — F3. |
| `.7` — availability rule | Conditionally prepared after `.5`. | Conditions for inferring from absence and a shared rollback with finalisation — F1, F3. |
| `.8` — Offers module | Clear goal, incomplete execution plan. | Split with `.12`, moves, view/server boundary and acceptance — F5, F6, F7. |
| `.9` — AI profile proposal | Needs agreements before standalone implementation. | Durable result, publication, cost and dependencies on AI work — F4, F5, F7. |
| `.10` — Profile read | Closest to ready in the original assessment. | A common way to take part in the transaction and hold locks — F3. |
| `.11` — removing workarounds between modules | Needs agreements before standalone implementation. | Availability of the needed reads, cooperation with AI and order of changes — F3, F4, F5, F7. |
| `.12` — module directories | Needs the remaining scope to be set. | Owner of the moves, change map and how startup is checked — F5, F6, F7. |

The `ready-for-agent` label does not remove the gaps described. In the original review this applied especially to `.9`, `.11` and `.12`: implementing them on their own would require decisions beyond the unambiguous task description.

## Conclusion for the decision on further work

The review gives no grounds to reject the chosen split into modules. It does, however, point to places where the refactoring description leaves too many possible interpretations. Three shared agreements matter most: the rules for fetching and saving results, the participation of modules in transactions, and the handover and settlement of AI results. The consistency of several tasks at once depends on them.

F1 already has the distinction recorded in the task on saving results. For the remaining findings, the owner's decision first concerns whether the proposed additions are justified, and then where and how far to record them in the tickets. Setting the responsibility for moves and the way of acceptance will then allow the order of implementation to be arranged. The report provides the basis for these decisions; it does not by itself change the scopes, dependencies or statuses of the tasks.
