# Foreign remote offers — requirements

On 2026-11-02 the owner approved fetching remote offers from foreign markets. In this respect this replaces the geographic block R-S03 of the previous feature. PHP/senior remain requirements; missing data remains an unknown.

- R-R01: Glassdoor, ZipRecruiter, Naukri, BDJobs and HelloWork can be activated manually in remote mode, with an explicit search market appropriate to the adapter. No schedule.
- R-R02: the country of the ad or of the company's seat does not prove a restriction on the place where work is performed. Foreign remote records are kept; the result of the source's filter does not prove full remoteness.
- R-R03: a separate assessment of whether work from Poland is possible: allowed / excluded / unknown, a justification and an evidence excerpt. An unambiguous restriction to another country means incompatibility; worldwide/Europe/EU/Poland means compatibility only in the context of the place where work is performed. A contradiction gives unknown with a message. Missing evidence does not cause rejection.
- R-R04: the assessment is visible in the list and in the details, without automatically hiding incompatible records. We keep the source record, history, gaps and diagnostics.
- R-R05: HTTP and process limits still apply. The pilot reports the true result; lack of access or a failure is not an empty success. LinkedIn and Indeed stay disabled in line with the earlier decisions.

Acceptance: tests of the BDJobs parameters and country, the source's remote flag, keeping foreign and unknown locations, positive/negative/contradictory evidence, UI rules, and the limits/isolation of existing tests.
