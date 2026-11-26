# Applications list — solution design

Epic `oferty-pracy-lq3`. Goal: [PRD](PRD.md). Behaviour and criteria: [requirements](requirements.md). The [architecture rules](../../architecture/moduly-i-zasady-kodu.md) bind every task. Decisions D1–D11 were walked with the owner on 26 November 2026 and revised after the EGM review the same day ([report](../../research/lq3-egm-review/consolidated_review_report.md)). The contracts below are agreed constraints; names of tables, routes and fields are illustrative unless a contract says otherwise.

## Responsibilities

- **The Recruitments module** (new) owns the application, the closed list of stages, the transition table, the note and the history of stages. Its browser-safe view entry holds, as the one owner (D10, A-R14): the stored stage values, their Polish labels, the label "Bez aplikacji", each state's icon and colour (T2-R13, T3-R01), the function that lists the stages allowed from a state, and the messages of A-R07 and A-R10. Every other place imports them from there. It imports no other module.
- **The Offers module** owns the offers. It mediates the first move of an offer, which creates the application (D5), reads the current stages for the offer list (D3) and gives a bulk read of offers by IDs (D4). It imports the stage values from the Recruitments view entry.
- **Pages** assemble data from both modules by offer ID. Later moves and the note go from the pages straight to the Recruitments module.

Dependencies run one way: Offers → Recruitments.

## Decisions

| ID | Decision | Discarded options |
| --- | --- | --- |
| D1 | The application row holds the current stage and its stage moment; one operation changes them and appends the history record in one transaction. | Deriving the current stage from the latest history record: the owner did not want list reads to touch the history. |
| D2 | The history of stages is read only for display (T2-R11); no rule reads it. | A stored "stage before rejection": replaced by the owner's choice of the stage when leaving "Odrzucone" (A-R03). |
| D3 | The offer list reads the current stage of every application in one query, without passing offer IDs. | Passing the IDs of the whole catalogue: a larger parameter without benefit, since applications are far fewer than offers. Reading only the shown page: the stage filter applies before counting and paging (T3-R04). |
| D4 | Moja lista and the application details join, on the page, a read of the Recruitments module with a bulk read of the Offers module by offer IDs. | — |
| D5 | The first move of an offer goes through a command of the Offers module, which checks the offer exists and then calls the Recruitments module's create operation. Every later move and the note go to the Recruitments module directly. Reason: the dependency runs one way, Offers → Recruitments, so no cycle between the two modules arises, and the step that will check a grouped offer once grouping exists already sits in the Offers module (owner, Q54). Ads are never deleted today, so the check guards no race and needs no shared transaction. | The Offers module performing every move: it would write data it does not own, and the transition table would have two owners. |
| D6 | Choosing the current stage again counts as done (A-R13). | Refusing it with the stale-page message: misleading after a retry. A command ID with a stored result, as the Companies module does: an extra table for a result that is the same anyway. Reason by the agent, accepted by the owner. |
| D7 | The Recruitments module trusts its caller for the existence of the offer (D5). | The Recruitments module checking through the Sources module: an unneeded dependency (owner). Checking through the Offers module's read: a cycle of reads between the two modules. |
| D8 | Task T4 moves the paging of the page "Synchronizacje" into one shared element that both pages use. | A copy on Moja lista: two copies of one pattern (owner). Simpler elements of its own for the MVP, preferred by the reviewers: contradicts the owner's rule of one paging pattern (owner, Q51). Adding the move to task `oferty-pracy-nq3.1`, already in progress: none recorded. |
| D9 | Task T4 also moves the multi-choice filter of the page "Synchronizacje" into a shared element, which the stage filter uses. | A filter element of its own: a second pattern for the same thing (owner). |
| D10 | Stages, labels, icons, colours, messages and the allowed-transitions function live only in the Recruitments view entry; the server checks every move again. | — |
| D11 | The stage moment comes from the application's clock, passed to the operation as "now", as the architecture rules' Polish time section requires; ties in order are broken by the application's ID. | The database clock: departs from the time rules and makes a move at a given moment, such as just after midnight Polish time (T2-AC02), hard to test (owner, Q55). |

Accepted costs:

- **The note keeps no history (A-R09), and the last save wins (A-R11).** There is one user, and the note carries no version to compare, so a lost concurrent edit can only come from the owner's own second page.
- **The offer list keeps filtering its whole catalogue in memory**, at most 10 000 ads (Observed in the Offers module). The stage read adds at most one row per application to that.

## Storage

One forward-only migration in raw SQL, part of T1, following the existing ones (node-pg-migrate, tables in the public schema prefixed by module, enums as `text` with a `CHECK`, UUIDs generated in the application, moments as `timestamptz` in UTC):

- **Applications:** `id uuid` primary key, `offer_id uuid NOT NULL UNIQUE` (today the ad ID; no foreign key, D7), `stage text NOT NULL CHECK (stage IN ('to_consider','cv_sent','rejected','removed'))`, `stage_changed_at timestamptz NOT NULL` (the stage moment), `note text NOT NULL DEFAULT ''`.
- **Stage changes:** `id uuid` primary key, `application_id uuid NOT NULL` referencing applications, `stage text NOT NULL` with the same check, `changed_at timestamptz NOT NULL`; index on `(application_id, changed_at)`. Rows are only inserted.
- Index on applications `(stage, stage_changed_at DESC, id DESC)` for Moja lista.

## Operations and contracts

### Recruitments module (T1, except where marked)

Commands run in a transaction of the shared mechanism; a call inside a running transaction joins it. Each command takes "now" as an argument (D11); the application row and its history record carry that moment.

1. **Create application** (client: the Offers command of D5). Input: offer ID, target stage, now. The target must be allowed from "no application" (A-R03). Insert with `ON CONFLICT (offer_id) DO NOTHING`; when a row was inserted, append the history record and return the stage. When the offer already has an application: its stage equal to the target returns success without a write (A-R13); otherwise a conflict (A-R07).
2. **Move application** (client: pages). Input: offer ID, expected stage (one of the four), target stage, now. A pair outside A-R03 is invalid input. A conditional update sets stage and stage moment where the offer and the expected stage match; on a changed row, append the history record. Without a changed row: no application → not found; current stage equal to the target → success without a write (A-R13); otherwise a conflict (A-R07). A retry after a lost answer carries the old expected stage and the same target, so it ends in the A-R13 branch. The conditional update needs no row lock.
3. **Save note** (T2; client: application details). Input: offer ID, text. More than 10 000 characters, counted as Unicode code points, is invalid input with the message of A-R10. The update sets only the note; no row → not found (A-AC07). The last save wins (A-R11).
4. **Current stages** (T1; client: Offers list in T3, D3). No input. Returns offer ID → stage for every application, `removed` included.
5. **Application details** (T1; clients: offer details in T1, application details in T2). Input: offer ID. Returns stage, stage moment, note and the history newest first (`changed_at DESC, id DESC`), or nothing.
6. **Applications page** (T2; client: Moja lista). Input: stage choice `active` (default) | `all` | `to_consider` | `cv_sent` | `rejected`, page, size (10, 20, 50, 100; default 20). Unknown values become defaults; the page is clamped as T2-R06 says. `active` = `to_consider`, `cv_sent`; `all` = every stage but `removed`. Order `stage_changed_at DESC, id DESC`. Returns items (offer ID, stage, stage moment), total, page, size and the normalised choice.

Errors are the module's own classes. A handler of the module maps them as the Companies module's handler does: conflict → 409, not found → 404, invalid input → 422. The response body carries the message text from the Recruitments view entry in its data, not only in the status line, because the messages contain Polish letters and a dash; the page shows that text. The implementer verifies how the HTTP framework passes such text.

### Offers module

1. **Start application** (T1; client: offer details). Input: offer ID, target stage. Checks the offer exists (not found → 404), then calls create application with now, and returns its result.
2. **Offers by IDs** (T2; clients: Moja lista and application details, D4). Input: up to 100 offer IDs. Returns for each existing one: ID, title, company, salary, availability at the source. Missing IDs are left out.
3. **Offer list** (T3). Before filtering, attaches the stage of each offer from current stages. The filter type gets `stages`: a set of `none`, `to_consider`, `cv_sent`, `rejected`, `removed`. Places that change, all Observed in the code on 26 November 2026:
   - the query parsing accepts several values for the key `stage` only, repeated or comma-separated as the page "Synchronizacje" does; every other key stays a single string, and unknown stage values are dropped, not raised (T3-R05);
   - the builder of the list query from the filter form carries several values for that key;
   - the offer list page adds the key to its list of filter keys.

   An offer passes when the set is empty or holds its stage, `none` standing for no application. The filter runs with the others, before sorting, counting and paging. Each list item carries its stage.

The salary label that the offer list page builds for itself moves into the Offers view entry in T2, so the application details show the same text (T2-R09).

### Pages

- **Offer details** (T1) read the application details by offer ID and show the stage field (A-R04, T1-R01). A choice from "Bez aplikacji" calls start application; any other calls move application with the shown stage as expected. Offer details show no note (A-R12). The link "Szczegóły aplikacji" (T2-R12) is added in T2 and opens Moja lista with the offer ID in the address.
- **Moja lista** (T2) reads the applications page, then offers by IDs of its items, and joins them by offer ID. An item whose offer is missing from the answer shows its stage only. Address keys: `stage`, `page`, `size`, `offer` (the open details); keys equal to their default are left out, and a changed choice or size removes `page`.
- **Application details** (T2, drawer) read the application details and offers by ID for the one offer. A choice calls move application and then reads the details and the list page again; when the page is now beyond the last, the page key moves to the last page (T2-R10). "Zapisz notatkę" calls save note.
- **Offer list** (T3) shows the icon of T3-R01 from each item's stage and the stage filter of T3-R03.
- Dates follow the Polish time library: the stage date of T2-R02 as DD.MM.RRRR, the history as DD.MM.RRRR HH:mm.
- Navigation (T2): each page's header gets the link "Moja lista".

### Shared elements (T4)

The paging and the multi-choice filter of the page "Synchronizacje" become shared page components with their logic in functions a test can call. The page "Synchronizacje" uses them, and its existing tests stay green.

## Situations every operation answers

| Operation | Concurrent call | Resource limit | Repeated call | Empty or malformed input |
| --- | --- | --- | --- | --- |
| Start / create | Two creates of one offer: the unique offer ID lets one insert; the other follows the rule for an existing application | One row | Same target: success without a write | Unknown offer → 404; target not allowed from "no application" → 422 |
| Move | Conditional update; the loser gets a conflict or, with the same target, success | One row and one history record | Success without a write | Unknown stage or pair outside A-R03 → 422; no application → 404 |
| Save note | Last save wins; a parallel move is unaffected (different columns) | 10 000 code points; request body limit of the HTTP layer | Same text written again | Over the limit → 422 with the A-R10 message; no application → 404 |
| Current stages | Reads committed state | At most one row per application | Same answer for same state | — |
| Applications page | Reads committed state | At most 100 items | Same answer for same state | Unknown values → defaults; page clamped |
| Offers by IDs | Reads committed state | At most 100 IDs; more → 422 | Same answer | Malformed IDs → 422 |
| Application details | Reads committed state | All history records of one application | Same answer | Malformed ID → 404 |

## Rollout and task boundaries

One migration, no backfill, no external service.

- **T1** creates the module (README, view entry, the module map row, the module-boundaries test's explicit list of modules), the migration, operations 1, 2, 4 and 5, start application, the module's HTTP handler and routes, and the stage field in offer details.
- **T4** moves the paging and the multi-choice filter into shared elements, after `oferty-pracy-nq3.1`.
- **T2** adds save note, the applications page, offers by IDs, the salary label move, the page Moja lista with its drawer, the navigation link and the link from offer details. After T1 and T4.
- **T3** adds the stage filter and icons to the offer list. After T1 and T4.

## Verification

- **T1:** integration tests on an isolated database for create and move: every allowed and refused pair, A-R13, A-R07, a restart with a new connection pool (A-AC04), independence from ad and assessment changes, and parallel calls for A-AC09 (two creates with different and with equal targets, two moves to different targets). A unit test of the allowed-transitions function. Route tests on a running server for T1-AC02 and T1-AC03. A rendering test of offer details for T1-AC01 and A-AC11.
- **T2:** integration tests of save note (limits, parallel move for A-AC10), the applications page and the application details; unit tests of the address and drawer logic (T2-AC05, T2-AC12, T2-AC13) and of the shown dates with a fixed now; rendering tests of the page, the drawer, the counter and the navigation.
- **T3:** unit tests of the stage parsing and filtering; a rendering test of the icons; an integration test counting the offer list's queries with 0, 1 and 50 applications.
- **T4:** the existing tests of nq3 T1-AC06 and T1-AC07; review that the page "Synchronizacje" has no paging or multi-choice code of its own.

The sandbox has no browser, as for epic `oferty-pracy-nq3`: rendering tests request the page from the running server and read its HTML, or test the function that produces the shown text.

## Risks

- **Grouping of offers.** Applications point at ad IDs. When the Offers module starts grouping ads, applications must move to the grouped offer, two ads with applications collide on the one-application rule, and start application must check the grouped offer.
- **Dependency on `oferty-pracy-nq3.1`.** T4 cannot start before it is in `main`, and T2 and T3 wait for T4.
