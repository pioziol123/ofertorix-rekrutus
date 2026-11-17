# Just Join IT filtering parameters — 2026-11-03

The operator's public page code and JSON responses from the container were confirmed. [PHP page](https://justjoin.it/job-offers/all-locations/php), [fragment of the frontend filter mapping](https://justjoin.it/_next/static/chunks/30gohgkd8h2e6.js?dpl=19c2798).

The frontend maps the category to the `categories` array, a technology as `skills: [skill]`, `keywords: [skill]`, `keywordType: "skill"`, and levels to `experienceLevels`. In single trials, the values of one array passed as plain text API parameters did work:

- `categories=php&experienceLevels=senior`: 43 offers in this sample.
- `keywords=PHP&keywordType=skill&skills=PHP&experienceLevels=senior`: 49 offers, including some from the python category with the required PHP skill.
- The equivalent for Go: 72 offers, including some from the devops category requiring Go.
- `category=php` and `categories[]=php` did not filter by category — the response had a counter of 10000 and other categories. Do not use these variants.

Source endpoint: `https://justjoin.it/api/candidate-api/offers`. It is an observed application interface, not an official guaranteed integration contract. The counters change over time. The single trials covered three items each; a separate trial `itemsCount=50` returned 49 items for PHP Senior.

An important pagination detail: although all 49 items were returned, the API still pointed to `next.cursor=49`. The connector ends this scope when the number of distinct IDs matches `totalItems`; the absence of a null cursor does not force an extra empty page. At the 10000 boundary completeness remains unconfirmed. A wrong or repeating cursor, a counter change, an interruption and limits mean an incomplete run.
