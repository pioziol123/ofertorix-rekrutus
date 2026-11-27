/**
 * What the paid executor's single answer and agent session share of
 * OpenAI's Responses API: the endpoint, the key and what an error answer
 * means (solution design of epic sq2, "Contract: mapping of events to
 * outcomes").
 */

export const responsesUrl = 'https://api.openai.com/v1/responses'

/** The provider's secret, read when an operation starts. */
export const openAiKey = () => process.env.OPENAI_API_KEY

export const responsesHeaders = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

/** The error code of an error answer, when it gives one. */
function errorCode(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw)
    if (value !== null && typeof value === 'object' && 'error' in value) {
      const error = value.error
      if (error !== null && typeof error === 'object' && 'code' in error)
        return error.code
    }
  } catch {
    // An error answer that is not JSON names no code.
  }
  return undefined
}

/** Whether an error answer says the input exceeds the model's context. */
export const contextExceeded = (status: number, raw: string) =>
  status === 400 && errorCode(raw) === 'context_length_exceeded'

/** Whether a message of the answer holds the model's refusal. */
export function refused(output: unknown): boolean {
  return (Array.isArray(output) ? output : []).some(
    (item: unknown) =>
      item !== null &&
      typeof item === 'object' &&
      'type' in item &&
      item.type === 'message' &&
      'content' in item &&
      Array.isArray(item.content) &&
      item.content.some(
        (part: unknown) =>
          part !== null &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'refusal',
      ),
  )
}
