import { createError, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { BudgetLimitError } from '../../modules/ai/index'
import { jsonBody } from './http'

/** The body of a change of an AI budget limit: the amount as typed. */
const limitBody = z.object({ amount: z.string().max(100) })

/**
 * Sets an AI budget limit (T13-R02, T13-R03) from the amount in the
 * request's body and answers 204. An amount the AI module refuses answers
 * 422 with its message for the owner (T13-R04); nothing changed.
 */
export async function setLimitFromBody(
  event: H3Event,
  set: (amount: string) => Promise<void>,
): Promise<null> {
  const { amount } = limitBody.parse(await jsonBody(event))
  try {
    await set(amount)
  } catch (error) {
    if (error instanceof BudgetLimitError)
      throw createError({
        statusCode: 422,
        statusMessage: 'Invalid amount',
        data: { message: error.message },
      })
    throw error
  }
  setResponseStatus(event, 204)
  return null
}
