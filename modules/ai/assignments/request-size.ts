import type { ExecutorContent, PriceList } from '../executors/declaration.ts'

/**
 * Whether a request is larger than its price list covers: more UTF-8 bytes
 * than the price list's input cap in tokens. Bytes are a conservative
 * ceiling of the tokens a text takes, so the potential cost of the cap
 * covers the input of any request below it, as for today's refusal of an
 * oversized request. The size is that of the exact request the executor
 * sends, when it measures it; otherwise that of the content it would send.
 */
export function exceedsPriceList(
  content: ExecutorContent,
  priceList: PriceList,
  measured?: number,
): boolean {
  const size =
    measured ??
    Buffer.byteLength(
      JSON.stringify({
        instructions: content.instruction,
        input: content.input,
        schema: content.responseFormat,
        resultInstruction: content.agent?.resultInstruction,
      }),
    )
  return size > priceList.maxInputTokens
}
