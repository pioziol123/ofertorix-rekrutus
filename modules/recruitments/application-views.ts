import type { StageChoice } from './domain/stage-choices.ts'
import type { Stage } from './domain/stages.ts'
import type { PageSize } from '../../lib/paging.ts'

/**
 * The reads of the Recruitments module as a page receives them over HTTP:
 * moments are ISO text in UTC.
 */

/** One row of Moja lista: an application with its current stage. */
export type ApplicationListItem = {
  offerId: string
  stage: Stage
  stageChangedAt: string
}

/** One page of Moja lista, with the query as the read normalised it. */
export type ApplicationsPageView = {
  items: ApplicationListItem[]
  total: number
  page: number
  pages: number
  size: PageSize
  stage: StageChoice
}

/** An application with its note and its history of stages, newest first. */
export type ApplicationDetailsView = {
  offerId: string
  stage: Stage
  stageChangedAt: string
  note: string
  history: { stage: Stage; changedAt: string }[]
}
