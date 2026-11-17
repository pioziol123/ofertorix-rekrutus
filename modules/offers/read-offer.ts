import { projectOffer } from './infrastructure/adapters/source-ad-projection.ts'
import {
  findCurrentAd,
  findRevisions,
} from './infrastructure/adapters/source-ads.ts'
import type { OfferView } from './offer-view.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads one offer with its current content and the history of its
 * revisions. Returns null for an id that is not a UUID or names no offer.
 */
export async function readOffer(id: string): Promise<OfferView | null> {
  if (!uuid.test(id)) return null
  const ad = await findCurrentAd(id)
  if (!ad) return null
  return projectOffer({ ...ad, revisions: await findRevisions(id) })
}
