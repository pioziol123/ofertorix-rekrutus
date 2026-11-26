# Applications list — solution design

Epic `oferty-pracy-lq3`. Goal: [PRD](PRD.md). Behaviour and criteria: [requirements](requirements.md). The [architecture rules](../../architecture/moduly-i-zasady-kodu.md) bind every task. Decisions D1–D10 were walked with the owner on 26 November 2026; the contracts below are agreed constraints, and names of tables, routes and fields are illustrative unless a contract says otherwise.

## Responsibilities

- **The Recruitments module** (new) owns the application, the closed list of stages, the transition table, the note and the history of stages. Its stage list, Polish labels and the function that lists the stages allowed from a stage are part of its browser-safe view entry; every other place reads them from there (D10). It knows no other module.
- **The Offers module** owns the existence of offers. It mediates the first move of an offer, which creates the application (D5), reads the current stages for the offer list (D3) and gives a bulk read of offers by IDs for the pages of the Recruitments module (D4).
- **Pages** assemble data from both modules by offer ID. Later moves and the note go from the pages straight to the Recruitments module.

Dependencies run one way: Offers → Recruitments. The Recruitments module imports neither Offers nor Sources (D7).

## Decisions

| ID | Decision | Discarded options |
| --- | --- | --- |
| D1 | The application row holds the current stage and its moment; one operation changes them and appends the history record in one transaction. | Deriving the current stage from the latest history record: the owner did not want list reads to touch the history. |
| D2 | The history of stages is read only for display (T2-R11); no rule reads it. | A stored "stage before rejection": replaced by the owner's choice of the stage when leaving "Odrzucone" (A-R03). |
| D3 | The offer list reads the current stage of every application in one query, without passing offer IDs. | Passing the IDs of the whole catalogue: a larger parameter without benefit, since applications are far fewer than offers. Reading only the shown page: the stage filter applies before counting and paging (T3-R04). |
| D4 | Moja lista and the application details join, on the page, a read of the Recruitments module with a bulk read of the Offers module by offer IDs. | — |
| D5 | The first move of an offer goes through a command of the Offers module, which checks the offer exists and calls the Recruitments module's create operation in the same transaction. Every later move and the note go to the Recruitments module directly. | The Offers module performing every move: it would write data it does not own, and the transition table would have two owners. |
| D6 | Choosing the current stage again counts as done (A-R13). | Refusing it with the stale-page message: misleading after a retry. A command ID with a stored result, as the Companies module does: an extra table for a result that is the same anyway. Reason by the agent, accepted by the owner. |
| D7 | The existence of the offer is checked by the Offers module before it calls create (D5); the Recruitments module trusts its caller for it. | The Recruitments module checking through the Sources module: an unneeded dependency (owner). Checking through the Offers module's read: a cycle of reads between the two modules. |
| D8 | The paging of the page "Synchronizacje" (task `oferty-pracy-nq3.1`) becomes one shared element used by both pages. | A copy on Moja lista: two copies of one pattern (owner, T2-R08). |
| D9 | The stage filter of the offer list uses the multi-choice element of the page "Synchronizacje". | A filter element of its own: a second pattern for the same thing (owner, T3-R03). |
| D10 | Stages, labels and the allowed-transitions function live only in the Recruitments module; the server checks every move again. | — |

Accepted costs: the note keeps no history (A-R09); the offer list keeps filtering its whole catalogue in memory, at most 10 000 ads (Observed in the Offers module), and the stage read adds at most one row per offer to it.

## Storage

One forward-only migration in raw SQL, following the existing ones (node-pg-migrate, tables in the public schema prefixed by module, enums as `text` with a `CHECK`, UUIDs generated in the application, moments as `timestamptz` in UTC):

- **Applications:** `id uuid` primary key, `offer_id uuid NOT NULL UNIQUE` (today the ad ID; no foreign key, D7), `stage text NOT NULL CHECK (stage IN ('to_consider','cv_sent','rejected','removed'))`, `stage_changed_at timestamptz NOT NULL`, `note text NOT NULL DEFAULT ''`.
- **Stage changes:** `id uuid` primary key, `application_id uuid NOT NULL` referencing applications, `stage text NOT NULL` with the same check, `changed_at timestamptz NOT NULL`; index on `(application_id, changed_at)`. Rows are only inserted.
- Index on applications `(stage, stage_changed_at DESC, id DESC)` for Moja lista.

The stage values above are the stored contract; the labels of A-R02 map to them in the view entry.

## Operations and contracts

### Recruitments module

All commands run in one transaction (shared transaction mechanism; a call inside a running transaction joins it). The moment of a move is the database's `now()` of that transaction, so the application row and the history record carry the same moment.

1. **Create application** (client: the Offers command of D5). Input: offer ID, target stage. The target must be allowed from "no application" (A-R03). `INSERT … ON CONFLICT (offer_id) DO NOTHING`; when a row was inserted, append the history record and return the stage. When the offer already has an application: its stage equal to the target returns success without a write (A-R13); otherwise a conflict (A-R07).
2. **Move application** (client: pages). Input: offer ID, expected stage (one of the four), target stage. A pair outside A-R03 is invalid input. `UPDATE … SET stage = target, stage_changed_at = now() WHERE offer_id = $1 AND stage = expected RETURNING`; on a row, append the history record. Without a row: no application → not found; current stage equal to the target → success without a write (A-R13); otherwise a conflict (A-R07). A conditional update needs no row lock.
3. **Save note** (client: application details). Input: offer ID, text. More than 10 000 characters, counted as Unicode code points, is invalid input with the message of A-R10. `UPDATE … SET note` without touching the stage or its moment; no row → not found (A-AC07). The last save wins (A-R11).
4. **Current stages** (client: Offers list, D3). No input. Returns offer ID → stage for every application, `removed` included.
5. **Application details** (client: offer details and application details). Input: offer ID. Returns stage, stage moment, note and the history newest first (`changed_at DESC, id DESC`), or nothing.
6. **Applications page** (client: Moja lista). Input: stage choice `active` (default) | `all` | `to_consider` | `cv_sent` | `rejected`, page, size (10, 20, 50, 100; default 20). Unknown values become defaults; the page is clamped as T2-R06 says. `active` = `to_consider`, `cv_sent`; `all` = every stage but `removed`. Order `stage_changed_at DESC, id DESC`. Returns items (offer ID, stage, stage moment), total, page, size and the normalised choice.

Errors are the module's own classes; the routes map conflict → 409 with the message of A-R07, not found → 404, invalid input → 422, through a handler of the module as the Companies module does.

### Offers module

1. **Start application** (client: offer details). Input: offer ID, target stage. Checks the offer exists in its catalogue (not found → 404), then calls create application in the same transaction and returns its result.
2. **Offers by IDs** (client: Moja lista and application details, D4). Input: up to 100 offer IDs. Returns for each existing one: ID, title, company, salary, availability at the source. Missing IDs are left out.
3. **Offer list.** Before filtering, attaches the stage of each offer from current stages (no stage for an offer without an application). The filter type gets `stages`: a set of `none`, `to_consider`, `cv_sent`, `rejected`, `removed`, read from the query key `stage`, repeated or comma-separated as on the page "Synchronizacje"; unknown values are left out (T3-R05). An offer passes when the set is empty or holds its stage, `none` standing for no application. The filter runs with the others, before sorting, counting and paging. Each list item carries its stage.

The salary label that the offer list builds on its page moves into the Offers view entry, so the application details show the same text (T2-R09).

### Pages

- **Offer details** read the application details by offer ID and show the stage field (A-R04, T1-R01). A choice from "Poza listą" calls start application; any other calls move application with the shown stage as expected. Offer details show no note (A-R12). The link "Szczegóły aplikacji" (T2-R12) opens Moja lista with the offer ID in the address.
- **Moja lista** reads the applications page, then offers by IDs of its items, and joins them by offer ID. An item whose offer is missing from the answer shows its stage only. Address keys: `stage`, `page`, `size`, `offer` (the open details); keys equal to their default are left out, and a changed choice or size removes `page`.
- **Application details** (drawer) read the application details and offers by ID for the one offer; a choice calls move application; "Zapisz notatkę" calls save note. After a successful move the page reads the details and the list page again.
- **Offer list** shows the icon of T3-R01 from each item's stage and the stage filter of T3-R03.
- Dates follow the Polish time library and the architecture rules' Polish time section: the date of T2-R02 as DD.MM.RRRR, the history as DD.MM.RRRR HH:mm.
- Navigation: each page's header gets the link "Moja lista".

## Situations every operation answers

| Operation | Concurrent call | Resource limit | Repeated call | Empty or malformed input |
| --- | --- | --- | --- | --- |
| Start / create | Two creates of one offer: the unique offer ID lets one insert; the other follows the rule for an existing application | One row | Same target: success without a write | Unknown offer → 404; target not allowed from "no application" → 422 |
| Move | Conditional update; the loser gets a conflict or, with the same target, success | One row and one history record | Success without a write | Unknown stage or pair outside A-R03 → 422; no application → 404 |
| Save note | Last save wins | 10 000 code points; request body limit of the HTTP layer | Same text written again | Over the limit → 422 with the A-R10 message; no application → 404 |
| Current stages | Reads committed state | At most one row per offer of the catalogue | Same answer for same state | — |
| Applications page | Reads committed state | At most 100 items | Same answer for same state | Unknown values → defaults; page clamped |
| Offers by IDs | Reads committed state | At most 100 IDs; more → 422 | Same answer | Malformed IDs → 422 |
| Application details | Reads committed state | All history records of one application | Same answer | Malformed ID → 404 |

## Rollout

One migration, no backfill, no external service. Task order: T1; then T2 after T1 and `oferty-pracy-nq3.1`; T3 after T1 and `oferty-pracy-nq3.1`. The module joins the explicit list of modules in the module-boundaries test and gets a row in the module map and a module README.

## Verification

- **T1:** integration tests on an isolated database for create and move (every allowed and refused pair, A-R13, A-R07, restart with a new pool, independence from ad and assessment changes); a unit test of the allowed-transitions function; route tests on a running server for T1-AC02 and T1-AC03; rendering test of offer details for T1-AC01.
- **T2:** integration tests of save note, applications page and application details; unit tests of the address logic and the shown dates; rendering tests of the page, the drawer and the navigation; the existing sync history paging tests stay green.
- **T3:** unit tests of filter parsing and filtering with stages; rendering test of the icons; an integration test counting the offer list's queries with 0, 1 and 50 applications.

The sandbox has no browser (as for epic `oferty-pracy-nq3`): rendering tests request the page from the running server and read its HTML, or test the function that produces the shown text.

## Risks

- **Grouping of offers.** Applications point at ad IDs. When the Offers module starts grouping ads, applications must move to the grouped offer, and start application must check the grouped offer.
- **Dependency on `oferty-pracy-nq3.1`.** Its paging and multi-choice elements are not in `main` yet; T2 and T3 wait for them.
