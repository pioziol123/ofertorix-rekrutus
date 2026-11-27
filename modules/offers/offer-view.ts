import type { MatchingSummary } from '../matching/view.ts'
import type { Stage } from '../recruitments/view.ts'
import type { Salary, SourceAdContent } from '../sources/index.ts'

export type { Salary }

/**
 * An offer as the list and the detail view show it: the ad's content in the
 * unified form of the Sources read, its version history, the summary of
 * its match assessment and, on the list, the stage of its application,
 * absent when the offer has none (lq3 T3).
 */
export type OfferView = SourceAdContent & {
  revisions: { id: string; at: string }[]
  assessment?: MatchingSummary
  stage?: Stage
}

/**
 * An offer as Moja lista and the application details show it (lq3 D4): its
 * title, company, salary ranges and availability at the source.
 */
export type OfferSummary = Pick<
  SourceAdContent,
  'id' | 'title' | 'company' | 'salaries' | 'availability'
>
