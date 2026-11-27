# Playbook: building a module with a protected domain

This playbook tells an implementing agent how to build one business module so that its business rules
live in plain code, every refusal has a name, and the module's boundaries are enforced by a test. It was
extracted from an Invoices module (Laravel, PHP) that a cold reviewer rated senior level; the examples
use that module, and every step is stated so it carries to another domain and another stack. Follow the
steps in order. Each ends on a condition you can check; move on only when it holds.

Vocabulary used throughout:

- **Aggregate** — the business object the module is about (here: the invoice), with the rules that keep
  it valid.
- **Refusal** — the aggregate or a use case saying no to an operation, as a named exception.
- **Use case** — one thing a caller can ask the module to do (create, send, confirm delivery).
- **Port** — an interface the module owns for something it needs from outside (send a notification).
- **Adapter** — the class that implements a port, or receives an outside event, using a framework or
  another module.
- **Edge** — everything that touches a framework, a database or another module.

## Step 0 — Check the fit

Use this design when the task states rules about what may happen to an object and when ("only a draft
can be sent", "status changes after delivery"). For plain storage with field validation and no state
rules, use the host framework's ordinary way and stop here.

Done when: you can name at least one state rule and one operation that it can refuse.

## Step 1 — Sort every requirement sentence

Split the task text into single sentences. Give each an identifier and exactly one type:

| Type | Test | Lands in |
| --- | --- | --- |
| Rule of the aggregate | True whatever the database, protocol or framework is | Domain |
| Orchestration | Says what happens in which order across the aggregate and the outside | Application |
| Edge | Names a protocol, a format, storage, or another module | Infrastructure |
| Process | About documentation, running, testing | Your report |

When a sentence can be read two ways, write both readings, pick one, and record the rejected one with
the reason. A reading that changes what a caller of the API sees is an **owner decision**: implement
your pick, and list it in the report.

Done when: every sentence has a row; every ambiguous one has a chosen and a rejected reading.

## Step 2 — Lay out the module

```
<Module>/
  Domain/
    <Aggregate>            the aggregate
    ValueObjects/          small immutable values, valid by construction
    Enums/                 statuses
    Exceptions/            refusals and "not found"
    Repositories/          the repository interface
  Application/
    <UseCaseName>/         one folder per use case: the use case class and its input types
    Ports/                 interfaces for what the module needs from outside
    Views/                 read-only results handed to callers
    Exceptions/            failures of the outside, in the module's words
  Infrastructure/
    Http/                  controller, request validation, JSON shape, error table, routes
    Persistence/           repository implementation and row models
    <OtherModule>/         one folder per outside module: port adapter and event listener
    Providers/             wiring: interface to implementation, event to listener
```

Dependency rules. Each becomes one test in Step 8.

| # | Rule | Reason |
| --- | --- | --- |
| B1 | Domain references only itself and the language | Rules stay readable and testable without the framework |
| B2 | Application references only Domain, itself and a logging interface | Use cases orchestrate; everything else is behind a port |
| B3 | Only `Infrastructure/<OtherModule>` references that module, and only its published API | One seam per neighbour; the neighbour's internals are its own |
| B4 | `Infrastructure/Http` references no other part of Infrastructure | HTTP talks to use cases, never to the database |
| B5 | `Infrastructure/Http` references Domain only through `Domain/Exceptions` | HTTP is handed views and translates refusals; it never holds the aggregate |
| B6 | The neighbour module does not reference this module | The dependency runs one way |

Done when: the folders exist and you can say, for each planned class, which rule row allows its imports.

## Step 3 — Write the domain, test first

Write each rule's test before its code. Domain tests construct objects directly and use no framework
test case, container or database.

**Value objects** check their own validity in the constructor and are immutable. A value that exists is
valid, so nothing downstream re-checks it.

**The aggregate** has this shape:

```php
final class Invoice
{
    private function __construct(/* id, customer, status, lines */) { /* invariants over the whole */ }

    public static function create(InvoiceId $id, Customer $c, ProductLine ...$lines): self   // new: always Draft
    public static function reconstitute(InvoiceId $id, Customer $c, StatusEnum $s, ProductLine ...$lines): self  // from storage

    public function send(): void                 // checks the rule, then changes status, else throws a refusal
    public function markAsSentToClient(): void

    public function totalPrice(): int            // derived values are computed here
    public function status(): StatusEnum         // getters only; state changes only through the verbs above
}
```

- The constructor is private. `create` is the only way to make a new one and fixes the starting state;
  `reconstitute` is for repository implementations only and runs the same invariants.
- State changes only through methods named with the task's own verbs. Each checks its rule first.
- Identifiers are generated by the module, never taken from the caller.

**Refusals** are one exception class per refused operation, with one named constructor per reason and a
machine-readable `reason`:

```php
final class InvoiceCannotBeSent extends DomainException
{
    public const string REASON_NOT_DRAFT = 'invoice_not_draft';
    public const string REASON_NO_PRODUCT_LINES = 'invoice_has_no_product_lines';

    public static function becauseItIsNotADraft(InvoiceId $id, StatusEnum $current): self
    public static function becauseItHasNoProductLines(InvoiceId $id): self
}
```

Messages name the broken rule and never echo the refused value, so the edge can show them safely.

Done when: every "Rule of the aggregate" sentence from Step 1 has one domain test that fails when you
break the rule in code (break it, watch the test fail, restore); B1 holds.

## Step 4 — Define the repository as a contract

```php
interface InvoiceRepository
{
    public function add(Invoice $invoice): void;          // all of it or nothing
    public function find(InvoiceId $id): ?Invoice;        // a plain read; decide nothing on it
    public function update(InvoiceId $id, Closure $change, ?Closure $onceStored = null): Invoice;
}
```

`update` is the only way to change a stored aggregate, and reading, changing and storing are one call:

- **Exclusive** — `$change` receives the aggregate as stored, and nobody else can change it until the
  update ends. This is what stops two simultaneous requests from both finding a draft.
- **Atomic** — if either closure throws, nothing is kept and the exception passes through unchanged.
- **`$onceStored`** runs after the change is stored and while it can still be undone. A side effect that
  must succeed for the change to stand goes here.
- Returns the aggregate as stored when the update ends; throws "not found" without calling a closure.

Write the contract's tests once, as a reusable set (a trait or abstract test class) that takes "give me
a repository". Run that set against two implementations: an in-memory one, written now for the use case
tests, and the real one in Step 6.

Done when: the in-memory repository passes the whole contract set.

## Step 5 — Write the use cases

One class per use case, one public method. Plain values in, a View out. Tests use the in-memory
repository and a hand-written fake of each port.

```php
final readonly class SendInvoice
{
    public function __construct(private InvoiceRepository $invoices, private InvoiceNotifier $notifier) {}

    public function handle(string $invoiceId): InvoiceView
    {
        $id = InvoiceId::tryFromString($invoiceId) ?? throw InvoiceNotFound::becauseTheIdIsMalformed();

        $invoice = $this->invoices->update(
            $id,
            static function (Invoice $invoice): void { $invoice->send(); },                       // rule first
            function (Invoice $invoice): void { $this->notifier->notifyCustomer($invoice->id(), $invoice->customer()); },
        );

        return InvoiceView::fromInvoice($invoice);
    }
}
```

- A use case holds no rule of its own. It parses input, calls the aggregate's verb inside `update`, and
  calls ports. An identifier that cannot be parsed is "not found".
- **Order inside `update`:** the rule check and state change first, the outside call second. A refused
  operation then causes no side effect, and a failed side effect undoes the state change.
- **A port** is named in the module's language (`InvoiceNotifier::notifyCustomer`), takes domain values,
  and declares one failure exception defined in `Application/Exceptions`.
- **A View** is a flat read-only copy built from the aggregate. Callers never receive the aggregate.
- **An incoming confirmation** (webhook, event) is a use case too. It answers every state: the expected
  one applies the change; already applied does nothing; unknown identifier does nothing; a state that
  should be impossible logs a warning with the identifier only. Write this as an exhaustive `match`
  with one arm per state and no default arm, so a state added later fails loudly until it has an answer.

Putting an outside call inside `update` holds the lock for the call's duration and means a retry after a
half-failure can repeat the side effect. That is right for one synchronous call per operation. For more,
or for a slow provider, raise it as an owner decision and name the alternative (store the intent, send
from a queue).

Done when: every "Orchestration" sentence has one use case test; a test proves that a failing port
leaves the stored aggregate unchanged and that the retry succeeds; B2 holds.

## Step 6 — Build the edge

**Persistence.** Row models carry columns only. The repository implementation maps rows to the aggregate
through `reconstitute` and back. `update` opens a transaction, reads the row with a write lock inside
it, runs `$change`, saves, runs `$onceStored`, and re-reads before returning if `$onceStored` ran. Rows
that no longer make a valid aggregate raise a technical error, never a domain refusal: the caller sent
nothing wrong. Run the Step 4 contract set against this implementation.

**Neighbour adapter.** `Infrastructure/<OtherModule>` holds the port implementation and the listener for
that module's events. It is the only place that imports the neighbour, and only its published API. The
port implementation converts every failure of the neighbour into the port's one exception, keeping the
cause as `previous`. The listener extracts plain values from the event and calls a use case.

**HTTP.**

- Request validation is the first net: types, required fields, size bounds, refusal of fields the caller
  may not set (identifier, status). The domain stays the final net.
- The controller maps the request to a use case call and the View to a response. It catches nothing.
- One error table maps each refusal to a status and a stable code. It is the only place that knows both:

| Refusal | Status | Code |
| --- | --- | --- |
| Not found, malformed identifier included | 404 | `invoice_not_found` |
| Operation refused by a state rule | 409 | one code per `reason` |
| Outside provider did not accept | 503 | `notification_failed` |
| Domain validity, missed by request validation | 422 | `invalid_invoice_data` |

  Map `reason` to code with an exhaustive `match` and no default arm. The client's code is a separate
  string from the domain's `reason`, so the domain can rename without breaking clients.
- The JSON shape is built from the View in its own class.

**Wiring** binds each interface to its implementation and each neighbour event to its listener, in one
provider.

Done when: the real repository passes the contract set; each row of the error table has one HTTP test;
one HTTP test walks the whole lifecycle through the neighbour's real entry point.

## Step 7 — Write the failure table

Before calling the work finished, list every way each operation can go wrong and what the caller then
sees and what is stored:

| Situation | Caller sees | Stored state | Proven by |
| --- | --- | --- | --- |
| Send, invoice is not a draft | 409 | unchanged | test name |
| Send, provider fails | 503 | still a draft, can be sent again | test name |
| Several sends at once | exactly one succeeds, the rest are refused; one email | sending | test name |
| Confirmation arrives twice | nothing | sent to client | test name |
| Provider accepted, storing then failed | 500 | draft, email is out | documented as a known gap |

Include at least: each refusal, the outside failing, the same request twice at once, the confirmation
arriving twice, early, or for an unknown identifier, and a crash between the side effect and the commit.
A row you cannot cover with code is written down as a known gap with its cost.

Done when: every row has a test name or the words "known gap" with one sentence on the consequence.

## Step 8 — Enforce the boundaries and trim

**Boundary test.** One test per rule B1–B6. It reads every source file under a folder, collects the
names it references (imports, fully qualified names, global helper calls), and fails with the rule, the
reason and the offending file. Add one guard: a rule that inspected zero files fails. Check each rule by
adding a forbidden import, watching it fail, and removing it.

**Simultaneous requests.** If Step 7 has a "twice at once" row, prove it with two real processes against
a real database. A single-process test cannot fail for the right reason.

**Trim to proportion.**

- One test per rule, at the lowest level that can prove it. A higher level keeps a test only for what
  the lower cannot see: wiring, the HTTP contract, transactions, the neighbour's real entry point.
  Two tests that would fail together for the same cause are one test; keep the one nearest the rule.
- Comments state what the code cannot: a reason, an order that matters, a known gap. Each reason is
  written once, in the class that owns it. Aim for comment lines at about a quarter of code lines.
- Delete branches for cases that cannot happen and methods nothing calls.
- Comments use plain words; identifiers from your own working notes stay in your notes.

Done when: the whole suite is green; all six boundary rules have been seen to fail on a planted
violation; for every test you can name the one rule or failure-table row it guards, and no two tests
share that answer at the same level. (The source module ended at about 2.4 lines of test per line of
code, test helpers included, after being cut down from over 3.)

## When the brief does not decide

Decide yourself when a caller of the module could not observe the difference. Otherwise pick the reading
that keeps stored data correct over the one that is more convenient, implement it so it can be changed
in one place, and report it as an owner decision.

## Report

1. The sentence table from Step 1 with the test that proves each row.
2. Owner decisions: what you chose, what you rejected, where to change it.
3. The failure table from Step 7.
4. Known gaps, each with its consequence for a user.
5. The test suite's summary line, copied verbatim, from a run you made after the last change.

## Conclusion

The design holds together through three things you can check without judgement: every rule sentence has
a test that fails when the rule is broken, every way to change stored state goes through one exclusive
and atomic repository call, and every boundary is a test that fails on a planted violation. If those
three hold and the failure table has no empty row, the module has the shape this playbook describes;
where one cannot be made to hold, say so in the report rather than working around it.
