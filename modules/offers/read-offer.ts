import { readAdVersionList, readCurrentAds } from '../sources/index.ts'
import type { OfferView } from './offer-view.ts'
import { toOffer } from './read-offers.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads one offer with its current content and the history of its
 * revisions. Returns null for an id that is not a UUID or names no offer.
 */
export async function readOffer(id: string): Promise<OfferView | null> {
  if (!uuid.test(id)) return null
  const [ad] = await readCurrentAds([id])
  if (!ad) return null
  const versions = await readAdVersionList(id)
  return toOffer(
    ad,
    versions.map((version) => ({
      id: version.id,
      at: version.at.toISOString(),
    })),
  )
}
