import type { AiConfiguration } from '../model-catalog.ts'
import { ceil, decimal, million, money } from './money.ts'

/** The PLN cost of the given token usage, rounded up at each step. */
export function chargeCeiling(
  config: AiConfiguration,
  input: number,
  output: number,
): string {
  if (
    !Number.isSafeInteger(input) ||
    input < 0 ||
    !Number.isSafeInteger(output) ||
    output < 0
  )
    throw new Error('Invalid token usage')
  const usd = ceil(
    BigInt(input) * decimal(config.inputUsdPerMillion) +
      BigInt(output) * decimal(config.outputUsdPerMillion),
    million,
  )
  return money(ceil(usd * decimal(config.usdPln), million))
}

/**
 * The PLN price of the given calls of the price list's paid tool, rounded
 * up once; zero when the price list covers no paid tool.
 */
export function toolCallFee(config: AiConfiguration, calls: number): string {
  if (!Number.isSafeInteger(calls) || calls < 0)
    throw new Error('Invalid tool calls')
  if (!config.toolCallUsd) return money(0n)
  return money(
    ceil(
      BigInt(calls) * decimal(config.toolCallUsd) * decimal(config.usdPln),
      million,
    ),
  )
}

/**
 * The PLN cost of a usage: its tokens and its calls of the paid tool, each
 * rounded up on its own and then added, as research was settled before.
 */
export function chargeCost(
  config: AiConfiguration,
  usage: { input: number; output: number; toolCalls: number },
): string {
  return money(
    decimal(chargeCeiling(config, usage.input, usage.output)) +
      decimal(toolCallFee(config, usage.toolCalls)),
  )
}

/** The budget period of a moment: its month in Europe/Warsaw. */
export function budgetMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  return `${parts.find((v) => v.type === 'year')!.value}-${parts.find((v) => v.type === 'month')!.value}`
}

/**
 * The reservation of one attempt: the cost of its recorded token caps and
 * of the most calls of its paid tool.
 */
export function attemptCeiling(config: AiConfiguration): string {
  return chargeCost(config, {
    input: config.maxInputTokens,
    output: config.maxOutputTokens,
    toolCalls: config.maxToolCalls ?? 0,
  })
}
