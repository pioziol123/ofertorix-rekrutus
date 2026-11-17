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

/** The budget period of a moment: its month in Europe/Warsaw. */
export function budgetMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  return `${parts.find((v) => v.type === 'year')!.value}-${parts.find((v) => v.type === 'month')!.value}`
}

/** The reservation of one attempt: the cost of its recorded token caps. */
export function attemptCeiling(config: AiConfiguration): string {
  return chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens)
}
