import type { RemoteEligibility } from '../../lib/sources/remote-eligibility.ts'

/** One salary variant of an ad, as the source states it. */
export type Salary = {
  from: number | null
  to: number | null
  currency: string | null
  period: string | null
  contract: string | null
  basis?: string | null
  /** Who stated the amount: the employer, or the portal's own estimate. */
  origin?: 'employer' | 'portal_estimate' | 'unknown'
}

/** The content of an ad in the unified form of the Sources read. */
export type SourceAdContent = {
  /** The ad's identifier. */
  id: string
  /** The title, or `missingAdTitle` when the source gives none. */
  title: string
  /** The company name, or `missingAdCompany` when the source gives none. */
  company: string
  url: string | null
  /** Plain text, without markup. */
  description: string
  skills: { name: string; optional: boolean | null }[]
  salaries: Salary[]
  locations: string[]
  seniority: string | null
  hours: string | null
  mode: string | null
  /** First and last observation of the ad. */
  firstSeen: string
  lastSeen: string
  published: string | null
  validTo: string | null
  availability: string
  /** The expiry date passed before the moment of reading. */
  expired: boolean
  /** The source's name from the catalogues, for sources that have one. */
  source?: string
  qualificationUnknown?: string[]
  remoteEligibility?: RemoteEligibility
}

/** An ad with the identifier of the version its content comes from. */
export type SourceAd = SourceAdContent & { versionId: string }

/** One content version of an ad: its identifier and retrieval time. */
export type SourceAdVersion = { id: string; at: Date }

/** The identifier of an ad's current content version. */
export type CurrentAdVersion = { adId: string; versionId: string }

/** The title the read gives an ad whose source states no title. */
export const missingAdTitle = 'Stanowisko bez nazwy'

/** The company name the read gives an ad whose source states none. */
export const missingAdCompany = 'Firma niepodana'
