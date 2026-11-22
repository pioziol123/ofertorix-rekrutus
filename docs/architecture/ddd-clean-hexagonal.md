# DDD, Clean Architecture and Hexagonal Architecture in a module

This document says how the three approaches are applied inside one module of this system. It selects ten rules, and for each gives the rule, why it exists, when to apply it and when to leave it out, an example and an anti-example. Every example comes from the AI module (`modules/ai/`), which was brought to these rules in [pull request #PR_NUMBER](PR_URL); each rule ends with what that change did.

Read it before designing or reviewing a change inside a module: where a new file goes, what it may import, where a rule is written, and whether an integration needs a contract of its own. It builds on the binding [architecture and coding rules](moduly-i-zasady-kodu.md) and does not repeat them: those rules say what must hold between modules and name the patterns, this document shows how the patterns look in code and where each stops being worth its cost. Where the two disagree, the binding rules win.

**Scope of the rules.** The import directions of the [layers](#the-layers-of-a-module) are checked by the [module boundary test](../../tests/module-boundaries.test.ts) for the modules it lists as layered, today the AI module. In every other module the rules apply to code created or moved from now on, and older code moves over when it changes, as the binding rules already do for [database access](moduly-i-zasady-kodu.md#database-access). A module joins the test's list in the change that brings its last file to the rules.

## What each approach contributes

The three approaches answer different questions about the same code, so a module uses all three at once.

| Approach | The question it answers | What it gives a module here |
| --- | --- | --- |
| Domain-Driven Design | What does the inside of the module say? | The names from the [glossary](../../GLOSSARY.md), the rules of the module written once, the data that must change together, values that carry their own rules. |
| Clean Architecture | Which code may know about which? | Layers with one direction of imports, and the operation as the unit that carries a use case. |
| Hexagonal Architecture | How does the inside meet the outside? | Contracts the module owns (ports) and replaceable code that fulfils them or calls the module (adapters). |

## The layers of a module

A module has up to four layers. A file's directory says which layer it belongs to, and the layer says what the file may import from its own module.

```text
modules/<module>/
├── index.ts, view.ts        the public entries
├── <operation>.ts           operations: one file per use case, at the root
│   or <responsibility>/     or gathered in a directory (AI: assignments/)
├── domain/                  the module's concepts and rules
├── ports/                   contracts the operations need from the outside
└── infrastructure/
    ├── adapters/            implementations of the ports, integrations
    ├── persistence/         the module's repositories
    └── http/, worker/, cli/ entry points that live in the module
```

| Layer | Holds | May import from its module |
| --- | --- | --- |
| `domain/` | Closed lists, value types, pure functions that decide or calculate. | `domain/` only. Nothing outside the module, no platform code (`node:`, environment). |
| `ports/` | Types of the contracts an operation calls and something else implements. | `domain/`, `ports/`. From outside the module, types only. |
| Operations | The use cases: read, decide by the domain, write, call a port. | `domain/`, `ports/`, other operations, `infrastructure/persistence/`, and from `infrastructure/adapters/` only `registry.ts`. |
| `infrastructure/adapters/`, `infrastructure/persistence/` | Code that knows a technology: a provider's protocol, SQL. | `domain/`, `ports/`, and files of its own directory. No operation, and adapters and persistence do not import each other. |

Imports point inward: from the infrastructure and the operations towards the domain. The one arrow that points outward, an operation importing its repository, is this project's decision and is explained under [rule 9](#9-add-a-port-only-where-the-outside-varies-or-is-not-yours). The directories `domain/`, `ports/` and `infrastructure/` are optional: a module adds one when it has something to put there, as the binding rules say for [the module directory](moduly-i-zasady-kodu.md#module-directory).

## How to read a rule

Each rule has the same parts. **Rule** is the statement to check a change against. **Why** names the cost the rule avoids. **Apply when** gives the condition, and where it matters the condition for leaving the rule out. **Example** shows code of the AI module that follows the rule. **Anti-example** shows code that breaks it: the AI module's code before the pull request where it says so, otherwise an invented case marked as such. **In the AI module** says what the pull request changed for this rule.

## Clean Architecture

### 1. Dependencies point inward

**Rule.** A file imports only from its own layer and the layers further in, by the table of [the layers](#the-layers-of-a-module). A type-only import counts as an import.

**Why.** The domain holds what changes for business reasons, the infrastructure what changes for technical ones. When the domain imports an executor's file, a change of a provider's protocol can break the rule that decides a retry, and a rule cannot be read or tested without loading the technology around it.

**Apply when.** Always, in a layered module. When a file in `domain/` needs a type that lives further out, the type is in the wrong place: move the type inward, do not import outward. A concept used on both sides of a contract (a cause, a usage, a price list) belongs to the domain, and the port refers to it.

**Example.** The read object of the panel names the status, the type and the cause of an assignment. All three are domain concepts, so [`domain/panel.ts`](../../modules/ai/domain/panel.ts) imports them from its own layer:

```ts
// modules/ai/domain/panel.ts
import {
  ownerActions,
  type AssignmentFailureReason,
  type AssignmentStatus,
  type AssignmentType,
} from './assignment.ts'
import type { OperationCause, OperationState, OperationWait } from './operation.ts'
```

**Anti-example.** Before the pull request the same file reached into the operations and the executors for them, and the operations took a domain type from the repository:

```ts
// modules/ai/domain/panel.ts, before
import type { AssignmentStatus } from '../assignments/assignment.ts'
import type { OperationCause } from '../executors/outcome.ts'

// modules/ai/assignments/after-operation-end.ts, before
import type { OperationOrigin } from '../infrastructure/persistence/operations.ts'
```

**In the AI module.** The statuses, types, failure reasons and limits of an assignment moved to [`domain/assignment.ts`](../../modules/ai/domain/assignment.ts); the states, origin and causes of an operation to [`domain/operation.ts`](../../modules/ai/domain/operation.ts); the usage and the price list to [`domain/usage.ts`](../../modules/ai/domain/usage.ts) and [`domain/price-list.ts`](../../modules/ai/domain/price-list.ts). The boundary test now fails on an import that points outward.

### 2. Facts in, decision out

**Rule.** A rule that decides is a pure function in `domain/`: it takes the facts as arguments and returns the decision. The repository supplies the facts, and the operation carries the decision out. The binding rules call this split [functional core, imperative shell](moduly-i-zasady-kodu.md#we-separate-calculation-rules-from-reading-and-writing).

**Why.** A decision buried between a query and a write can only be checked by running the database. As a function of facts it is read in one place, tested in milliseconds for every case, and reused by another operation or by a view.

**Apply when.** The outcome depends on a comparison of values the operation already holds or can read first: a status, a count against a limit, a deadline. Leave the rule in the query when it selects a set of rows, see [rule 4](#4-a-rule-has-one-owner). A fact that is itself a comparison the database makes more exactly, such as a deadline against a moment, is read as a fact (`withinTimeLimit`) and passed in.

**Example.** What follows the end of an operation is decided by [`nextStep`](../../modules/ai/domain/next-step.ts) from passed facts. The operation reads the facts, asks, and acts:

```ts
// modules/ai/domain/next-step.ts
export function nextStep(ended, operations): NextStep {
  if (ended.assignmentStatus !== 'in_progress') return 'nothing'
  if (ended.state === 'succeeded') return 'nothing'
  if (
    ended.state === 'failed' &&
    ended.retryable === true &&
    ended.origin === 'automatic' &&
    !operations.deadlinePassed &&
    operations.automaticOperations < operations.automaticOperationLimit
  )
    return 'next_operation'
  return 'needs_attention'
}

// modules/ai/assignments/after-operation-end.ts
const operations = await readAssignmentOperations(ended.assignmentId)
const deadlinePassed = operations.deadline <= ended.now
switch (nextStep(ended, { ...operations, deadlinePassed })) {
  case 'next_operation':
    return addOperation(ended.assignmentId, operations, 'automatic')
  case 'needs_attention':
    await setNeedsAttention(ended.assignmentId)
}
```

**Anti-example** (invented). The same rule written where the data is, so that it exists only as a query and a branch:

```ts
const { rows } = await db().query(
  `SELECT count(*) FILTER (WHERE origin='automatic') < a.automatic_operation_limit
     AND a.deadline > now() AS again FROM ...`,
)
if (rows[0].again && outcome.retryable) await insertPendingOperation(...)
else await db().query(`UPDATE ai_assignments SET status='needs_attention' ...`)
```

**In the AI module.** `nextStep` and the cost rules ([`operation-cost.ts`](../../modules/ai/domain/operation-cost.ts), [`request-size.ts`](../../modules/ai/domain/request-size.ts)) were pure already but lived among the operations; they moved to `domain/`, and `nextStep` got a [unit test](../../modules/ai/domain/next-step.test.ts) of every branch that needs no database.

### 3. An entry point translates, the operation decides

**Rule.** An HTTP route, a queue handler, a step of the periodic process and a CLI command turn their input into the command of one public operation and its result into their answer. They hold no rule of the module. The binding rules state the operation's side of this: [a module operation carries the whole use case](moduly-i-zasady-kodu.md#a-module-operation-carries-the-whole-use-case).

**Why.** The owner can reject an assignment from the panel today, and a script or a job may do it tomorrow. A rule kept in the route holds only for requests that come through the route.

**Apply when.** Always. What an entry point may decide is what belongs to its own technology: the shape of the request, the status code, the retry settings of its queue.

**Example.** The route of the owner's Reject knows HTTP and nothing about statuses:

```ts
// server/api/ai-assignments/[id]/reject.post.ts
export default apiHandler(async (event) => {
  const outcome = await rejectAssignment(getRouterParam(event, 'id') ?? '')
  if (!outcome)
    throw createError({ statusCode: 404, statusMessage: 'Assignment not found' })
  return outcome
})
```

The [AI module plugin](../../plugins/ai.ts) does the same for the queue (`runOperation`) and the [periodic steps](../../periodic/steps.ts) for the clock.

**Anti-example** (invented). The route checks the status itself, so the check is missing for every other caller:

```ts
export default apiHandler(async (event) => {
  const assignment = await readAssignmentDetails(id)
  if (assignment.status === 'succeeded' || assignment.status === 'failed')
    throw createError({ statusCode: 409 })
  await db().query(`UPDATE ai_assignments SET status='failed' WHERE id=$1`, [id])
})
```

**In the AI module.** Nothing changed: its routes, plugin and periodic steps already only translate.

## Domain-Driven Design

### 4. A rule has one owner

**Rule.** Whether a change of state is allowed is written once. Every place that needs the answer, a view that offers a button and the operation that carries the action out, asks the same owner.

**Why.** Two copies agree on the day they are written. After the next change the panel offers an action that does nothing, or hides one that would work, and no test fails, because each copy passes its own test. The binding rules name the general cost: [a fixed list with two owners](moduly-i-zasady-kodu.md#costs-of-design-decisions).

**Apply when.** A rule is evaluated for one aggregate that is already loaded: write it as a domain function ([rule 2](#2-facts-in-decision-out)) and let the write follow the decision. When a rule selects a set of rows, such as "every assignment past its time limit", it stays in the repository's query, and then the query is its only owner: the operation does not restate it. A write that follows a decision is made under the lock the decision was read under ([rule 5](#5-an-aggregate-changes-through-its-root-and-is-known-outside-by-its-identifier)), so it need not state the rule again. A write may keep a guard on the one state the decision started from (`WHERE status='in_progress'`), so that a write which lost a race changes nothing; a guard that spells out the whole rule, a list of statuses or a deadline, is the second owner.

**Example.** One function says which actions the owner may take. The panel offers the buttons by it, and Retry and Reject decide by it:

```ts
// modules/ai/domain/assignment.ts
export function ownerActions(assignment: {
  status: AssignmentStatus
  withinTimeLimit: boolean
}): { retry: boolean; reject: boolean } {
  return {
    retry: assignment.status === 'needs_attention' && assignment.withinTimeLimit,
    reject: !isFinal(assignment.status),
  }
}

// modules/ai/assignments/retry-assignment.ts
const assignment = await lockAssignment(assignmentId, now)
if (!assignment) return null
if (!ownerActions(assignment).retry)
  return { changed: false, status: assignment.status }
await saveRetried(assignmentId)
```

**Anti-example.** Before the pull request the rule existed twice: in TypeScript for the panel and in SQL for the action.

```ts
// modules/ai/domain/panel.ts, before: what the panel offers
retry: assignment.status === 'needs_attention' && (assignment.timeLeftSeconds ?? 0) > 0,
reject: assignment.status === 'in_progress' || assignment.status === 'needs_attention',

// modules/ai/infrastructure/persistence/assignments.ts, before: what takes effect
`UPDATE ai_assignments SET status='in_progress'
 WHERE id=$1 AND status='needs_attention' AND deadline>$2`
`UPDATE ai_assignments SET status='failed',failure_reason='rejected',finished_at=$2
 WHERE id=$1 AND status IN ('in_progress','needs_attention')`
```

**In the AI module.** [`ownerActions`](../../modules/ai/domain/assignment.ts) became the owner. The panel's `assignmentActions` calls it, [`retryAssignment`](../../modules/ai/assignments/retry-assignment.ts) and [`rejectAssignment`](../../modules/ai/assignments/reject-assignment.ts) call it with the status and the deadline read under the row lock, and the two writes lost their copies of the rule. The rule of the time limit stays where it was, in one SQL condition used by both the selection and the write, and the module's other writes keep their guard on `in_progress`.

### 5. An aggregate changes through its root and is known outside by its identifier

**Rule.** The data that must stay consistent together forms one aggregate. An operation that changes it locks the root's row, decides from what it read under the lock, and saves every part of the change in the same transaction. Code outside the module keeps the aggregate's identifier and asks the owner; it keeps no copy of its state. The binding rules give the definition: [an aggregate protects state that must change together](moduly-i-zasady-kodu.md#an-aggregate-protects-state-that-must-change-together).

**Why.** An assignment and its operations make sense only together: an assignment in progress always has work under way, an operation that waits, runs or holds a result to deliver. Two writers that each change a part can leave an assignment in progress with nothing under way, which the owner sees as work that never ends.

**Apply when.** A condition spans several rows or tables of one module and must hold after every change. Keep the aggregate as small as that condition needs: the exchange with the provider is read separately and is not locked with the assignment.

**Example.** The owner's Retry locks the assignment, and its three writes, the status, the new operation and the operation's job, commit or roll back together:

```ts
// modules/ai/assignments/retry-assignment.ts
return transaction(async () => {
  const assignment = await lockAssignment(assignmentId, now) // SELECT … FOR UPDATE
  if (!assignment) return null
  if (!ownerActions(assignment).retry)
    return { changed: false, status: assignment.status }
  await saveRetried(assignmentId)
  await addOperation(assignmentId, await readAssignmentOperations(assignmentId), 'manual')
  return { changed: true, status: 'in_progress' }
})
```

Matching keeps only the assignment's identifier with its assessment request and learns of the end through its receiver ([rule 10](#10-a-port-another-module-implements-turns-the-dependency-around)).

**Anti-example** (invented). A requesting module copies the status and acts on the copy, and another path changes an operation without the assignment's lock:

```ts
// in Matching: a stored copy that goes out of date
await db().query(`UPDATE matching_requests SET ai_status=$2 WHERE id=$1`, [id, status])

// in a script: an operation changed outside assignment handling
await db().query(`UPDATE ai_operations SET state='failed' WHERE id=$1`, [operationId])
```

**In the AI module.** The boundary was already in place. The pull request made the lock give the facts the decision needs ([`lockAssignment`](../../modules/ai/infrastructure/persistence/assignments.ts) returns the status and whether the deadline is still ahead), so the decision and the write share one lock.

### 6. One name per concept, with one home

**Rule.** A concept has the name the [glossary](../../GLOSSARY.md) gives it, one definition in `domain/`, and every file imports it from there. The binding coding rules ask for [names based on the glossary](moduly-i-zasady-kodu.md#coding-rules); this rule adds the single home.

**Why.** A second name hides that two pieces of code speak of the same thing: a search for "price list" misses the type called a configuration. A second definition lets the two drift apart.

**Apply when.** Always for a concept the glossary names or the owner sees. Leave an alias only at a boundary that translates on purpose, such as an adapter mapping a provider's word to the module's.

**Example.**

```ts
// modules/ai/domain/price-list.ts: the glossary's "price list"
export type PriceList = { model: string; version: string; inputUsdPerMillion: string /* … */ }

// modules/ai/domain/assignment.ts: one definition of the failure reason
export type AssignmentFailureReason = 'rejected' | 'time_limit' | 'delivery_failed'
```

**Anti-example.** Before the pull request the price list had two names and two homes, and the failure reason was defined in the panel's read object and renamed in the repository:

```ts
// modules/ai/model-catalog.ts, before
export type AiConfiguration = { model: string; version: string /* … */ }
// modules/ai/executors/declaration.ts, before
export type PriceList = AiConfiguration

// modules/ai/infrastructure/persistence/assignments.ts, before
export type FailureReason = AssignmentFailureReason
```

**In the AI module.** `AiConfiguration` became `PriceList` in `domain/price-list.ts`; the alias `FailureReason` and the re-exports of the operation states through the panel were removed; the frozen content of an assignment got one name, `AssignmentContent`.

### 7. A value with rules has one owner of its representation

**Rule.** A value that has its own rules of validity, comparison or arithmetic is a value object: one file creates it, checks it and calculates with it, and the rest of the code passes it on whole. The binding rules define the pattern: [a value object groups data that share a meaning](moduly-i-zasady-kodu.md#a-value-object-groups-data-that-share-a-meaning).

**Why.** Money in this module is a decimal string with six places, calculated in whole millionths and always rounded up. A file that writes such a string by hand, or adds two amounts as numbers, silently departs from the rounding the budget relies on.

**Apply when.** The same checks or conversions would otherwise be repeated wherever the value is used. Leave a plain primitive when the value has no rule of its own, such as a label the module never interprets.

**Example.** The amounts are written and read only through [`domain/money.ts`](../../modules/ai/domain/money.ts):

```ts
// modules/ai/domain/operation-cost.ts
export function potentialCost(priceList: PriceList | null): string {
  return priceList === null ? money(0n) : attemptCeiling(priceList)
}
```

**Anti-example.** Before the pull request the same function knew how a zero amount is spelled:

```ts
return priceList === null ? '0.000000' : attemptCeiling(priceList)
```

**In the AI module.** The two hand-written zero amounts in the cost rules now come from `money`.

## Hexagonal Architecture

### 8. A port belongs to the inside, an adapter to the outside

**Rule.** A port is a contract written in the module's own terms. It lives in `ports/` and refers only to the domain. Each adapter is a submodule of `infrastructure/adapters/` that implements it. One file, `infrastructure/adapters/registry.ts`, assembles the adapters; operations ask the registry and import no adapter. The binding rules give the pattern: [interchangeable executors use a shared contract](moduly-i-zasady-kodu.md#interchangeable-executors-use-a-shared-contract).

**Why.** The contract says what the module needs, so it must not change when a provider does. A contract kept among the adapters reads as theirs, picks up their vocabulary, and makes every operation import from the technology's directory.

**Apply when.** The module has a port, see [rule 9](#9-add-a-port-only-where-the-outside-varies-or-is-not-yours) for when it should. The registry is the place where the choice of implementation is made; in a test it is also where a simulated adapter replaces a real one.

**Example.**

```text
modules/ai/
├── ports/executor.ts                  the executor contract
└── infrastructure/adapters/
    ├── registry.ts                    openai and ollama by name
    ├── openai/                        the paid executor
    └── ollama/                        the local executor
```

```ts
// modules/ai/assignments/carry-out-operation.ts
import type { ExecutorOutcome } from '../ports/executor.ts'
import { findExecutor } from '../infrastructure/adapters/registry.ts'

const executor = findExecutor(operation.executor)
return executor.carryOut({ content, parameters, state, exchange, saveState })
```

**Anti-example.** Before the pull request the contract lay beside its implementations in `executors/`, and it took its price list from the configuration. An invented step further shows what that layout invites:

```ts
// modules/ai/executors/declaration.ts, before: the contract among the adapters
import type { AiConfiguration } from '../model-catalog.ts'

// invented: an operation that picks the technology itself
import { openAiExecutor } from '../executors/openai.ts'
const outcome = await openAiExecutor().carryOut(work)
```

**In the AI module.** The executor contract moved to [`ports/executor.ts`](../../modules/ai/ports/executor.ts) and the receiver contract to [`ports/assignment-receiver.ts`](../../modules/ai/ports/assignment-receiver.ts). The executors moved to [`infrastructure/adapters/openai/`](../../modules/ai/infrastructure/adapters/openai/) and [`infrastructure/adapters/ollama/`](../../modules/ai/infrastructure/adapters/ollama/), with the catalog and configuration only they read, and the registry to [`infrastructure/adapters/registry.ts`](../../modules/ai/infrastructure/adapters/registry.ts). The boundary test rejects an operation that imports any other file of the adapters.

### 9. Add a port only where the outside varies or is not yours

**Rule.** A contract in `ports/` is written when at least one of three conditions holds: two implementations exist or are being built; the implementation belongs to another module; or the outside is paid or uncontrollable and tests must replace it. Otherwise the operation calls the function its adapter or repository exports, and that function's signature, written in the module's terms, is the contract.

**Why.** A port costs a type, a registry and an indirection on every reading of the code. Where nothing varies it is [a feature without a consumer](moduly-i-zasady-kodu.md#costs-of-design-decisions): nothing checks that the abstraction fits the second case, which usually needs a different one.

**Apply when.** Check the three conditions when adding an integration, and again when a second implementation appears: that is the moment to extract the port, with two real cases to shape it. The module's own database gets no port. The repositories are called directly, the [database access rules](moduly-i-zasady-kodu.md#database-access) give the shared transaction, and tests run on a real PostgreSQL in an isolated schema, so no second implementation exists or is planned. This is the one outward import the [layers](#the-layers-of-a-module) allow.

**Example.** The AI module has two ports and both meet a condition: executors come in two implementations and are paid, and receivers are implemented by other modules. Its repositories have none:

```ts
// modules/ai/assignments/reject-assignment.ts: a repository called directly
import { lockAssignment, saveRejected } from '../infrastructure/persistence/assignments.ts'
```

The Profile module places its assignments through a single adapter, [`proposal-ai.ts`](../../modules/profile/infrastructure/adapters/proposal-ai.ts), whose exported functions (`placeProposalAssignment(label, text)`) speak the Profile's language; it has no port, and needs none until a second way of preparing a proposal appears.

**Anti-example** (invented). A repository contract with one implementation and a second written only for tests, which then test the copy and not the queries:

```ts
export type AssignmentRepository = {
  lock(id: string): Promise<LockedAssignment | null>
  saveRejected(id: string, at: Date): Promise<void>
}
export const postgresAssignments: AssignmentRepository = { /* … */ }
export const inMemoryAssignments: AssignmentRepository = { /* … */ }
```

**In the AI module.** Nothing was added: the module keeps its two ports and its direct repositories. The rule is recorded so that the layout of rule 8 is not copied to places that have nothing to vary.

### 10. A port another module implements turns the dependency around

**Rule.** When a module must tell other modules about something, it defines the contract of the listener in its `ports/` and exports it. Each other module implements the contract in its own `infrastructure/adapters/`, and a composition file outside the modules connects them. The module that defines the contract imports none of its listeners.

**Why.** The AI module ends assignments of the Profile, Matching and Companies. If it called them by name, every new requesting module would be a change of the AI module, and the modules would import each other in a circle.

**Apply when.** The direction of the call is opposite to the direction of knowledge: the lower module calls, the higher one knows what the call means. When the caller already depends on the module it calls, a plain call of its public operation is enough.

**Example.** The AI module defines the receiver, a requesting module implements it, and [`receivers/index.ts`](../../receivers/index.ts) registers each one at the start of every process:

```ts
// modules/ai/ports/assignment-receiver.ts
export type AssignmentReceiver = {
  receiveResult(delivery: AssignmentResultDelivery): Promise<void>
  receiveFailure(delivery: AssignmentFailureDelivery): Promise<void>
}

// modules/profile/infrastructure/adapters/proposal-ai.ts
export const proposalAssignmentReceiver: AssignmentReceiver = {
  async receiveResult({ assignmentId, result }) {
    await takeAssignmentResult(assignmentId, result)
  },
  async receiveFailure({ assignmentId }) {
    await endAssignmentPreparation(assignmentId)
  },
}

// receivers/index.ts
registerAssignmentReceiver(proposalSettingsKey, proposalAssignmentReceiver)
```

**Anti-example** (invented). The AI module knows who asked and calls back by name:

```ts
// modules/ai/assignments/deliver-result.ts
import { takeAssignmentResult } from '../../profile/index.ts'
import { publishAssessment } from '../../matching/index.ts'

if (delivery.settingsName === 'profile') await takeAssignmentResult(id, result)
else if (delivery.settingsName === 'matching') await publishAssessment(id, result)
```

**In the AI module.** The contract was already the module's and already exported. The pull request separated it from the registration: the types are in `ports/assignment-receiver.ts`, and the in-process registration stays with the operations in [`assignments/assignment-receiver.ts`](../../modules/ai/assignments/assignment-receiver.ts).

## The adapter's side of the contract

One rule of Hexagonal Architecture is already binding and is listed here only so that the picture is complete: an adapter translates at the edge. It turns the events of its technology into the module's closed lists, and nothing of the technology crosses the port. The binding rules state it for [interchangeable executors](moduly-i-zasady-kodu.md#interchangeable-executors-use-a-shared-contract) and for [external data](moduly-i-zasady-kodu.md#we-translate-external-data-at-the-integration). In the AI module the paid executor decides alone that a refusal in OpenAI's answer is a non-retryable failure with the cause `refused`, and assignment handling reads only the outcome:

```ts
// modules/ai/infrastructure/adapters/openai/openai-single.ts
if (refused(value.output))
  return { kind: 'failed', retryable: false, cause: 'refused', usage: run.meter.usage() }
```

The anti-example is assignment handling that asks which executor ran or what HTTP status came back.

## Checklist for a change

Use it when designing a change inside a module and when reviewing one.

1. Does every new or moved file sit in the layer its content belongs to, and import only inward? (Rule 1)
2. Is each new decision a function of facts in `domain/`, with a unit test of its branches? (Rule 2)
3. Do the entry points the change touches only translate? (Rule 3)
4. Is each condition on a change of state written once, and do the view and the operation ask the same owner? (Rule 4)
5. Does an operation that changes several rows lock the root and save everything in one transaction? (Rule 5)
6. Does each new name come from the glossary, with one definition? (Rule 6)
7. Is each value with rules created and calculated in one file? (Rule 7)
8. For a new integration: is a port warranted by rule 9? If so, is it in `ports/`, its adapter a submodule, the registry the only file operations import? If not, does the adapter's exported function speak the module's language? (Rules 8, 9)
9. Does a module that notifies others own the listener's contract and import no listener? (Rule 10)

## Conclusion

Inside a module the three approaches reduce to a few habits: the domain names the concepts and decides, an operation gathers the facts and carries the decision out under one lock, and the technology sits at the edge behind a contract only where something there can vary. The AI module shows each habit in running code, and the boundary test keeps its imports pointing inward. A change in another module applies the same rules to the code it creates or moves, and adds the module to the test once nothing in it points outward.
