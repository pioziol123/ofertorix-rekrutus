# Module map

An **ad** is an entry published on a portal. A **job offer** groups the ads about the same recruitment. The Offers module is responsible for this grouping.

| Module                                                  | Main purpose                                                                                         | Target directory     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| [Offer sources](../../modules/sources/README.md)        | Fetches ads from portals and tracks changes to their content and availability.                       | `modules/sources/`   |
| [Offers](../../modules/offers/README.md)                | Lets the owner browse job offers and groups the ads about the same recruitment.                      | `modules/offers/`    |
| [Professional profile](../../modules/profile/README.md) | Lets the owner draft and confirm a description of experience, skills and expectations of a future job. | `modules/profile/`   |
| Matching                                                | Assesses how well an ad fits the confirmed professional profile, and justifies the result.           | `modules/matching/`  |
| Companies                                               | Gathers information about companies and records their roles in recruitments.                         | `modules/companies/` |
| [AI](../../modules/ai/README.md)                        | Runs AI tasks requested by other modules, returns the results and settles the costs.                 | `modules/ai/`        |
