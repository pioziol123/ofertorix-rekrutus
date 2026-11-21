import type { OfferView } from '../offers/index.ts'
import { readLatestExecutions } from '../ai/index.ts'
import {
  activeExecutions,
  assessmentReservation,
  assessmentsConfigured,
  assignmentsInProgress,
} from './infrastructure/adapters/assessment-ai.ts'
import {
  assessmentState,
  assignedAssessmentState,
} from './domain/assessment-state.ts'
import { assignmentsWithoutOutcome } from './infrastructure/persistence/assessment-requests.ts'
import { latestOfAds } from './infrastructure/persistence/ratings.ts'
import {
  activeProfileVersion,
  currentAdVersions,
} from './read-assessment-inputs.ts'
import {
  matchingGroupLabels,
  type MatchingSummary,
} from './domain/assessment-view.ts'
/**
 * Adds to each offer the summary of its match assessment. Reads in bulk, a
 * fixed number of queries for any number of offers: the active profile
 * version, the current ad versions from the Sources read, the
 * assessments, and the state of their AI work from the AI read.
 */
export async function decorateMatching(
  offers: OfferView[],
): Promise<OfferView[]> {
  if (!offers.length) return []
  const activeId = (await activeProfileVersion())?.id ?? null
  const ids = offers.map((o) => o.id)
  const current = await currentAdVersions(ids)
  const rows = await latestOfAds(ids)
  // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the AI work of every request in
  // one public read.
  const executions = new Map(
    (
      await readLatestExecutions(
        rows
          .filter(
            (row) =>
              row.request_id && row.state !== 'excluded' && !row.assignment_id,
          )
          .map((row) => row.request_id),
      )
    ).map((execution) => [execution.operationId, execution]),
  )
  // Ads the Sources read no longer knows get no summary, as before.
  const byId = new Map(
    rows.filter((row) => current.has(row.id)).map((row) => [row.id, row]),
  )
  const percent = (value: unknown) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
      ? value
      : null
  return offers.map((offer) => {
    const row = byId.get(offer.id)
    if (!row?.request_id && !row?.score_id) return offer
    const calculation = row.calculation
    const parts = Array.isArray(calculation?.components)
      ? calculation.components
      : []
    const components = Object.fromEntries(
      Object.keys(matchingGroupLabels).map((key) => [
        key,
        percent(parts.find((c: { group: string }) => c.group === key)?.score),
      ]),
    ) as MatchingSummary['components']
    return {
      ...offer,
      assessment: {
        requestId: row.request_id ?? null,
        state: !row.request_id
          ? 'completed'
          : row.assignment_id
            ? assignedAssessmentState({
                assessment: row.assessed,
                message: row.failed,
              })
            : assessmentState(
                row.state,
                executions.get(row.request_id) ?? null,
              ),
        author: row.assessment_author ?? undefined,
        scoreId: row.score_id ?? null,
        rating: percent(calculation?.rating),
        completeness: percent(calculation?.completeness),
        stale:
          !!row.score_id &&
          (row.profile_version_id !== activeId ||
            row.ad_revision_id !== current.get(row.id)),
        components,
      },
    }
  })
}
/**
 * Whether groups of assessments can be requested, how many assessments are
 * in progress and the most one assessment of a group reserves. The count
 * of assessments with an assignment comes from the status read over the
 * assignments of Matching's assessments without an outcome (T8-R06); those
 * of the old way are counted by the AI read until task oferty-pracy-sq2.11.
 * ASSUMPTION(oferty-pracy-sq2.9/ASM-5): the count covers every assessment
 * of Matching in progress, not only those of the offers shown, as the
 * count before the task did.
 */
export async function matchingListStatus() {
  const profile = await activeProfileVersion()
  // ASSUMPTION(oferty-pracy-sq2.9/ASM-5)
  const pending =
    (await assignmentsInProgress(await assignmentsWithoutOutcome())) +
    (await activeExecutions())
  return {
    configured: assessmentsConfigured(),
    profileReady: profile !== null,
    pending,
    // ASSUMPTION(oferty-pracy-sq2.9/ASM-3)
    maximumCostPln: assessmentReservation(),
  }
}
