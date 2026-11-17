# Re-review after the Q1–Q15 resolutions

Status: **historical review; the recommendation to refine SDs globally was replaced by per-feature work**. The record of decisions Q1–Q15 remains current. The [new work cycle](README.md#feature-work-cycle) applies.

Original scope: a review of the documentation's consistency with the owner's latest decisions; not acceptance of the product or confirmation that the whole implementation is ready. Basis: the confirmations of Q1–Q15 and the correction of the Q7–Q8 discrepancy in the conversation. Work status: `bd show oferty-pracy-boe`.

## Moved decisions

| Decisions | Where the rules are maintained | Outcome of the agreement |
| --- | --- | --- |
| Q1–Q5 | [Profile, R-01](features/profil/requirements.md#r-01--professional-profile) | Text PDF/DOCX or pasting, no OCR, a proposal to approve. A re-import keeps the profile/preferences; a separate expectations form, skipping questions and coming back later. |
| Q6–Q10 | [Matching, R-03 and R-13](features/dopasowanie/requirements.md) | Weighted and partial completeness, no zeros for unknowns. A matching variant meets the criterion, with a discrepancy message. A minimum reachable within part of the salary range qualifies the offer, without a pay guarantee. |
| Q11 | [Companies/research, R-15](features/firmy-research/requirements.md#r-15--identity-and-roles-of-organisations) | Research of the available brand/agency even when the employer/client is unknown, without guessing the identity or carrying the scope over. |
| Q12 | [Offers, R-09](features/oferty/requirements.md#r-09--reversible-merge) | The owner settles the identity of active processes before a merge; separate applications and their data are not lost. |
| Q13 | [Operations, R-25](features/operacje/requirements.md#r-25--budget) | The reservation month is the cost month of the attempt; an uncertain reservation does not disappear, a new retry has a new reservation. |
| Q14–Q15 | [Recruitments, R-22–R-23](features/rekrutacje/requirements.md) | Explicit stages/outcomes, manual change, interviews/tasks separately; archiving instead of permanent deletion in v1. |

## Consistency fixed between documents

- Removed the outdated proposal to treat conflicting variants as an unknown; qualification and UI messaging now point to the same rule.
- Added research of a brand/agency and deduplication by the typed report target, instead of requiring an always-recognised organisation.
- Aligned the offer and recruitment documents: a merge must not remove a separate active application by assuming "always one process per offer".
- Replaced the open statements about the month boundary and stages with confirmed rules.
- Archiving is separate from source availability, expiry and the recruitment outcome. The PRD scope and the views account for the archive without permanent deletion.
- Kept one PRD and 10 requirements/solution-design pairs. The combined pair was not restored and the R/AC identifiers were not changed.

## Remaining gaps in the solution design

| Area | State and consequence |
| --- | --- |
| Exact calculator and filters (O-02) | Product rules confirmed. Before implementing the calculator, add unambiguous criterion units, internal weights, the behaviour of "does not matter", numerical examples and interdependent variants. The current SD description is a proposal, not a complete algorithm contract. |
| Offer/application relations and the report target (O-03) | Data preservation rules confirmed. The schema and commands must handle separate recruitments and reversible links precisely, and a report must point to an organisation or a brand. Requires refining the SD, without changing the accepted behaviour. |
| Conversion rate and paid call limit (O-04/O-06) | Cost month confirmed. What remains is the technical choice of a versioned conversion rate and hard input/output/tool limits. An estimate of the average cost does not prove an upper bound. |
| Owner's configuration (O-05) | Specific profile and scope values and the fetch time to be set before launch; automatic research thresholds after a sample of assessments. These values need not be invented when designing the form. |
| Technical verification (O-06) | Versions, extraction libraries, migrations, timeouts and queue retention to be chosen and checked. AI access, costs and quality still unmeasured. |

These are further documentation/design work, not approved implementation tasks. In line with the owner's later decision we return to these contracts only when the relevant feature is chosen. A review of its requirements and SD precedes code, but does not require the whole package to be completed first.

## Verification boundaries

Checked: local links and anchors, single ownership of the 30 requirements/ACs and their mention in the correct SDs. The criteria remain a plan for future tests. No application tests, paid calls, deployment, commit or push were made.
