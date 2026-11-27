# Module map

An **ad** is an entry published in a source. A **job offer** groups the ads about the same recruitment. The Offers module is responsible for this grouping.

| Module                                                  | Main purpose                                                                                         | Target directory     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| [Sources](../../modules/sources/README.md)        | Fetches ads from sources and tracks changes to their content and availability.                       | `modules/sources/`   |
| [Offers](../../modules/offers/README.md)                | Lets the owner browse job offers and groups the ads about the same recruitment.                      | `modules/offers/`    |
| [Professional profile](../../modules/profile/README.md) | Lets the owner draft and confirm a description of experience, skills and expectations of a future job. | `modules/profile/`   |
| [Matching](../../modules/matching/README.md)            | Assesses how well an ad fits the confirmed professional profile, and justifies the result.           | `modules/matching/`  |
| [Companies](../../modules/companies/README.md)          | Gathers information about companies and records their roles in recruitments.                         | `modules/companies/` |
| [AI](../../modules/ai/README.md)                        | Runs AI tasks requested by other modules, returns the results and settles the costs.                 | `modules/ai/`        |
| [Recruitments](../../modules/recruitments/README.md)    | Keeps the owner's applications to offers: their stages, the history of stages and the note.          | `modules/recruitments/` |

Outside the modules, the worker (`worker/`) carries out the queue jobs each module registers in its module plugin (`plugins/`), and the periodic process (`periodic/`) repeats a pass of periodic operations: it calls the public operations of the AI module (sending operations waiting for the budget once it has room, failing assignments past their time limit) and the Sources module (the daily sync request).
