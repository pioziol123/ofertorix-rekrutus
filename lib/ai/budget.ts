import type { PoolClient } from 'pg'
import type { AiConfiguration } from './configuration.ts'
import { ceil, decimal, million, money } from './money.ts'

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
export function budgetMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  return `${parts.find((v) => v.type === 'year')!.value}-${parts.find((v) => v.type === 'month')!.value}`
}
export async function reserve(
  client: PoolClient,
  config: AiConfiguration,
  now = new Date(),
  extraCost = '0',
) {
  const month = budgetMonth(now)
  await client.query(
    'INSERT INTO ai_budget_months(month,limit_pln) VALUES($1,100) ON CONFLICT DO NOTHING',
    [month],
  )
  await client.query(
    'SELECT month FROM ai_budget_months WHERE month=$1 FOR UPDATE',
    [month],
  )
  const cost = money(
    decimal(
      chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens),
    ) + decimal(extraCost),
  )
  const available = await client.query(
    `SELECT limit_pln-coalesce((SELECT sum(CASE WHEN state='settled' THEN actual_pln ELSE reserved_pln END) FROM ai_attempts WHERE month=$1),0) >= $2::numeric AS enough FROM ai_budget_months WHERE month=$1`,
    [month, cost],
  )
  return { month, cost, enough: available.rows[0].enough as boolean }
}
