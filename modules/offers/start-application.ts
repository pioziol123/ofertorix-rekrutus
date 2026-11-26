import {
  createApplication,
  type ApplicationStage,
  type Stage,
} from '../recruitments/index.ts'
import { readCurrentAds } from '../sources/index.ts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The offer does not exist, or its ID is not a UUID. */
export class OfferNotFound extends Error {
  constructor() {
    super('The offer does not exist')
  }
}

/**
 * The owner's first move of an offer, which creates its application (D5):
 * checks that the offer exists, then asks the Recruitments module to create
 * the application in the target stage at `now`, and returns its result.
 * The Recruitments refusals pass through unchanged. Ads are never deleted,
 * so the check guards no race and needs no shared transaction.
 */
export async function startApplication(
  offerId: string,
  target: Stage,
  now: Date = new Date(),
): Promise<ApplicationStage> {
  if (!uuid.test(offerId)) throw new OfferNotFound()
  const [ad] = await readCurrentAds([offerId])
  if (!ad) throw new OfferNotFound()
  return createApplication({ offerId: ad.id, target, now })
}
