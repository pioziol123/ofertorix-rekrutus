import { z } from 'zod'
import { OfferNotFound, startApplication } from '../../../../modules/offers'
import {
  answerRecruitmentRefusals,
  offerIdInput,
  stageInput,
} from '../../../../modules/recruitments/index'
import { recruitmentBody, recruitmentRoute } from '../../../utils/recruitments'

const body = z.object({ target: stageInput })

/**
 * The first move of an offer from offer details, which creates its
 * application (D5). The Recruitments refusals pass through unchanged; an
 * offer ID that is not a UUID is `invalid_input`, and an unknown offer adds
 * `offer_not_found` (D13).
 */
export default recruitmentRoute(async (event) => {
  const offerId = getRouterParam(event, 'id') ?? ''
  const raw = await recruitmentBody(event)
  return answerRecruitmentRefusals(async () => {
    // A malformed offer ID is malformed input (refusal table of D13).
    offerIdInput.parse(offerId)
    const { target } = body.parse(raw)
    try {
      return await startApplication(offerId, target)
    } catch (error) {
      if (error instanceof OfferNotFound)
        throw createError({
          statusCode: 404,
          statusMessage: 'offer_not_found',
          data: { code: 'offer_not_found' },
        })
      throw error
    }
  })
})
