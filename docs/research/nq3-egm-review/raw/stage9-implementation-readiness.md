# Stage 9 — Implementation Readiness (Goldfish, mode REVIEW)

Range: `docs/specs/nq3-panel-synchronizacji/solution-design.md` (whole file, "SD") and the epic with tickets nq3.1–nq3.5 in `docs/research/nq3-egm-review/tickets-export.md` ("export"). Context read: PRD, requirements, `docs/agents/implementation-workflow.md`, architecture rules, the mock-up (`docs/prototypes/synchronizacje/index.html` and README), and the code of `modules/sources`, `server/api`, `app/pages/offers.vue`, `.sandcastle/Dockerfile`, `scripts/test-integration.sh`.

Method: for each ticket I asked "does an unattended agent in the runner sandbox know exactly what to build, where the data comes from, and how to prove each criterion, without choosing anything?". I checked the SD's claims against the code.

Standard note (not counted as a finding): the Standard asks for exact repository-relative file lists for a write allowlist. The project's process contract forbids concrete paths in the SD ("the implementer chooses those"), so I judged names and placement by that contract and flag only decisions that are not names or placement.

Summary: 1 Blocker, 7 Major, 10 Nit.

---

## 🔴 Blockers

### B1. About a dozen criteria cannot be proved in the runner's sandbox: "check in the running application" needs a browser and the sandbox has none

- Where: SD lines 91, 126, 154, 182, 202 (the "Check of the running application" lines); requirements preamble line 5 and the Check column of T1-AC05/06/07/10, T3-AC01/02/07/08, T4-AC06/07, T5-AC03; the same ACs in the tickets nq3.1, nq3.3, nq3.4, nq3.5.
- Discrepancy: the criteria that depend on pointer, keyboard or timing behaviour are checked "in the running application ... started in its sandbox". The sandbox image (`.sandcastle/Dockerfile`) has Node, PostgreSQL, git, curl and Claude Code, and no browser. `package.json` has no Playwright, jsdom, happy-dom, `@vue/test-utils` or `@nuxt/test-utils`, and `vitest.config.ts` has no DOM environment. `scripts/test-integration.sh` can only request pages with curl. Earlier epics (sq2, opn) defined the same Check as "by requesting the page or the route and reading the response". The nq3 requirements dropped that clause, and these criteria are not answerable by a server-rendered response:
  - tooltip at least 16 px from the window edge, also at the right edge (T1-AC05); hover and focus behaviour;
  - multi-select applies on closing, Escape closes the drawer, page list filtered by typed digits, Backspace, Enter (T1-AC06, AC07, AC10);
  - dialog opens with the right boxes checked and the confirm button inactive, "Uruchom ponownie" opens the new sync (T3-AC01, AC02, AC07, AC08);
  - "i N innych" expands on click, a name click sets the filter, the strip does not change on a filter change (T4-AC06, AC07);
  - the offer list does not reload by itself within 30 seconds (T5-AC03, a client-side timer).
- Rationale: an agent cannot satisfy these checks, the runner's reviewer (same image) cannot confirm them, and the agent must either invent a method (add a browser or DOM-test dependency, which the allowlist rule forbids as an opportunistic dependency, and which also needs a Dockerfile rebuild) or claim a check it did not do. This is a design choice the plan leaves to the implementer, and it will cause feedback turns or a return as `needs-info`.
- Guidance: decide per criterion before hand-off. Options: (a) name pure functions that the agent must extract and unit-test in Node (address parse and normalise, page-list digit filter, tooltip placement from rectangle and window width, "dialog default checked" selection, strip expand state), and state that the SSR response is the check for the rest; (b) add a browser to the image as an owner decision; (c) mark those criteria as an owner check after pulling `main`, and split the task or label it `ready-for-human`. Restore the sq2 wording of the Check clause in the requirements either way.

---

## 🟡 Majors

### M1. The catalogue of sources is assumed to exist, but display names, order and grouping do not exist in the code and the SD does not define them

- Where: SD lines 9, 55–56 (`sources` in the history read), 136 item 4 (dialog read).
- Discrepancy: SD 9 says the Sources module "owns ... the catalogue of sources with their display names". In the code, `SourceConnector` (`infrastructure/adapters/connector.ts`) has `name`, `infersUnavailabilityFromAbsence`, `scheduled`, `enabled()` and nothing else. Display names exist only in `jobspyCatalog` and `polishCatalog`. SOLID.Jobs and Himalayas have none (the offer page hard-codes 'SOLID.Jobs' and 'Himalayas'). The mock-up lists 14 sources in three groups ("Inne źródła", "Portale JobSpy", "Polskie serwisy") and omits HelloWork; the registry has 15. The SD does not say:
  - where the two missing names come from, or whether the connector contract gains a display-name field (that also changes the test doubles in `tests/fixtures/sources/connectors.ts` and `tests/source-connectors.fixtures.ts`) or a separate catalogue is added;
  - what order the `sources` filter list and the dialog list use, and whether the dialog is grouped as in the mock-up (T3-R01 says only "every catalogue source");
  - the display text for a run whose source is no longer in the catalogue.
- Rationale: user-visible texts and a contract change to an existing port left to the implementer; the SD calls the catalogue an existing thing.
- Guidance: state the display names (all 15), the order, the grouping and its owner, and the way they reach the page (one field per source in the `sources` output).

### M2. The dialog's catalogue read: reasons for disabled sources, moment of the read, and the "enabled" flag for "Uruchom ponownie" are not defined

- Where: SD 137 (item 4), 148–150 (situations, no row for this read), 134–136; requirements T3-R02, T3-R08; tickets nq3.3 T3-AC02, AC08.
- Discrepancy:
  1. "The reason when it is not [enabled]": a connector answers `enabled()` with a boolean only. Reasons differ by cause in the code: JobSpy source not listed in configuration, LinkedIn access not confirmed, Google "unavailable" (`sourceEnabled` in `jobspy/runner.ts`), Polish source not in `POLISH_SOURCES`. The mock-up texts are "Wyłączone w konfiguracji" and "Niepodłączone". The SD gives neither the texts nor the rule that picks one.
  2. The SD does not say when the read happens (page load, or each time the dialog opens). T3-AC04 and AC01 depend on it: "checked = enabled and no unfinished sync" reads state at one moment.
  3. T3-R08 says the details of a disabled source do not offer "Uruchom ponownie". The details read (SD 59–61) and the history read's `sources` (SD 55–56) carry no `enabled` flag, so the page has no stated source for it. The dialog read may not be loaded then.
  4. The SD does not say whether the read extends the existing `readSourceCatalog` (JobSpy and Polish only, in the old shape, which T5 leaves for the CLI) or is new. Architecture rules, cost 3, ask for an explicit decision when a second mechanism is added for the same thing.
- Guidance: define the read's output (id, enabled, reason text, unfinished run id), the reason texts and when each applies, when the page loads it, and the source of `enabled` for the details drawer. Add the read to the situations table.

### M3. "Today", "7 days" and the day headings have no stated time zone or timestamp

- Where: SD 44–48 (`period` row: "today (since local midnight)", `7d`, `30d`), 53; requirements T1-R03, T1-R08.
- Discrepancy: the read runs on the server. "Local midnight" is not defined for a server in a container whose time zone is not set (Dockerfile and compose set none); the project's own convention elsewhere is `Europe/Warsaw` (`schedule-day.ts`, `offers.vue` `dateLabel`). The SD also does not say that `period` filters on the request time, nor whether `7d` is rolling (the mock-up's `Date.now() - 7·24h`) or calendar days. The grouping "Dziś / Wczoraj / date" is done by the page from the request time (the read returns no group), so a server `today` and a browser "Dziś" can disagree for a viewer outside Warsaw time.
- Rationale: the boundary decides which runs the history shows, and T1-AC06 is tested by an automated test of the read, so the test cannot be written without it.
- Guidance: fix the zone (Europe/Warsaw for the read and the headings, as the rest of the application), the timestamp (request time), and rolling windows for 7d and 30d.

### M4. The HTTP layer of the five new routes has no contract

- Where: SD 10 ("validate input, call the module's reads and render"), 63–65, 134–136, 148–150, 165, 170; T5 route removal at 190–192.
- Discrepancy: the module operations are specified, the routes are not: methods and shapes of request and response; the status for "unknown or malformed id" (the SD says "not found" for the read, the page must "show the list without details"); the status for an empty list (SD 150 "rejected"); the Origin check, JSON content type, body size limit and `Cache-Control: no-store` that `server/api/sources/polish.post.ts` has and the new POST route must have (security: the route starts work); a maximum count of ids in the body (SD 150 says "at most the catalogue's sources per request", but duplicates and unknown ids are accepted without bound); whether the response carries per-source outcomes plus the four counts; the mapping of errors other than a queue refusal (see M5).
- Rationale: a pattern exists to copy, but the SD neither cites it nor says to follow it; a missing Origin check is a security regression an unattended agent can make silently.
- Guidance: add one table: route purpose, method, input, success body, error statuses, and a line "mutating route follows the checks of the existing import route (same-origin, JSON, size limit, no-store)".

### M5. T3 operation internals left open: how the fixed Polish scope is passed, and the outcome for errors other than a queue refusal

- Where: SD 134 (item 1), 135 (item 2), 150.
- Discrepancy: `requestSync` for a Polish portal calls `polishQuery.parse(request)`, where `source` is required. A fixed-scope request with no `scopeRequest` throws a Zod error. The defaults of the schema (PHP, senior, 50, 5, 60) do match "present limits", but the SD does not say to pass `{ source }` or where the Polish-specific knowledge lives (the connector port is meant to hide it; passing `{ source: name }` to every connector works because the others ignore the request). Outcome categories are four; `requestSync` can also throw the connector's validation error and unexpected database errors. The SD does not say whether these become "not queued", abort the whole request, or something else, and the T3-R06 message says "could not be put in the queue".
- Guidance: state the scope input per source (or "`{ source }` for every source"), and map each thrown class to an outcome (`UnknownConnectorError`, `SourceDisabledError` to skipped; anything else to not queued, or fail the request).

### M6. T2 tooltip: the SD changes the meaning of the date in T2-R04 and gives no format

- Where: SD 110 (item 4), 116; requirements T2-R04, T2-AC04; ticket nq3.2 T2-AC04.
- Discrepancy: T2-R04 says "Liczone od <date the task was deployed>". The SD defines the date as the finish time of the earliest run with a recorded value, which is the first complete SOLID.Jobs run after the deployment, possibly days later, and a different fact. It adds a fallback text not in the requirements ("Liczone od wdrożenia tej funkcji"). No date format or zone is given. It is also not stated whether the date is global or per source (only inferring sources can have a value, today one). The history read gains a new field for it (`unavailable counted since`) with no named consumer decision in the architecture sense (cost 1).
- Rationale: either the requirement or the SD is wrong, and the reviewer will see a spec conflict; the agent cannot settle it, because it is a visible text and a stored-data meaning.
- Guidance: state which date is shown and why (deployment date cannot be stored without a place to keep it, so this is the proxy: record that as the owner's decision), the format ("22 listopada 2026", `Europe/Warsaw`), and update T2-R04 to match.

### M7. T4 and the strip: wording and order not defined, and the mock-up contradicts the requirements

- Where: SD 163–171; requirements T4-R01–R06; tickets nq3.4; mock-up `sourcesC()` (index.html lines ~378–388).
- Discrepancy:
  - The warning's reason for T4-R05 ("3 failed in a row") has no text anywhere. The mock-up and T4-R04 give only "Bez pełnej synchronizacji od 3 dni" and "nigdy". T4-AC05 requires a source meeting both conditions to appear once "with both reasons", so a text is needed for each reason, and the layout of two reasons in one list item.
  - The order of the names (which three show before "i N innych") is not stated (T4-AC06 uses five sources).
  - The mock-up strip says "wymaga uwagi (7 dni)", counting syncs in the last 7 days, and "nowych ogłoszeń w 24 h", and prints "—" when no source is stale. The requirements define "Wymaga uwagi" as the number of enabled sources whose latest finished sync is incomplete or failed, label it "Nowe w 24 h", and show no warning when empty. T1 says the mock-up is the evidence of "layout and wording", so an agent copying the mock-up gets the wrong meaning.
  - "Latest finished" and "three latest finished" are ordered by what: finish time or request time? (SD 164 says "latest finished run" only.) T4-AC02/AC05 fixtures will set both.
- Guidance: list the three strip labels, the warning heading and both reason texts, the order of names, the ordering key; state that where the mock-up differs the requirements win.

---

## 🟢 Nits

### N1. Backfill and its test: the form is not named

SD 26, 83–85, 89. "One set-based statement" and "the backfill gives the same values as the final-status path" need the migration to be a single `pgm.sql` statement that a test can run (the pattern exists in `tests/profile-ai-migration.integration.test.ts`: `createRequire(...)(migration).up({ sql })`). Say so, and say that the new ads of a run equal the number of ads whose earliest observing run (request time, then id) is that run. That makes the statement simple and shows both paths are equal by construction.

### N2. Where the count is computed inside the finish paths

SD 27. `finishRun` is used directly by tests (`execute-sync-run.integration.test.ts`, `request-sync.integration.test.ts`) to end runs, and `endFailedSyncRun` currently reads and writes without a transaction. Say whether the count is computed inside `finishRun`/its persistence function (one place, both paths and test helpers covered) or in the two callers. The first is the only way T1-AC03 holds for runs ended by test setup.

### N3. Details of a queued or running run: the "marked unavailable" figure, and a finished run with a null count

SD 96, 107–109; requirements T1-R13. T1-R13 gives "—" for new and changed while queued or running; the unavailable figure and its tooltip for such a run of an inferring source are not stated (SD item 3 of T2 lists four cases, none is "queued or running"). The same for a finished run left with a null new-ads count by the rollout window (SD 95 says "—", but not for the row's "+N nowe / N zmienione" pair).

### N4. Filter edge cases of the history read

SD 42–50. A multi-select with nothing chosen, and a list where all ids were dropped as unknown: the table says "unknown ids dropped" and default "all", so the second is "all". The first (user clears the last checked box) is not said; it should be "all", written as no key in the address. T3-R07 sets the state filter to "W kolejce, W toku" and T4-R06 sets the source filter to one source; neither says whether the other filters and `page` and `sync` are kept or reset. Reasonable reading: change only the named filter and drop `page`.

### N5. Decisions without a record of discarded options

SD 69–76 records only PS-D01 and PS-D02. Other choices the SD makes (a stored count for marked unavailable instead of a derived one, which cannot be derived; the strip computed on open instead of stored (SD 164, "owner, 2026-11-22"); one HTTP request per confirmation (SD 136); the fixed scope only on the panel path (SD 138); the history read without error text and diagnostics (SD 57)) carry no "options discarded, with reason or none recorded" line, which the readiness checklist asks for. The runner's reviewer treats a discarded option as a stop, so an unrecorded one cannot be tested against.

### N6. SD "Data" sentence mixes two mechanisms

SD 17: "guarded by an advisory lock per source and by unique partial indexes". The indexes in `1770000000014_sync_run_state.cjs` are per scope (one queued and one running run per scope). Exclusion per source comes from the transaction lock in `admitRun` and from the queue's `exclusivity` key. The concurrency answer for "storing new ads" (SD 82) relies on "no other run of the source saves observations meanwhile", which the code comments (`ASSUMPTION(oferty-pracy-2ba.5/ASM-1)`) say may not hold for runs requested before B5. Name the real mechanism and say the legacy case is accepted (for the count it only matters for runs not yet finished at migration time).

### N7. T5: where "Odśwież widok" goes, and stale references beyond the root README

SD 190–194. "Odśwież widok" today lives inside the removed summary block (`offers.vue` ~lines 305–315); T5-R01 keeps it and T5-AC01 tests it, so its place must be decided. SD 194 mentions only the README. `docs/architecture/README.md` (line 122) links to the three removed route files, `docs/specs/jobspy/local-development.md` (line 28) names the removed GET route, and `modules/sources/README.md` (lines 91–92) describes `readSyncState` and `readSourceCatalog`, which stay for the CLI and lose their route and page clients.

### N8. Ticket metadata

Export lines 8, 111, 161, 226, 283: nq3.3, nq3.4 and nq3.5 show `Spec:` = PRD.md, whereas the workflow says `spec_id` is the requirements path (nq3.1 and nq3.2 do this). The runner does not read `spec_id` (`metadata.*` carries the paths), so the effect is cosmetic. The export shows no `load_bearing` or `shared` metadata on the epic. The workflow asks preparation to record both at hand-off. With five tasks all repeating PS-AC01 and PS-AC02, an unset `shared` leaves a deviation that names either of them at exactly four other tasks, the runner's limit. Set `shared=PS-AC01,PS-AC02` and ask the owner for `load_bearing` at hand-off.

### N9. Size of T1

T1 combines two migrations' worth of data work (column, index, backfill, two finishing paths), two reads, and the biggest page of the epic (day groups, six filters with multi-select popovers, a pager with a typed-digit page list, drawer, tooltip placement, address sync). It has 12 criteria, under the workflow's 15, and each part is specified, but a single unattended run is heavy and sits on the critical path of all other tickets. Consider splitting the data part (migration, finish paths, reads, tests on a real database) from the page; nq3.2 and nq3.3 only need the first part for their server work.

### N10. Situations table coverage

SD 78–85, 118–123, 146–151. The tables cover the modules' operations. The routes that call them and the dialog's catalogue read have no row; the "Resource limit" cell of the T3 row ("at most the catalogue's sources per request") is not enforced for unknown ids (see M4).

---

## What I checked and found ready

- T1 contract for new ads is implementable as written: `source_run_seen` has `(run_id, source_ad_id)`, runs join to scopes for the source, and request time (`created_at`) plus `id` gives a total order; the SD's two finishing paths are the only two writers of a final status (`finish()` in `execute-sync-run.ts` and `endFailedSyncRun`; verified by search for `finishRun` and `UPDATE source_sync_runs`).
- `changed = revisions − new` matches how `saveBatch` counts revisions (a new ad always adds one).
- T2: `markAdsAbsentFromRunUnavailable` can return its row count; the marking already runs in the finishing transaction.
- T3: `requestSync`/`admitRun` already give "one unfinished run per source" under a transaction lock, with each source in its own transaction, so independent outcomes per source hold; Polish defaults (PHP, senior, 50, 5, 60) equal the stated limits; SOLID.Jobs, Himalayas and JobSpy scopes are already fixed PHP·senior.
- T5: the removal list matches the code (`server/api/sources/polish.post.ts`, `polish.get.ts`, `jobspy.get.ts`; the sync fields of `server/api/offers/index.get.ts`; the timer and import form of `offers.vue`); the CLI scripts use the module reads directly, so removing the routes does not break them.
- Ticket dependencies (.2 and .3 after .1, .4 after .1 and .3, .5 after .3) are consistent with the SD, and the anchors `#t1`–`#t5` exist in both documents.
