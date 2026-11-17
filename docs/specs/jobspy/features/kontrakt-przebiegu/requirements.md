# Indeed run contract — requirements

Selected for implementation 2026-11-02; [PRD](../../PRD.md), scope of diagnostics and structured export. One read concerns one explicit source and query; the first version is Indeed only.

- **R-K01:** the output names the source, the parameters needed to interpret the search, the start/finish time, and the contract and fork versions. It does not contain proxy configuration, secrets or the owner's profile.
- **R-K02:** a read distinguishes a completed query, a limited/uncertain result, a partial result and a failure. The reason — limit, no progress, page error or invalid records — is distinguishable. Completing the query does not prove full coverage of the source.
- **R-K03:** a valid response without results gives a completed read with an empty list; a block/error before the first offer gives a failure. An error after valid offers keeps them and gives a partial result. Skipped invalid records are counted; we do not assume that an unknown number of remaining results is zero.
- **R-K04:** a missing description is explicit per offer and summarised. If the client requests a filter this contract does not support, the input is rejected before the network instead of being silently ignored.
- **R-K05:** structured JSON keeps the location as an object, lists as lists, the date as ISO, unknowns as null, and the new salary information. The normalised record does not pretend to be the portal's original response.
- **R-K06:** an unexpected error does not carry the raw response, tokens or transport exception content into the output/logs. The standard `scrape_jobs` interface and its existing fields stay available; the new contract is an additional library entry point.

Acceptance on synthetic pages covers: an empty set, a result limit, an error on the first/a later page, an invalid record between valid ones, no cursor progress, a missing description, and export of nested fields. We make no live attempts. We do not implement saving to Postgres or automatic expiry of offers here.
