# Triage and match assessment — requirements

The owner's confirmed decisions remain valid. The rest of the description and the technical proposals need updating against the chosen scope and the state of the application, following the [work cycle](../../README.md#feature-work-cycle). The earlier acceptance of the package does not mean this draft is frozen.

Status: **working draft — to be refined before this feature is implemented**, 2026-10-31. A feature under the shared [PRD](../../PRD.md). Sources and owner's decisions: [PRD](../../PRD.md#sources-and-document-responsibilities). Technical design: [solution-design.md](solution-design.md). Terminology: [glossary](../../../../../GLOSSARY.md).

## Scope and dependencies

This document owns requirements R-03, R-12, R-13, R-14 and their ACs. Related: [profile](../profil/requirements.md), [offers](../oferty/requirements.md), [operations](../operacje/requirements.md). It does not take over the rules of other features. The actor is the owner; the scenarios are future criteria, not test results.

### R-03 — missing information and exclusions

An unknown alone does not reject an offer. A confirmed conflict with a must-have requirement blocks further automatic assessment; the saved reason is visible. This is not the owner's own decision to reject. When sources give conflicting variants and at least one meets the requirement, we treat that criterion as met, keeping the variants and an explicit discrepancy message. Such a case is neither an unknown nor a confirmed exclusion.

**AC-03:** an offer without a salary range or without confirmation of working from Poland stays saved, with a message to check it. A confirmed mismatch has the criterion and the evidence indicated; no automatic assessment is requested. Every offer already fetched remains available regardless of qualification, an AI error or expiry. For conflicting variants "remote" and "hybrid", with remote work required, the criterion is met, and the discrepancy stays visible together with the sources. We do not downgrade this qualification to "unknown" and do not require a manual resolution before it is accepted.

### R-12 — components and justifications

Triage uses the profile and the ads, without web search. AI proposes components: technologies, experience, conditions and career direction. Each shows the basis in the ad and the profile, match/confirmed absence/unknown, a justification, strengths and gaps.

**AC-12:** justifications can be traced to the input versions of the profile/ads. A technology absent from the CV is not described as a confirmed absence. An AI error does not change the decision to "rejected". Company research remains a separate result and does not silently change the meaning of the triage rating.

### R-13 — rating and completeness

Code calculates a rating of 0–100 from the assessments that can be established, using configurable weights: initially 40% technologies, 25% experience, 20% conditions, 15% career direction. Unknowns get neither a zero nor a guessed assessment. Completeness is a separate measure; with no basis the rating stays undetermined. Must-have requirements are checked separately.

**AC-13:** the same components and weights give the same result. Changing the weights alone recalculates the rating without an AI call and keeps the previous result. With a complete lack of basis, the absence of an assessment is visible, not 0/100. A high rating does not cancel an exclusion. Completeness takes into account the weights of the assessable criteria: with fully assessable technologies (40%) and experience (25%) and unknown conditions and direction it is 65%. We normalise the rating to the assessable part, with no zeros for unknowns. Completeness also takes into account the recognised part within a component: knowing the contract and the work mode while the pay/hours are unknown does not give full completeness of conditions. Skipped and explicitly indifferent criteria are distinguished according to the profile; missing data does not become a zero assessment.

#### Pay and the expected minimum (Q10)

If an offer has a comparable currency, period, contract and amount basis, the minimum criterion is met when the salary range includes an amount at least equal to the expectation. With a minimum of 25k and a salary range of 20–28k the offer meets the criterion, but we show partial coverage and that getting 25k is not guaranteed. A range entirely below the minimum does not meet the criterion; insufficient data stays an unknown.

**Additional AC-13 conditions:** a minimum of 25 and a salary range of 20–28 give a met criterion with a partial coverage message; a range of 20–24 does not meet it, 25–28 meets it. The comparison does not convert net/gross, currencies or periods by default.

### R-14 — history and manual assessments

Each assessment has input versions and a history to view. The owner can change an assessment. A later AI assessment can replace a manual one, keeping the earlier values. The owner's decision and the application state are independent.

**AC-14:** after a manual assessment and a reassessment by AI, the current AI result and both previous operations are visible in the history with the author and date. Notes, the decision and the application stage remain unchanged. A result for an old input cannot be presented as current for a new one.

## Open questions

Related: O-02, O-05, O-06. Details, consequences and how to close them: [shared register](../../open-decisions.md). We consider open questions when taking up this feature; the draft alone does not mean the implementation is ready.

## Execution stage — assessment on demand, 2026-11-03

The owner confirmed equal weights of criteria within groups. The first vertical stage covers the assessment of a single source ad on demand with an active, approved profile. Each request is a separate Batch batch, also for one offer; future grouping does not change the result contract. No automatic research and no triage schedule in this stage. Future offer merges will keep separate ad versions.

- AC-B1: a request requires an active profile and an explicit Batch price configuration; missing configuration sends no data. The input versions, the criteria and the model and price list configuration are saved.
- AC-B2: the reservation uses the budget shared with the CV. No funds leaves the request pending. Results are settled in the reservation month. A doubtful cost keeps the reservation.
- AC-B3: the sending state is durable before the request to create a batch. After an interruption or an ambiguous error we do not retry the paid request automatically. A known batch identifier allows further reading after a restart.
- AC-B4: results are assigned by custom_id, never by order. An error/expiry/refusal/incomplete response leaves previous assessments and decisions unchanged. A correct result has evidence in both input versions; a skill missing from the CV is an unknown.
- AC-B5: the details show the state (including that waiting may take up to 24h), the result, components, completeness, justifications and history. A change of input versions marks the assessment as stale without removing it.
- AC-B6: input and output files have limited retention; after the terminal result has been durably received we clean up the remote files, and a cleanup error is retried independently of the assessment.

The local check of must-have conditions recognises unambiguous, structured comparisons of pay and work mode. Free text of the other requirements stays to be checked if a conflict cannot be confirmed without guessing. An assessment is not a confirmation that all must-have requirements are met. An explicit conflict recognised locally blocks the request. Manual assessments, weight changes, bulk assessments and filtering the list by assessments are further parts of R-13/R-14 and are not considered completed by this stage.

## Assessments on the list and bulk requests — 2026-11-03

Scope of task 8kt.2: the owner compares saved offers and requests up to 100 assessments in one operation. It covers R-12–R-14 and the list review; manual assessments and weight editing remain in 8kt.3.

- AC-G1: the list shows the rating, completeness, components and freshness of the latest successful assessment, and the state of the last request. A new pending state/error does not remove an earlier result.
- AC-G2: you can filter by minimum rating, completeness and the four components, and by assessment state. Unknowns do not meet a threshold of 0; old assessments do not pass thresholds unless the stale state is explicitly selected. Sorting by match shows current known results before stale ones and those without a rating; equal values have a stable order.
- AC-G3: selecting the whole page covers only the visible items; the owner sees the total count and the maximum reservation before the request. Items can be selected on further pages, and changing the filters clears the selection. There is no default request for the whole database.
- AC-G4: the operation has an identifier that prevents re-sending after an HTTP response is lost. An offer already pending is reused; a locally excluded one gets a justification at no cost. New admitted offers go into a shared batch, each with a separate input, history and reservation.
- AC-G5: the reservation of the new admitted items is atomic for the group. If the budget is not enough for all of them, the group waits without partially reserved funds. After the budget is increased/renewed, the worker resumes the group. It does not automate retries of completed assessments.
- AC-G6: unordered results are assigned by custom_id. An error in one assessment does not block correct assessments of the other items. After an interrupted receipt, items already settled are not settled a second time. We delete the batch files only after all its items are durably completed.
- AC-G7: exceeding 100 items or 2 MiB of JSONL is rejected without new reservations and requests. Older single-offer requests and the CV import still work.

## Manual assessments and weight editing — stage 8kt.3, 2026-11-03

- AC-M1: the owner can create an assessment without a prior AI one, or correct an existing one at the criterion level. Each criterion has an assessment of 0–100 or an unknown; a known assessment requires a justification. The owner's own information can allow assessing a profile unknown — it stays explicitly the owner's assessment, not an AI confirmation or a profile change. The decision to apply stays separate.
- AC-M2: each operation creates an immutable revision with the author AI/owner/system, the input and weight versions, a justification and a predecessor. The current result in the list and in the details uses the same revision. Previous values can be browsed.
- AC-M3: a manual save requires indicating the current revision and the input versions; a concurrent change causes a conflict without losing the owner's own form. Repeating the same command does not create another revision. A fresh AI result can replace a manual assessment, in line with the owner's earlier decision. A result for an old input stays in the history and does not replace the current assessment for a new profile/ad.
- AC-M4: the global weights of the four groups can be set as integer percentages 0–100 summing to 100. Initially 40/25/20/15, internal criteria equal. A change creates a weights version and recalculates current assessments without AI and without a new budget reservation. The history and the source of the components are kept; unknowns do not become zeros. New AI results use the weights current at the time of publication.
- AC-M5: weight editing has version control and idempotency. Identical weights do not cause unnecessary recalculation. Historical results keep the old weights. Recalculation does not change the content of assessments, the profile, the offer version, decisions or recruitment processes.
