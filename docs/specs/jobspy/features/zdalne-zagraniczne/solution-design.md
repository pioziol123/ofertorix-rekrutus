# Foreign remote offers — solution design

Implements R-R01–R-R05. The source registry sets remoteOnly and searchCountry: Glassdoor UK, ZipRecruiter USA, Naukri India, BDJobs Bangladesh, HelloWork France. These are the portals' markets, not the candidate's declared places of work. The query has is_remote=true, location=null and the appropriate country_indeed. The other sources keep their current parameters. The fingerprint covers the new adapter version and the parameters.

The fork extends SourceRequest with a boolean is_remote and an optional location, and Country with Bangladesh, so that the existing BDJobs adapter is reachable. Schema2 stays compatible; the package gets version 1.4.1+oferty.3.

The new application module remote-eligibility uses conservative sentence patterns, without AI and without additional costs. It stores status, reason and evidence. It recognises a limited set of unambiguous English, Polish and French declarations; it is not a full natural language parser. Everything outside the recognised range stays unknown. Negations and contradictory declarations must not produce a false allowed. An explicit is_remote=false/hybrid means excluded for a fully remote query. is_remote=true alone is not enough for allowed. We do not use the source's country as a restriction.

Normalisation saves remoteEligibility in the revision payload. The projection and the UI expose the assessment and the evidence. For old records without an assessment, the projection computes it from the preserved sourceRecord, without rewriting history. Tests are written by a separate tester. The wheel is verified with hashes and a module comparison with the local fork, with no commit/push without separate authorisation.

Also in a domestic query, an explicit sourceRecord.is_remote=true allows a foreign record to be kept; the assessment of whether work from Poland is possible stays separate. The existing country filter remains for domestic queries and for records without confirmed remoteness.
