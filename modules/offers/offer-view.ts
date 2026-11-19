import type { MatchingSummary } from '../matching/view.ts'
import type { Salary, SourceAdContent } from '../sources/index.ts'

export type { Salary }

/**
 * An offer as the list and the detail view show it: the ad's content in the
 * unified form of the Sources read, its version history and the summary of
 * its match assessment.
 */
export type OfferView = SourceAdContent & {
  revisions: { id: string; at: string }[]
  assessment?: MatchingSummary
}
