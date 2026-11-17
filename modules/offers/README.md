# Offers

The Offers module lets the owner browse job offers: search the list, filter it, sort it and open an offer's details. In the target design it is also responsible for grouping the source ads of the same recruitment into one job offer; this part does not exist yet. This description gives the module's responsibility, the state of its implementation, the public operations, the directory layout and the dependencies. [Domain glossary](../../GLOSSARY.md) · [Module map](../../docs/architecture/moduly.md)

## Responsibility

A **source ad** is an entry on one portal with its own content and change history; the [Offer sources](../sources/README.md) module fetches and stores it. A **job offer** is a shared employment opportunity, to which several ads of the same recruitment may be linked. The Offers module is responsible for:

- **grouping ads into job offers**: establishing which ads concern the same recruitment, merging offers and splitting them at the owner's command;
- **browsing offers**: a list with view filters, sorting and pagination, offer details with the content change history, and the presentation of salaries, including whether a salary range meets the salary filter.

The module does not assess how well an offer fits the professional profile; that is the Matching module's job. The Offers module uses its result when filtering and sorting the list.

## Implementation state

- **Grouping is not implemented** and does not belong to the epic `oferty-pracy-0mq` (Code architecture fixes). Until then each source ad is shown as a separate offer, and the offer ID is the ad ID.
- **Reading ads is transitional.** The module reads the Sources tables directly and itself translates the saved ad content into the offer form. Task `oferty-pracy-0mq.6` replaces these queries with a public read of the Sources module and moves the content translation to the Sources module.
- **The match assessment result** in the list comes from the existing Matching read, until tasks `oferty-pracy-0mq.6` and `oferty-pracy-0mq.18`.
- **Filtering happens in memory** on the whole catalogue, which can have at most 10 000 ads; a larger catalogue ends the list read with an error.

## Public operations

The server and other modules import operations from `index.ts`. Views run in the browser, so they have a separate entry `view.ts`, which does not reach into server code.

| Operation                                                     | Entry      | Contract                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read list filters (`parseFilters`)                            | `index.ts` | Takes the list query parameters and returns the filters with default values. A value outside the allowed shape raises an error; the API route then responds with code 400. Minimum salary requires a currency and a period.                                                                                                                                                                                |
| Offer list (`listOffers`)                                     | `index.ts` | Takes the filters and returns a page of 20 offers without the description and history, with the salary match result for each of them, the total number of matching offers, the page number, the applied filters and the filter options gathered from the whole catalogue. A page beyond the last gives the last. Each offer carries a match assessment summary, which the assessment filters and the sort by rating use before pagination. |
| Offer details (`readOffer`)                                   | `index.ts` | Takes an ID and returns the offer with its current content and the list of content versions from the newest, without the content of earlier versions. An ID that is not a UUID or does not point to an offer gives no result.                                                                                                                                                                              |
| Ad projection (`projectOffer`)                                | `index.ts` | Transitional: Matching and Companies use it to translate a saved ad into the offer form. It goes away in task `oferty-pracy-0mq.6`.                                                                                                                                                                                                                                                                        |
| Filter form query (`offerFilterQuery`, `hasSalaryFilter`)     | `view.ts`  | Build the query parameters from the list form, leaving out the salary when that filter is off, and recognise whether a query contains a salary filter.                                                                                                                                                                                                                                                     |

Both entries also export the offer type (`OfferView`) and the salary type (`Salary`); `index.ts` additionally exports the filter and list page types.

Reads take no locks and run in the caller's transaction, if one is in progress.

## Directory layout

| Place                                               | Contents                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`, `view.ts`                               | Public entries: for the server and other modules, and for views.                                                                      |
| `list-offers.ts`, `read-offers.ts`, `read-offer.ts` | List, catalogue read and details operations.                                                                                          |
| `offer-view.ts`                                     | Offer and salary type shared by the operations.                                                                                       |
| `domain/`                                           | Rules on passed data: filters, salary match, filtering, sorting, pagination and filter options, the form query.                       |
| `infrastructure/adapters/`                          | Transitional read of the Sources tables and translation of ad content into an offer.                                                  |

Unit tests of the rules and a read test on an isolated database live in the module. The test of the API routes and the list page without login is cross-cutting and lives in the shared test directory.

## Dependencies

- **Offer sources**: ads and their versions (transitionally through the tables), source name catalogues and the assessment of remote work qualification.
- **Matching**: a bulk read of assessment summaries for the list and the list of states awaiting assessment.
- **Shared infrastructure**: database access through the shared accessor.

The offer API routes pass the query to the module's operation. The list route adds the source sync state and the match assessment state to the response; until tasks `oferty-pracy-0mq.6`, `oferty-pracy-0mq.16` and `oferty-pracy-0mq.18` this assembly stays in the route.

## Next steps

The module's next change is the move to the public read of the Sources module in task `oferty-pracy-0mq.6`. Grouping ads into job offers stays outside the epic `oferty-pracy-0mq` and requires separate preparation.
