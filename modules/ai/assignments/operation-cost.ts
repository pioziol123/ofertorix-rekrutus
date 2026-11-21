import { chargeCost } from '../domain/cost.ts'
import type { PriceList } from '../executors/declaration.ts'
import type { ExecutorUsage } from '../executors/outcome.ts'

/**
 * The actual cost of an operation from the usage its executor reported and
 * the price list saved when it started (T2-R04, ZA-R04), in złoty as a
 * decimal string: zero when nothing was sent or the executor has no price
 * list; the computed cost when every count is known and within the price
 * list's caps; otherwise null, an unknown cost, never zero. Calls of a paid
 * tool count only under a price list that prices one.
 */
export function actualCost(
  usage: ExecutorUsage,
  priceList: PriceList | null,
): string | null {
  if (!usage.sent || priceList === null) return '0.000000'
  const toolCalls = priceList.toolCallUsd ? usage.toolCalls : 0
  const { inputTokens, outputTokens } = usage
  if (inputTokens === null || outputTokens === null || toolCalls === null)
    return null
  if (
    inputTokens > priceList.maxInputTokens ||
    outputTokens > priceList.maxOutputTokens ||
    toolCalls > (priceList.maxToolCalls ?? 0)
  )
    return null
  return chargeCost(priceList, {
    input: inputTokens,
    output: outputTokens,
    toolCalls,
  })
}
