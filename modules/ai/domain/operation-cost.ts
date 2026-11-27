import { attemptCeiling, chargeCost } from './cost.ts'
import { money } from './money.ts'
import type { PriceList } from './price-list.ts'
import type { ExecutorUsage } from './usage.ts'

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
  if (!usage.sent || priceList === null) return money(0n)
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

/**
 * The potential cost of an operation under a price list (ZA-R04, T3-R02):
 * the cost of its caps of input, output and paid tool calls, in złoty as a
 * decimal string, as the old way reserves an attempt; zero for an executor
 * without a price list (T3-R03).
 */
export function potentialCost(priceList: PriceList | null): string {
  return priceList === null ? money(0n) : attemptCeiling(priceList)
}
