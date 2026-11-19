# Offer sources

The Offer sources module is responsible for obtaining ads from external sources and keeping their content, origin, change history and availability information. It provides the other parts of the system with data for browsing and assessing offers. The description below sets out the module's responsibilities and the rules for interpreting fetched results.

## What the module covers

The basic object is the **source ad**, i.e. a specific entry published in one source. The same recruitment may be advertised in several places. Each of these ads has its own content, link, history and availability; a change to one does not settle the state of the others.

The module provides a catalogue of supported sources, lets you request a fetch of ads and check its progress and result. It stores the ads found and allows reading their current content and earlier versions.

Linking several ads to one job offer and presenting that offer belong to the Offers module. The Matching module uses the ad content when assessing the fit with the professional profile, and the Companies module when linking ads with organisations. Offer sources provide them with information about publications; it does not decide for them the assessment of an offer or the identity of the employer.

## How fetching works

Fetching concerns a chosen source and a set **scope**. The scope defines which ads are to be checked, for example through a choice of technology, experience level and limits on the number of results. It is set for a given run, so that its result can be related to what was actually meant to be fetched.

An **ad sync** is one execution of such a fetch. Results may arrive in many portions. The module keeps valid ads as they are received, so a later error does not wipe out the data already collected.

| Run state   | Meaning                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Pending     | The fetch has been requested and is waiting to start.                                                     |
| In progress | Fetching and saving of results is under way.                                                              |
| Complete    | The whole set scope was checked.                                                                          |
| Partial     | Useful results were obtained, but the whole scope was not checked or completeness could not be confirmed. |
| Failed      | No useful results could be obtained.                                                                      |

A complete run does not have to mean that all ads existing in a given source were fetched. Completeness refers to the set scope, not to the whole offer market. The result of a limited search may be complete and still not be enough to establish that another ad was removed.

Sources differ in how they provide data and in the information they pass on. The module takes these differences into account when fetching, but provides the ads in a consistent form, keeping their origin. If a source does not provide some information, its absence stays an unknown.

## Ad identity and history

An ad is recognised by its source and the ID given to it in that source. Fetching the same ad again, also in a different search scope, updates the existing record.

When an ad's content changes, the module keeps the new version without deleting the previous ones. Fetching identical content again does not create another version. This way the history shows changes to the publication, not just the fetch frequency.

Regardless of content changes, an **observation** is recorded: the information that a specific ad was found in a given run. An ad can therefore be observed again without a new version being created. Observations later make it possible to establish which known ads appeared in the sync results.

## How availability is established

Availability concerns a specific ad in its source. We establish it based on information about an ad that was found or, under specific conditions, on its absence from the results. These two situations require different grounds for a decision.

### Information about an ad that was found

Finding an ad in the results of active offers makes it possible to confirm its availability already during the fetch, also when the whole run ends as partial. There is no need to wait for the other ads to use information the source has already passed on.

However, the source returning the content does not always mean that the ad is still active. A source may also provide closed publications or ones whose validity date has already passed. That is why the given status and validity date must be taken into account together with the observation. The presence of an ad in the response does not cancel the information that it has expired.

Information that refers directly to a specific ad does not require a complete sync. If the source gives a validity date, its passing makes it possible to state expiry. If it gives neither a date nor a closed status, this information must not be filled in by guesswork.

### Ad missing from the results

Not finding an ad is not by itself evidence that it is unavailable. It may have been in the part of the results that was not fetched, outside the search scope or beyond the source's response limit.

For sources that allow conclusions to be drawn from an ad's absence, the module makes a separate assessment after the fetch ends. Marking an ad as unavailable requires all of the following:

- confirmation that the run was complete;
- the possibility of inferring unavailability from absence in the results of the given source;
- a comparison of the ads and observations concerning the same source and scope.

Whether an ad belonged to the scope is decided by the history of its observations in runs of that scope, not by the scope in which it was last seen. An ad seen earlier in the scope and absent from a complete run of that scope becomes unavailable. A later observation in any scope restores its availability.

If any of these conditions is not met, a missing observation leaves the ad's current availability unchanged. This applies both to a partial fetch and to a complete search whose results are not a basis for detecting removed ads.

### Example: an interrupted fetch

Suppose ad A was previously unavailable and ad B available. During the next fetch the source returned A as active, but the fetch was interrupted before it reached all the results.

A can be marked as available again: we have new information about its presence. B keeps its current state, because we do not know whether it disappeared or was in the part that was not fetched. Only a full check of the relevant scope, for a source that allows such inference, makes it possible to treat B's absence as grounds for unavailability.

## How to interpret the result

The module provides the ad content together with its history and information about what could be checked. The results of a partial fetch stay useful, but do not allow conclusions about the fate of the ads that were not found.

Unavailability at the source, expiry of an ad and the end of a recruitment are separate pieces of information. The removal or expiry of one publication does not settle the state of the other ads of the same offer or the end of the user's application. An ad's history stays available even when the publication itself is no longer active.

## Requesting a sync

The CLI, the application and the schedule request a sync through one operation and share one queue of runs. Its rules ([F2-06–F2-10](../../docs/specs/0mq-architektura-modulow/requirements.md#f2)) hold for every source:

- A source executes one run at a time, whatever the scope; its runs wait in the order they were requested. Different sources run in parallel. A request never interrupts a run in progress.
- A scope has at most one pending run. A request that meets it creates nothing and points at it; with a run in progress and none pending, the request creates the pending one.
- The run's settings are fixed when it is requested. Equivalent parameters, in any order and from any entry point, are the same scope.
- The schedule requests each scheduled source (today SOLID.Jobs) once per schedule day. A manual request does not hold it back, and fetching again on the same day is allowed.

| Operation                                                  | Contract                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request (`requestSync`)                                    | Takes the source name, the source-specific scope input and the reason. Returns the run identifier at once and whether an existing pending run was pointed at. An unknown source (`UnknownConnectorError`), a disabled source (`SourceDisabledError`) and an invalid scope input end with an error and create nothing. |
| Schedule (`requestScheduledSyncs`)                         | Requests every enabled scheduled source whose schedule day has no scheduled run yet. Safe to call from several workers at once.                                                                                                                                                                                       |
| Wait (`waitForSyncRun`)                                    | Reads the run every second, with no time limit, until it finishes, and returns it. Stopping the wait does not change the run.                                                                                                                                                                                         |
| Run state (`readSyncState`)                                | The state of a source: whether it is enabled and scheduled, a run by its identifier or the latest one, and the latest complete run; for the whole source or, given a scope input, for that scope.                                                                                                                     |
| Catalogue state (`readSourceCatalog`)                      | Every JobSpy and Polish portal with its catalogue data and its latest run.                                                                                                                                                                                                                                            |
| Queue (`useSyncQueue`, `workSyncQueue`, `recoverSyncRuns`) | Connect the process's queue client, have a worker execute runs, and end runs that no work will execute any more.                                                                                                                                                                                                      |

## Public read of ads

Other modules read ads only through these operations, exported from the module's `index.ts`. They do not query the module's tables and do not interpret the content saved from a source.

| Operation                                  | Contract                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current ads (`readCurrentAds`)             | Takes a list of ad identifiers and returns those ads with their current content, in one query; unknown identifiers are skipped. Without a list it returns the whole catalogue and raises an error when it holds more than 10 000 ads. |
| Given versions (`readAdVersions`)          | Takes a list of version identifiers and returns, in one query, each version's content with its ad's identifier, observation dates, availability and expiry. Unknown identifiers are skipped.                                          |
| List of versions (`readAdVersionList`)     | Takes an ad identifier and returns the identifier and retrieval time of each of its versions, newest first.                                                                                                                           |
| Current versions (`readCurrentAdVersions`) | Takes a list of ad identifiers and returns, in one query, the identifier of each ad's current version.                                                                                                                                |

An ad in the response carries its identifier, the identifier of the version its content comes from (`versionId`) and the content in a unified form: title, company, link, description as plain text, skills, salaries with the origin of the amount, locations, level, working time, work mode, publication date, expiry date, availability, the first and last observation, whether it has expired, and, for sources in the catalogues, the source name and the remote-work qualification. The module translates the content saved from the source into this form when it reads it, because the saved content stays in the source's own form. An ad has expired when its expiry date passed before the moment of reading.

A title or company name that the source does not give as non-empty text comes back as the fixed text `missingAdTitle` ("Stanowisko bez nazwy") or `missingAdCompany` ("Firma niepodana"); spaces at the ends are removed. A consumer that must tell a missing value apart compares with these exported constants.

The reads take no row locks, so reading never delays a sync. A consumer that needs content and version to match reads the current version first and then the content of that version: the content then always belongs to the version it records, even when the ad changes in between.

## Entries and directory layout

Besides the operations above, `index.ts` exports what the CLI scripts, the routes and the worker check or parse before they request a sync: the names of SOLID.Jobs and Himalayas, the JobSpy portal parser and its enabled check, the Polish portal scope input and its enabled check, the schedule day, and the connector registry the server builds at start. Views run in the browser, so they have a separate entry `view.ts`, which does not reach into server code: the Polish portal type and the label of the remote-work qualification.

| Place                         | Contents                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| operation files               | Requesting, executing, recovering and reading runs, saving batches and reading ads.                                   |
| `domain/`                     | The ad projection, the source catalogues, the remote-work qualification, the run status and the schedule day.         |
| `infrastructure/adapters/`    | The connector contract and registry, and one directory per connector with its portal client or helper process runner. |
| `infrastructure/persistence/` | Source ads and sync runs.                                                                                             |
| `infrastructure/worker/`      | The sync queue.                                                                                                       |
