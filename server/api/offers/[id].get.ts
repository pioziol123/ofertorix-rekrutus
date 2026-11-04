import { readOffer } from '../../../lib/offers'
import { database } from '../../utils/database'
export default defineEventHandler(async (event) => {
  const offer = await readOffer(database, getRouterParam(event, 'id') ?? '')
  if (!offer)
    throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  return offer
})
