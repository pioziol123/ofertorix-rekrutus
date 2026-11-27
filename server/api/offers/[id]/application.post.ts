import { z } from 'zod'
import { OfferNotFound, startApplication } from '../../../../modules/offers'
import {
  answerRecruitmentRefusals,
  stageInput,
} from '../../../../modules/recruitments/index'
import { jsonBody } from '../../../utils/http'
import { recruitmentRoute } from '../../../utils/recruitments'

const body = z.object({ target: stageInput })

/**
 * The first move of an offer from offer details, which creates its
 * application (D5). The Recruitments refusals pass through unchanged; an
 * unknown offer adds `offer_not_found` (D13).
 */
export default recruitmentRoute(async (event) => {
  const offerId = getRouterParam(event, 'id') ?? ''
  const raw = await jsonBody(event)
  return answerRecruitmentRefusals(async () => {
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
