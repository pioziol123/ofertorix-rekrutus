import type { MatchingSummary } from '../../lib/matching/view.ts'
import type { RemoteEligibility } from '../../lib/sources/remote-eligibility.ts'

/** One salary variant of an offer, as the source states it. */
export type Salary = {
  from: number | null
  to: number | null
  currency: string | null
  period: string | null
  contract: string | null
  basis?: string | null
  origin?: 'employer' | 'portal_estimate' | 'unknown'
}

/** An offer as the list and the detail view show it. */
export type OfferView = {
  id: string
  title: string
  company: string
  url: string | null
  description: string
  skills: { name: string; optional: boolean | null }[]
  salaries: Salary[]
  locations: string[]
  seniority: string | null
  hours: string | null
  mode: string | null
  firstSeen: string
  lastSeen: string
  published: string | null
  validTo: string | null
  availability: string
  expired: boolean
  revisions: { id: string; at: string }[]
  source?: string
  qualificationUnknown?: string[]
  remoteEligibility?: RemoteEligibility
  assessment?: MatchingSummary
}
