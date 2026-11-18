/**
 * Whether a request's input is larger than the input cap of its price
 * list. UTF-8 bytes of the instruction, the input and the response schema
 * are a conservative ceiling of the tokens they take, so a reservation of
 * the cap covers the input of any request below it.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-5): checked for a request that asks
 * for it, as Matching's assessments always were refused above the cap.
 */
export function exceedsInputCap(
  request: {
    instruction: string
    input: string
    responseSchema: { name: string; schema: Record<string, unknown> }
  },
  maxInputTokens: number,
): boolean {
  return (
    Buffer.byteLength(
      JSON.stringify({
        instructions: request.instruction,
        input: request.input,
        schema: request.responseSchema,
      }),
    ) > maxInputTokens
  )
}
