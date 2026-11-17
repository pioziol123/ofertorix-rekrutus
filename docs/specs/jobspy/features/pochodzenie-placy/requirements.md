# Indeed salary origin — requirements

Status: selected for implementation 2026-11-02 on the basis of the [PRD](../../PRD.md). Scope: reading data already provided by the adapter, without running against the portal and without financial qualification in the application.

## Rules and acceptance criteria

- **R-P01 — origin.** The salary has an independent mark: employer, portal estimate or undetermined. When the chosen amount comes from `baseSalary`, the output indicates the employer; when from `estimated.baseSalary`, it indicates an estimate. The old `salary_source`, which describes the extraction method, does not replace this information.
- **R-P02 — amount selection.** Valid employer data takes precedence. When the employer's salary object is missing, the estimate is used, as before. We do not change the selection rules for an invalid or unsupported period; in that case we do not derive a credible amount. Missing both amounts remains an unknown, and zero is not a missing value.
- **R-P03 — evidence of origin.** If the source passed salary data, the output keeps the original values, period and currency of both the employer's amount and the estimate, if available. This also applies to an unsupported period. When all salary data is missing, the evidence is empty. We do not assign gross/net, VAT or contract type on the basis of guesses.
- **R-P04 — export and conversions.** The origin data passes from the adapter through the `scrape_jobs` output and the full JSON export without being turned into text. Annualising amounts does not change the evidence containing their original values and period. The existing fields stay available; the new ones are an addition. For adapters other than Indeed, the origin stays undetermined until they are adapted separately.
- **R-P05 — offline verification.** The cases employer, estimate, both, none, single amount, zero and unsupported period have checkable results without network access. The test of passing data to the table and the export uses a substituted adapter response and does not query the portal.

Out of scope: changing the application's filters, a new export covering run quality, filling in currencies/contracts, a parser for Polish salary ranges from descriptions, and adapting the other portals. Live access remains a separate condition of the initiative and does not block this offline change.
