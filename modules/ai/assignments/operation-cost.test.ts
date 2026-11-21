import { describe, expect, it } from 'vitest'
import { aiCatalog } from '../model-catalog.ts'
import { actualCost } from './operation-cost.ts'

const agentPrices = aiCatalog.models.find((m) => m.model === 'gpt-6-luna')!
  .prices.agent!
const known = (inputTokens: number, outputTokens: number, toolCalls = 0) => ({
  sent: true,
  inputTokens,
  outputTokens,
  toolCalls,
})

describe('T2-R04: the actual cost of an operation from its usage and price list', () => {
  it('is zero when nothing was sent, or when the executor has no price list', () => {
    expect(
      actualCost(
        { sent: false, inputTokens: 0, outputTokens: 0, toolCalls: 0 },
        agentPrices,
      ),
    ).toBe('0.000000')
    expect(actualCost(known(10, 10), null)).toBe('0.000000')
    expect(
      actualCost(
        { sent: true, inputTokens: null, outputTokens: null, toolCalls: null },
        null,
      ),
    ).toBe('0.000000')
  })

  it('is computed from known counts within the caps, the paid tool calls included', () => {
    // 1000 × 0.10 + 100 × 0.50 USD per million, 2 searches × 0.01 USD, × 5.
    expect(actualCost(known(1000, 100, 2), agentPrices)).toBe('0.100750')
  })

  it('is unknown, never zero, when a count is unknown or beyond the caps', () => {
    expect(
      actualCost(
        { sent: true, inputTokens: 10, outputTokens: null, toolCalls: 0 },
        agentPrices,
      ),
    ).toBeNull()
    expect(
      actualCost(
        { sent: true, inputTokens: 10, outputTokens: 10, toolCalls: null },
        agentPrices,
      ),
    ).toBeNull()
    expect(
      actualCost(known(agentPrices.maxInputTokens + 1, 0), agentPrices),
    ).toBeNull()
    expect(actualCost(known(0, 0, 4), agentPrices)).toBeNull()
  })

  it('does not count tool calls under a price list that prices none', () => {
    const single = aiCatalog.models.find((m) => m.model === 'gpt-6-luna')!
      .prices.single!
    expect(
      actualCost(
        { sent: true, inputTokens: 1000, outputTokens: 100, toolCalls: null },
        single,
      ),
    ).toBe('0.000750')
  })
})
