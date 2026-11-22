# Ad sync panel — Solution design

Basis: [PRD](PRD.md), [requirements](requirements.md). Binding rules: the [architecture rules](../../architecture/moduly-i-zasady-kodu.md). Sections *Contract* and *Decisions* are agreed constraints; *Approach* sketches one way to meet them and leaves names and placement to the implementer. Terms follow the requirements' [Words](requirements.md#words).

## Shared design

### Parts and what each owns

- **Sources module** owns everything the panel shows: the catalogue of sources with display names, whether each is enabled and whether it marks unavailable ads; the sync runs; the observation history (which ads each run saw); the source ads with their first-seen time; the content versions; the fixed panel scope; the health thresholds. Every read and request the panel needs is a public operation of this module. (owner, 2026-11-22)
- **The page** "Synchronizacje" and its HTTP routes hold no rules: they validate input, call the module's operations and render.
- **The Offers module** is not involved. The offer list's HTTP read, which today also returns sync state, changes in T5 only.
- **Navigation.** Each page copies its own navigation; T1 adds the link to each copy.

### Data (Observed, 2026-11-22)

- A sync run belongs to a scope of one source and stores its way of starting (`manual`, `scheduled`), its status (`queued`, `running`, `complete`, `partial`, `failed`), request, start and finish times, the number of portions (`pages`), of unique ads seen (`seen`) and of new content versions (`revisions`), the error text and the connector's diagnostics. The attempt number is not stored.
- A source ad is unique per source and stores the time it was first seen, set when the ad is first written and never changed afterwards.
- The observation history holds one row per (run, ad); its primary key starts with the run.
- A source has at most one unfinished run at a time: an advisory lock per source admits it, and the queue runs one job per source. Unique partial indexes add a guard per scope.
- A run reaches a final status in two ways: the worker finishing it (in one transaction with marking unavailable ads) and the failure handler after a job's last attempt failed, including a dead worker. Both write the status conditionally on the run still being unfinished.
- The local database (2026-11-22): 326 source ads, 46 runs; for each of the 45 runs that saw ads, counting new ads by "no earlier run of the source saw it" and by "first seen during this run" gives the same number, and no two runs of one source overlapped in time.
- The catalogue read today covers the JobSpy and Polish portals only; SOLID.Jobs and Himalayas have no display name anywhere. The application's shared HTTP handler checks that a request comes from the application's own origin; the Polish portals' request route checks it by hand.

### HTTP routes

Every new route goes through the shared HTTP handler with its origin check, answers JSON and is not cached. Malformed input of a read is replaced by defaults (T1-R17); an unknown run gives 404; a malformed request body gives 400.

| Route | Task | Carries |
| --- | --- | --- |
| History read | T1 | the history read of T1 |
| Details read | T1 | the details read of T1 |
| Request syncs | T3 | the request of T3 |
| Health read | T4 | the health read of T4 |

### Times

Times are stored in UTC and follow Polish time only through the time library of T6 (T6-R09). Days, "Dziś", "Wczoraj" and the period boundaries of T1 are calendar operations of that library; "Nowe w 24 h" and the 72 hours of T4 are exact elapsed time, also through it, because they compare with stored data.

### Rendering checks

The sandbox has no browser (collection task item 49). "Automated test of the page's rendering" means requesting the page from the running server and reading its HTML, or a test of the function that produces the shown text. "Automated test of … logic" means a unit test of a function the page uses: grouping by day, the filters and the address, the page list, the tooltip's position, the dialog's states, the warning list. Such logic lives in functions a test can call without a browser.

### Tests

The integration tests of the Sources module build their schema from a fixed list of migrations; a task that adds a migration adds it to that list.

<a id="t6"></a>

## T6. Polish time in one place

### Approach

1. A time library in the shared infrastructure, next to database access and outside the modules. It has no server-only dependency, so pages in the browser use it too. It is built on `temporal-polyfill`; only the library imports it.
2. Three parts (owner, 2026-11-22):
   - **calendar**: the Polish day (`YYYY-MM-DD`) and month (`YYYY-MM`) of a moment; the UTC moment a Polish day or month starts; the same N days or months back;
   - **arithmetic**: plus and minus calendar days and months, and exact hours and minutes;
   - **display**: Polish date `DD.MM.RRRR`, date with time, time, and "Dziś"/"Wczoraj".
3. The zone `Europe/Warsaw` is one constant of the library (T6-R01); no function takes a zone.
4. The schedule day of the Sources module is computed through the calendar part (T6-R10).
5. The rule of T6-R09 is added to the architecture rules.

### Contract: the time library

- **Moments** in and out are JavaScript `Date` values (UTC instants), as the database driver gives them; over HTTP they travel as ISO text ending in `Z`. **Calendar days** are text `YYYY-MM-DD`, months `YYYY-MM`. No Temporal value leaves the library (owner, 2026-11-22).
- **Now.** A function that needs the current moment takes it as an argument that defaults to the current moment, so tests pass a fixed moment (owner, 2026-11-22).
- **Calendar arithmetic** works on the Polish wall-clock time and turns the result back into UTC with Temporal's `compatible` disambiguation: a time in the spring gap moves forward by the gap (T6-R05), a time in the autumn overlap is the earlier (T6-R06). Months use `constrain` overflow: a missing day becomes the month's last day (T6-R07).
- **Exact arithmetic** adds or subtracts hours and minutes as elapsed time, regardless of the wall clock.
- **Display** uses Polish formats; "Dziś" and "Wczoraj" compare the Polish day of the moment with the Polish day of now.
- **Queries** never convert time zones; they get UTC moments computed by the library. A calendar day stored as a date (the schedule day) is passed as `YYYY-MM-DD`.

### Decisions

**PS-D03 (Owner, 2026-11-22). The time library is built on `temporal-polyfill`, hidden behind its own functions.**
Reason: Temporal is the JavaScript standard Node and the browsers are adopting; its defaults are the rules of T6-R05–R07, so the library does not reimplement them; when the platforms ship Temporal, the dependency goes and the library's functions stay.
Discarded: own code on the platform's built-in date formatting (no dependency, but the time-change and month-end rules would be written and tested by hand). `date-fns` with `@date-fns/tz` (the gap and overlap rules less explicit and possibly hand-written). `luxon` (slower development, its own API the standard replaces).
Cost accepted: a new dependency of about 20 kB in the browser.

### Situations per operation

The library's functions are pure: no concurrency, no resource, a repeated call gives the same result. Malformed input: an invalid `Date`, or a day or month text that is not a real date, throws an error naming the value.

### Rollout (T6)

One new dependency; no stored data changes. The schedule day must not change (T6-AC07), so the daily SOLID.Jobs sync keeps its day.

### Verification

Unit tests of the three parts at midnight in winter and summer, both time-change nights, the turn of a year and 29 February (T6-AC01–AC05); a comparison of the schedule day with the present code over a year in 15-minute steps (T6-AC07); review of the architecture rules, the library and the Sources module (T6-AC06, AC08).

<a id="t1"></a>

## T1. Sync history

### Approach

1. The catalogue gives every source a display name and its enabled state; SOLID.Jobs and Himalayas get theirs.
2. Two public reads of the Sources module: the history page and one run's details. The page loads the first keyed on the route query, and the second through a separate fetch keyed on the open sync, as the offer list does with its details. "Odśwież" reads both again.
3. New and changed ads are computed by the reads (PS-D01, PS-D02). Nothing is stored and nothing is migrated.
4. The page renders variant C of the mock-up: day groups, row layout, state labels with icons and tooltips, filters, pager with the page list, the drawer.

### Contract: new and changed ads

- **New ads of a finished run R** = the number of ads R saw whose first-seen time is at or after R's start and at or before R's finish. Equivalent to "no earlier run of the same source saw it", because a source has one unfinished run at a time (Observed above).
- **Changed ads of R** = `revisions` − new ads, at least 0.
- An unfinished run has neither (null); the page shows "—".

### Contract: history read

Input, all optional, each invalid value replaced by its default (T1-R17):

| Field | Values | Default |
| --- | --- | --- |
| sources | any subset of catalogue source ids; unknown ids dropped; empty = all | all |
| states | any subset of the five statuses; unknown dropped; empty = all | all |
| way of starting | `manual`, `scheduled` | all |
| period | `today`, `7d`, `30d`, `all`; boundaries at Polish midnight, by request time | `7d` |
| page | integer; below 1 → 1, beyond the last → the last | 1 |
| page size | 10, 20, 50, 100 | 20 |

Output:

- `items`: the runs of the page, ordered by request time descending, then id: id, source id, way of starting, status, requested at, `seen`, new ads, changed ads.
- total (matching runs), page (after clamping, 1 when there are none), page size, the normalised filters.
- `sources`: every catalogue source with id, display name, enabled, and whether it marks unavailable ads.

The read does not return the error text or diagnostics.

### Contract: details read

Input: a run id. Output: the fields of a history item plus started at, finished at, `pages`, the error text and the diagnostics as stored. An unknown or malformed id gives "not found"; the page then shows the list without details (T1-R16). The page shows the error text and diagnostics as escaped text.

### Contract: page address

Query keys `source` and `state` (repeated or comma-separated), `trigger`, `period`, `page`, `size` and `sync` (the open run). Keys equal to their default are left out of the address. Changing a filter or the size removes `page`.

### Decisions

**PS-D01 (Owner, 2026-11-22). New ads are computed by the reads from the first-seen time of the ads a run saw.**
Reason: the count needs no stored copy, no backfill of past runs, no change to the two paths that end a run and no window in which a run's count stays empty; the read stays cheap (at most 100 runs per page, each joined through the observation history's primary key).
Discarded: computing new ads when a run reaches its final status and storing it with the run (chosen first, to optimise reads). The review of the epic showed its costs (a stored copy, item 5 of the costs of design decisions, a backfill, an index, a failure that could leave a run unfinished), and the local data showed that the first-seen time gives the same counts.
Discarded: counting new ads per stored portion next to `seen` and `revisions` (needs a migration and a backfill as well).

**PS-D02 (Owner, 2026-11-22). Changed ads are computed by the read from `revisions` and the new ads.**
Reason: storing it would keep a second copy of the same knowledge.
Discarded: storing changed ads with the run.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| History read | Reads committed state; a run ending during the read shows its earlier or later state | At most 100 runs per page; new ads computed for the page's runs only | Same answer for the same state | Invalid values replaced by defaults; page clamped (T1-R17) |
| Details read | Reads committed state | One run | Same answer | Unknown or malformed id → not found |

### Verification

- Integration tests on a real database: new and changed ads for a run with ads seen earlier and ads never seen, across two scopes of one source, for each final status including a run that never started (T1-AC03); changed ads never below zero.
- Tests of the history read: ordering, every filter, Polish day boundaries, defaults, invalid input and clamping (T1-AC02, AC06, AC11).
- Unit tests of the page's logic and requests of the rendered page for the remaining criteria (T1-AC01, AC04, AC05, AC07–AC10).

<a id="t2"></a>

## T2. Ads marked unavailable

### Approach

1. A migration adds to the sync run a nullable integer *marked unavailable*. Past runs keep null; nothing is recomputed (T2-R04).
2. Marking absent ads unavailable, which already runs in the transaction that gives a complete run its final status, returns the number of ads it changed from available to unavailable. That transaction stores the number with the status. For a source that does not mark unavailable ads, and for a run that ends incomplete or failed, the value stays null.
3. The history and details reads return *marked unavailable*, and with the catalogue's flag the page tells the cases apart (T2-R02–R04, R07):
   - a source that does not mark unavailable ads → no count in the row, "nie dotyczy" in the details;
   - a complete run with a value → the number;
   - an incomplete or failed run → "—" with the tooltip of T2-R03, whatever its age;
   - a complete run without a value → "—" with the tooltip of T2-R04.
4. The date in the tooltip of T2-R04 is the finish time of the earliest run with a recorded value, as a Polish date. The history read returns it; while there is none, the tooltip reads "Liczone od wdrożenia tej funkcji".

### Contract: marked unavailable

- *Marked unavailable of run R* = the number of ads of R's scope that the marking step of R changed from available to unavailable at the source. An ad already unavailable is not counted.
- Stored only for a complete run of a source that marks unavailable ads, in the transaction that writes the final status and the marking (T2-R06); otherwise null.
- History read items and the details read gain *marked unavailable*; the history read gains *unavailable counted since* (the date of item 4 of the approach, or none).

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Marking with its count | One unfinished run per source; the final status is written conditionally, so of two ends one is kept with its count | The count comes from the same statement that marks; a failure rolls back the marking, the count and the status together (T2-AC05) | A second end of an ended run changes nothing | — |

### Rollout (T2)

The migration runs before the new code starts, as every migration of the project does at start-up. A run finishing between the migration and the new code keeps a null count and shows "—" with the tooltip of T2-R04.

### Verification

Integration tests on a real database cover T2-AC01, AC02, AC03, AC05 and AC06. Tests of the read and of the rendered page cover the row, the details and the tooltips (T2-AC01, AC03, AC04, AC07).

<a id="t3"></a>

## T3. Starting syncs from the panel

### Approach

1. The Sources module gains one public operation: request syncs of a list of sources from the panel. For each source it applies the module's fixed panel scope, the way of starting `manual` (T3-R09) and the existing one way of requesting a sync, which admits at most one unfinished run per source (T3-R04). The fixed panel scope is PHP · senior: for the Polish portals the module builds their scope request with technology PHP and level senior and their present limits (T3-R03); the other sources' connectors already search that scope by default.
2. The operation answers, per source, one outcome: requested (with the new run's id), already running (with the unfinished run's id), skipped (disabled or not in the catalogue, T3-R05) or not requested (any other failure, the queue's refusal included, T3-R06), and the counts of each.
3. The page sends one HTTP request per confirmation with every checked source (owner, 2026-11-22); "Uruchom ponownie" sends the same request with one source and opens the run id of its outcome (T3-R08).
4. The dialog's states come from the history read's `sources`, to which T3 adds the id of each source's unfinished run, if any.
5. The import form of the offer list keeps its choice of technology and level until T5 removes it; the fixed scope applies only to requests from the panel (owner, 2026-11-22).

### Contract: requesting syncs from the panel

- Input: a list of source ids, at most the number of catalogue sources after duplicates are taken once. An empty list, or a longer one, is rejected as malformed input (400).
- Output: per source its outcome as in item 2 of the approach, and the counts requested, already running, skipped and not requested.
- Sources are handled one by one and independently: an outcome of one source does not undo or block another (T3-R06).

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Requesting syncs from the panel | Two requests, or a request and the schedule or the command line, for one source: the advisory lock per source admits one run; the other gets already running (T3-R04) | At most the catalogue's sources per request; a queue refusing one source gives it not requested, with nothing stored for it, and the rest proceed | A second identical request gives already running for each source requested by the first | Unknown source ids → skipped; empty or too long a list → 400; the page never sends an empty one, since its button is inactive (T3-R01) |

### Verification

- Automated tests of the operation: fixed scope and manual start for every source, the Polish portals' limits (T3-AC03); a source with an unfinished run, including one admitted between reading the dialog and confirming, on a real database (T3-AC04); disabled and unknown sources (T3-AC05); a queue refusing one of three, by a test double of the queue that refuses a chosen source (T3-AC06); the command line and the schedule still requesting syncs (T3-AC09).
- Unit tests of the dialog's and the page's logic: T3-AC01, AC02, AC07, AC08.

<a id="t4"></a>

## T4. Source health

### Approach

1. One public read of the Sources module returns the strip: queued or running, sources whose latest finished sync failed or was incomplete, new in 24 hours and the warning list with each source's reasons (T4-R01–R05). It takes no history filter (T4-R07). The thresholds, 72 hours and 3 failed syncs, are fixed in the module (T4-R08).
2. The read computes everything from the stored runs each time it is called: per enabled source its latest finished run and its three latest finished runs, ordered by finish time then id across all scopes of the source, and its latest complete run; queued or running counts unfinished runs; new in 24 hours sums the new ads of T1 over runs finished in the last 24 hours. Nothing new is stored (owner, 2026-11-22).
3. The page reads the strip with every read of the list (T4-R07). It renders three names in alphabetical order and "i N innych", and a click on a name sets the history's filters (T4-R06).

### Contract: health read

- Input: none.
- Output: queued or running (count), latest sync failed or incomplete (count of enabled sources), new in 24 hours (sum), and the warning list: per source its id, display name, the finish time of its latest complete run or none, and its reasons (no complete run for 72 hours, 3 failed in a row).
- Disabled sources are left out of the second count and the warning list; their runs still count in queued or running and new in 24 hours.

### Situations per operation

| Operation | Concurrent call | Resource limit | Repeated call | Malformed input |
| --- | --- | --- | --- | --- |
| Health read | Reads committed state; a run ending during the read shows its earlier or later state | A few latest runs per catalogue source | Same answer for the same state and time | — (no input) |

### Verification

- Automated tests of the read on a real database: T4-AC01–AC05, including the 71/73-hour and 24/25-hour boundaries and disabled sources.
- Unit tests of the page's logic: T4-AC06, AC07.

<a id="t5"></a>

## T5. Offer list without sync information

### Approach

1. The offer list's HTTP read stops returning sync state and the JobSpy and Polish portals' catalogues; it returns offers, filters and the AI assessment status.
2. The HTTP route by which the browser requested a Polish portal's sync is removed (T5-R04), and so are the status routes of the JobSpy and Polish portals, which only the offer list and tests used (T5-R07). The command line keeps its own status commands. Module exports used only by the removed routes go with them.
3. The offer page drops the summary, the notice, both sections, the import state and the timer that reloaded the list (T5-R05). "Odśwież widok" moves out of the removed summary block and stays.
4. Tests that called the removed routes are removed or moved to the module's operations. Documents that name the removed form, buttons or routes are updated: the main README, the architecture overview, the JobSpy local development guide and the Sources module's README.

### Situations per operation

No operation is added; the offer list's read only loses fields. A request to a removed route gets 404.

### Verification

- Automated tests: the removed request route answers 404 and stores nothing (T5-AC02); the removed status routes answer 404 and a Polish portal started from the command line syncs (T5-AC05); the offer read keeps availability and source (T5-AC04).
- Requests of the rendered offer page and unit tests of its logic: T5-AC01, AC03, AC04.
