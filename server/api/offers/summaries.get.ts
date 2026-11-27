import { InvalidOfferIds, readOffersByIds } from '../../../modules/offers'
import { apiHandler } from '../../utils/http'

/**
 * The offers of the IDs in the query key `ids`, repeated or
 * comma-separated (lq3 D4): at most 100 UUIDs; more, or one that is not a
 * UUID, answers 422 with the code `invalid_input`. Missing offers are left
 * out.
 */
export default apiHandler(async (event) => {
  const raw = getQuery(event).ids
  const ids = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  try {
    return await readOffersByIds(ids)
  } catch (error) {
    if (error instanceof InvalidOfferIds)
      throw createError({
        statusCode: 422,
        statusMessage: 'invalid_input',
        data: { code: 'invalid_input' },
      })
    throw error
  }
})
