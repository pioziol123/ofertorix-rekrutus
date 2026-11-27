# A source is a page that keeps its own ads

Many companies publish their ads through an external service such as Ashby, Lever or Greenhouse, and the word "source" was being used for that service, for the company, for the company's careers page and for the code that fetches ads. We decided that a source is a page with ads from which the system fetches ads, and that a page is the source only of the ads kept on it. The reason is that the sync rules of the Sources module all speak about "the source" as one thing that is checked as a whole, and only a single page of ads can be checked as a whole.

## The decision

- **A source is a page with ads.** It may carry the ads of one company or of many; that difference does not matter. SOLID.Jobs, Zapier's list of ads on Ashby and the careers page of Skyro are sources of the same kind.
- **A page is the source of the ads kept on it.** A page that only displays ads taken from another place, or links to them, is not their source. `zapier.com/jobs` shows Zapier's Ashby list one to one, so the source is Zapier's list on Ashby.
- **The external service is not a source.** Ashby offers no single list of all its ads; every read names one company. The service is known to the code only and is not a concept of the application. Ashby's own list of ads, for its own vacancies, is a source like any other company's list.
- **The company is not a source.** The company is a property of an ad. One company may have several sources: PandaDoc has a list on Ashby and a list on Greenhouse; Tangem has a list on HiBob and two more ads only on its own page.
- **A page without ads of its own is not a source.** A catalogue of companies such as Async Jobs is a way of finding sources. A portal that links to other pages' ads, such as Scribble, is the source only of the ads it keeps itself.
- **The code that fetches ads is a connector.** One connector reads every source built the same way, so one connector serves all the company lists on Ashby. A new company list on a service that already has a connector is a new entry, not new code.

The definitions of [source and connector](../../GLOSSARY.md) are in the glossary.

## Considered options

- **The external service is the source, configured with a list of companies.** This was the owner's decision of 2026-11-22 and the shape of the epic `oferty-pracy-amk`. One company's list failing would make the whole sync of the service incomplete, so no company on that service would have its vanished ads detected; adding or removing a company would change the scope of the service's sync; the sync history would show one row for about forty companies.
- **The external service is the source and the company is the scope of a sync.** A scope today is a parameter given when a sync is requested, for example a technology and a seniority level on a job portal. A company's list is a lasting thing with a name and a fate of its own: it has to be stored for the daily schedule, it can stop existing (Fortris on BambooHR) or stand empty (Remote.com on Greenhouse). The service does not publish which companies use it, so the possible scopes could not be read from the source. "Scope" would come to mean two different things.
- **The company is the source.** A company is not an address to read from, and it may have two lists or none.

## Consequences

- The number of sources grows from about twenty-five to more than a hundred. How they are shown in the application and how they are all synced every day is not decided here.
- The same ad can arrive from two sources, for example from both PandaDoc lists. This is the case the application already handles: one job offer with several source ads.
- A task named after a service, such as "Konektor Ashby" in the epic `oferty-pracy-amk`, delivers a connector together with the sources it serves.
- The findings behind this decision, with the services and the companies on each, are in the [research on company career pages](../research/zrodla-firmowe-ats-2026-11-22.md). Its sentence "the platform is the source" records the earlier decision.

Decided by the owner on 2026-11-26 and 2026-11-27. It replaces the decision of 2026-11-22 that the recruitment platform is the source. Because a source is a single page that can be checked as a whole, every rule of the [Sources module](../../modules/sources/README.md) about syncs and about ads that disappeared holds for a company's list exactly as it holds for a job portal.
