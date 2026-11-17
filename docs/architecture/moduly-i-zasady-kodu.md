# Architecture and coding rules

The application's entry points pass commands and queries to modules through the modules' public operations.

## Dependency rules

1. **Only the module that owns the data performs operations on that data.** Other modules, the API, the CLI and the worker pass a query or command through the owner's public interface. The owner reads the data, checks the rules, performs the operation and returns a result or a defined error. Table queries, including joins, repositories, adapters and the storage schema, are internal. In TypeScript we export public operations and their contracts explicitly from `modules/<module>/index.ts`.

   - **Operations are internal by default.** Before adding a public operation we name a specific client outside the module and a use case that the existing contract does not handle. The operation expresses the client's goal and exposes only the data needed. Matching may read the active confirmed profile version together with its ID through the Profile module's public service. [Professional profile contract](../../modules/profile/README.md#public-operations)
   - **Every public operation protects the module's invariants.** The module checks whether the command is allowed in the current state and protects the check and the write against a concurrent change. When a command relies on state the client read earlier, it gives the expected revision. If the conditions no longer hold, the module returns a conflict without a partial write. When a profile is confirmed, the Profile module checks the draft revision, creates the confirmed version and sets it as active in one transaction.

2. **Views assemble data through public read operations.** Each module provides the data needed for a specific view and itself calculates the values that follow from its rules. The view joins the responses by ID and is responsible for presentation, filtering and sorting. The Offers list passes ad IDs to a bulk read of the Matching module. Matching returns the rating, completeness and staleness of the assessment, and the Offers module uses the rating before sorting and pagination.

3. **The use case sets the transaction boundary.** The operation that carries out a use case decides which changes must be committed or rolled back together, and coordinates the transaction. If several modules take part in it, each writes its own data through a public operation in the same transaction context. The transaction mechanism belongs to the shared infrastructure. [Martin Fowler, Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) · [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)

## Data changes while a process runs

A process may work on data that other operations change or delete between the start and the end of the process. Successive steps may read different versions of the same data, or related information from different moments. Earlier findings and conditions may stop holding before they are used. This also applies to work handed over for asynchronous execution.

When designing each process, identify these situations, describe their consequences for the correctness of the run and the meaning of the result, and decide which are acceptable and which need handling. How they are addressed must follow from the needs of the given process and take the other architectural constraints into account.

Accepting the consequences of concurrent changes is a design decision and requires an explicit justification, just like introducing safeguards.

## Situations every operation answers

Beyond its normal path, every operation has a defined behaviour in each of the situations below that it can meet. A situation is left without one only when it cannot occur for that operation.

1. **A concurrent call on the same data.** Another operation or another run of the same process changes or uses the same data at the same time. The behaviour follows the rule that [every public operation protects the module's invariants](#dependency-rules) and the section on [data changes while a process runs](#data-changes-while-a-process-runs): a conflict, waiting, joining the running work or an accepted effect.
2. **A resource limit reached.** The operation runs out of time, of [database connections](#database-access) or of allowed size. The operation defines what is saved, what the user or the calling process learns, and that the resource is released.
3. **A repeated call.** The same command arrives again: a retry after an error, a second click, a job delivered twice. The operation defines whether the repeat has no further effect, gives the same result or is refused.
4. **Empty or malformed input.** Input with no items, missing fields or values outside what the contract allows, from the user, an integration or stored data. The operation defines whether it refuses it with a defined error, skips it or saves it in a defined form.

## Costs of design decisions

Some solutions work correctly and still leave a cost that only shows up in later changes. The costs below are not prohibitions in themselves: each can be justified. They do not relax the rules in the other sections: a public operation still requires a named client. Each one does, however, enter the code only as an explicit decision with its justification.

1. **A feature without a consumer.** An operation, field or mechanism added now, although nothing in the system uses it yet. Nothing verifies how it behaves, and the use that later needs it may need something different. For a module's public operations this extends the rule that [operations are internal by default](#dependency-rules). The justification may be the cost of adding it later, e.g. data that cannot be reconstructed retroactively.
2. **Backward compatibility of an internal interface.** Keeping the old shape of an operation or contract, although all its consumers are in this repository. We then maintain and test two paths instead of changing the consumers in the same change. The justification may be consumers outside the repository or data stored in the old format.
3. **A second mechanism for the same thing.** A new way of doing something that the module or the shared infrastructure already does, e.g. a second history record or a second queue. Every later change must choose between them, and the mechanisms drift apart. Before adding one, we look for an existing mechanism by its meaning, not by the name we would have given it. The justification is a named need the existing mechanism does not meet.
4. **A fixed list with two owners.** The same closed set of values defined in two places, e.g. in a module and in an instruction for an AI model. A change in one place without the other gives silent inconsistencies. Every shared fact has one owner, and the other places read from it; this is the same rule that [a module applies to its data](#dependency-rules).
5. **A stored copy instead of a reference.** A value copied from elsewhere where an ID read at the time of use would be enough. The copy goes out of date and needs synchronisation. The justification is a need to keep the state from a given moment, e.g. the ad content that a stale match assessment refers to.
6. **A rule carried over without its reason.** A restriction copied from another place, module or old code, whose reason does not hold in the new place. It looks agreed, although nobody decided it for this case. We carry a rule over together with its reason, which we have checked in the new place.

Accepting each of these costs, like accepting the effects of concurrent changes, is a design decision with an explicit justification.

## Code structure rules

### Module directory

The smallest module has a description of its responsibility, a public entry and a file with the operation's implementation. The file name says what can be done, e.g. `read-active-profile.ts`.

```text
modules/<module>/
├── README.md
├── index.ts
└── <operation-name>.ts
```

- **`README.md`** describes the module's main purpose and the data it is responsible for. We describe the significant conditions for using public operations next to their contracts.
- **`index.ts`** explicitly exports the operations and types the module's clients need. Clients import from here, and internal code uses the implementation files directly. We keep input and result types next to the operation, or in a separate file if several operations use them.
- **The operation file** carries the use case from receiving the command or query to the result. It also decides which changes must be saved together. Related operations may share a file named after their responsibility.

We add a subdirectory when there is something to gather in it and its responsibility can be named clearly.

| Directory | When it helps | Example |
| --- | --- | --- |
| `operations/` | The module has several use cases and it is worth gathering their entry points in one place. | `confirm-profile.ts`, `apply-cv-proposal.ts` |
| `domain/` | The module has rules that can be expressed from the passed data, without reading the database or calling a service. | Calculating the rating from scores and weights, checking that a salary range is valid |

`infrastructure/` contains the code that connects the module's operations with the database, external services and execution mechanisms. We add subdirectories matching what the module uses.

```text
infrastructure/
├── persistence/   # queries, writes and mapping of database data
├── adapters/      # integrations and port implementations
├── http/          # HTTP controllers
├── worker/        # handling of queue jobs
└── cli/           # CLI commands
```

An operation combines reading, domain rules and writing. Domain rules work on passed data. Code in `persistence/` knows the data schema of its own module. An adapter translates data into the contract defined next to the operation that uses it.

A controller, worker handler or CLI command passes data to the module's public operation and handles its result. When several modules write data in one transaction, the coordinating operation calls their public operations inside a shared transactional operation. The transaction context passes implicitly, and each module performs its own write. [Database access](#database-access)

### A module operation carries the whole use case

A public operation is responsible for the full course of a specific command. It reads the data it needs, checks the conditions, makes the change and returns the result. The application's entry point translates the request into a command and the result into a response.

When a proposal from a CV is applied, the route passes the choice of items and the expected draft revision. The Profile module reads the proposal, checks the revisions and saves the draft in one operation. This way every entry point applies the same rules. [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html)

### Interchangeable executors use a shared contract

A port describes what a use case needs. An adapter implements this contract with a specific technology. We choose the adapter implementation in the place that assembles the dependencies. The use case code uses the port's contract.

In the Sources module, the connector port takes a scope and delivers ads and information about whether the fetch was complete. The adapter handles the portal's details, and the operation that executes a run uses the same port to fetch the data and to settle the final state. [Ports and Adapters](https://alistair.cockburn.us/hexagonal-architecture) · [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### We translate external data at the integration

An anti-corruption layer turns an external system's model into the concepts used in the application. For a portal integration, the translation belongs to the connector. The Sources contract defines the meaning of the fields, and consumers use these meanings when applying their own rules.

If a portal distinguishes the employer's salary range from its own estimate, the connector passes the amount together with its origin. Matching applies one salary comparison rule based on the origin of the amount. A change to a field in the portal's response then concerns the translation code in the connector. [Eric Evans, Domain-Driven Design Reference, p. 34](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### A value object groups data that share a meaning

A value object represents a concept through its data and rules. Two such values are equal if they have the same significant attributes. We check validity when the value is created, and a change creates a new value.

A salary range covers the amount bounds, the currency, the period, the basis and the contract type. The rule that creates a salary range checks, among other things, the order of the bounds, if both are given. Code that compares salaries receives the whole salary range, so it can check whether they are comparable. [Eric Evans, Domain-Driven Design Reference, p. 12](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### An aggregate protects state that must change together

An aggregate groups data for which certain conditions must hold after every change. Changes go through the aggregate's root object, which enforces these conditions. The aggregate's scope is set by the state needed to check the rules and make the change. The full history can be fetched separately.

When a profile is confirmed, the new version and marking it as active are part of one change. The confirm operation checks the expected draft revision and saves both elements atomically. [Eric Evans, Domain-Driven Design Reference, p. 16](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)

### We separate calculation rules from reading and writing

A calculation function receives the data needed to make a decision and returns the result. The code that carries out the use case fetches the input, calls this function and decides about the write. This split is known as functional core and imperative shell.

The function that calculates the rating takes the criterion scores and the weights. It returns the rating and completeness, which can be checked against the passed data. The operation that saves the assessment is responsible for reading the weights and persisting the result. [Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell)

### A function describes steps at one level of detail

In a function that carries a use case, you can see the order of the actions that matter for its result. We extract a detail when a named operation lets you understand the step without reading its implementation.

Confirming a profile can be described as checking the revision, saving the confirmed version and activating it. SQL statements and row mapping belong to the code that performs these steps. [Clean Code, chapter Functions](https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780132639408)

## Database access

The rules apply to all code. Code created or moved after they were introduced applies them at once. Older queries, modules' helper transactions and session locks stay until the given code changes; a change to this code moves it over to them. The mechanism belongs to the shared infrastructure outside the modules: [database access](../../lib/db.ts).

1. **Pool.** A `pg` pool manages connections, one per process: in the web application, in the worker and in each CLI script. A query outside a transaction takes a connection for the duration of the query, a transaction for its whole duration. The pool has a limit of 5 connections and is created lazily from `DATABASE_URL`. A test may replace it before first use, e.g. with the pool of an isolated schema; replacing it during a transaction throws an exception. This rule replaces the earlier single session per process.
2. **Accessor.** Module code runs queries through the query executor accessor (`db()`). In a transaction the accessor returns that transaction's connection, and outside one it returns the pool. The transaction context passes through `AsyncLocalStorage`, so domain operation signatures do not contain a connection type, and the entry point prepares nothing. Module code does not depend on whether it runs inside a larger operation.
3. **Transactional operation.** The transaction boundary is set by the shared transactional operation (`transaction(fn)`), which returns the function's result. Outside a transaction it takes a connection, sends `BEGIN`, runs the function in the context of that connection and sends `COMMIT`. On an error it sends `ROLLBACK` and raises the original error; an error of the `ROLLBACK` itself does not replace it. The connection always returns to the pool, and a broken connection is released with an error so that the pool discards it. In an ongoing transaction the operation runs the function without `BEGIN` and `COMMIT`, so a module operation called on its own commits its changes itself, and one called during another becomes part of it. Parallel operations outside a transaction have separate connections and are independent of each other. Module code does not take connections from the pool by itself, does not hold them between operations and does not send `BEGIN`, `COMMIT` or `ROLLBACK` by hand.
4. **An error rolls back everything.** A use case operation is saved in full or not at all: an error in any step rolls back the writes of all modules, including steps that finished successfully. Work does not continue after an SQL error in the same transaction. SAVEPOINT is not used.
5. **Repositories.** Repositories in the module's `infrastructure/persistence/`, using the accessor, provide access to the module's data. A repository does not open connections or transactions and is not part of the module's public entry. There is one per aggregate, with methods that follow from the use cases, without generic CRUD operations for each table. List reads with filtering and pagination may have dedicated queries.
6. **No row locks for the caller.** Public read operations do not take row locks on behalf of the caller, so reading another module's data does not block changes to it. When publishing a match assessment, we accept that the profile or the ad may change between checking whether the assessment is current and saving it: the window is very short, and the owner can request the assessment again (owner's decision). Row locks on another module's data require a separate decision.
7. **Queue in the transaction.** Requesting background work is part of the operation that requests it. The shared infrastructure provides a query executor adapter for the pg-boss `db` option (`queueDatabase`). Each of its calls goes through the accessor, so a job sent in a transaction belongs to it: rolling back the operation rolls back the request.
8. **No session locks.** PostgreSQL session locks (`pg_advisory_lock`, `pg_try_advisory_lock`, `pg_advisory_unlock`) require a fixed connection, so code moved to the shared mechanism gives them up. Transaction locks (`pg_advisory_xact_lock`) are allowed. Protection against taking up the same work twice remains as a conditional state change in the database. We give up the mechanism that detected the interruption of a background process's work (owner's decision).
9. **Library independence.** The implementation uses `pg`, and the accessor has a `pg`-compatible `query` method, which both the pool and a connection satisfy. A later migration to a typed query builder (recommendation: Kysely) does not change the signatures of operations or repositories.
10. **Errors do not exhaust resources.** After any number of failed operations, connections return to the pool or are discarded, and the system handles further operations.

Database tests run on an isolated PostgreSQL and pg-boss schema, and set the shared pool to the isolated schema's pool before first use. [Mechanism test](../../tests/db.integration.test.ts)

## Coding rules

- **Names describe the operation and its subject.** `enqueueMatching`, `publishAiRating` and `readRatings` show which call requests work, saves a result or reads history. We base type and status names on the concepts in the [domain glossary](../../GLOSSARY.md).
- **We validate input data at the entry.** The route checks the shape of the HTTP request, the adapter checks the external response, the module enforces the domain rules. After validation we pass a typed result. For example, a valid assessment JSON still needs its evidence checked against the saved profile version and ad revision.
- **Diagnostics contain only the data needed to establish what happened.** We record the state, the cause and IDs that let us link events. Diagnostic messages and logs leave out sensitive data and secrets. [OWASP, Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude)
- **A new layer has a defined responsibility.** We extract one if it hides a rule or execution details that may differ between executors.
