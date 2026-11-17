import { readOffer } from '../../../modules/offers'
export default defineEventHandler(async (event) => {
  const offer = await readOffer(getRouterParam(event, 'id') ?? '')
  if (!offer)
    throw createError({ statusCode: 404, statusMessage: 'Offer not found' })
  return offer
})
