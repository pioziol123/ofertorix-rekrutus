import { describe, expect, it } from 'vitest'
import type { AiConfiguration } from '../model-catalog.ts'
import {
  attemptCeiling,
  budgetMonth,
  chargeCeiling,
  chargeCost,
  toolCallFee,
} from './cost.ts'

const config: AiConfiguration = {
  model: 'gpt-test',
  version: 'prices-1',
  inputUsdPerMillion: '1.5',
  outputUsdPerMillion: '6',
  usdPln: '4.2',
  fxVersion: 'fx-1',
  maxInputTokens: 20000,
  maxOutputTokens: 6000,
}

describe('E01-AC02: cost arithmetic in millionths', () => {
  it('computes the cost of usage with six decimal places', () => {
    // (1000 * 1.5 + 500 * 6) / 1e6 USD = 0.0045 USD; * 4.2 = 0.0189 PLN
    expect(chargeCeiling(config, 1000, 500)).toBe('0.018900')
  })
  it('allows zero usage', () => {
    expect(chargeCeiling(config, 0, 0)).toBe('0.000000')
  })
  it('rounds an incomplete millionth up at each step', () => {
    // 1 input token: 1.5 millionths of USD -> 2; * 4.2 = 8.4 -> 9 millionths of PLN
    expect(chargeCeiling(config, 1, 0)).toBe('0.000009')
  })
  it.each([
    [-1, 0],
    [0, -1],
    [0.5, 0],
    [0, 1.5],
    [Number.MAX_SAFE_INTEGER + 1, 0],
    [0, Number.MAX_SAFE_INTEGER + 1],
    [Number.NaN, 0],
  ])('rejects token usage %s/%s', (input, output) => {
    expect(() => chargeCeiling(config, input, output)).toThrow(
      'Invalid token usage',
    )
  })
  it('reserves the cost of the recorded token caps', () => {
    // (20000 * 1.5 + 6000 * 6) / 1e6 USD = 0.066 USD; * 4.2 = 0.2772 PLN
    expect(attemptCeiling(config)).toBe('0.277200')
    expect(attemptCeiling(config)).toBe(
      chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens),
    )
  })
  it('uses the Europe/Warsaw month', () => {
    expect(budgetMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11')
    expect(budgetMonth(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07')
    expect(budgetMonth(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12')
    expect(budgetMonth(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01')
  })
})

describe('the cost of agent work with a paid tool, as research was settled (0mq.22)', () => {
  // The price list research had: 1 USD per million tokens each way, 4 PLN
  // per USD, web search at 0.01 USD per call, at most three calls.
  const agent: AiConfiguration = {
    model: 'gpt-4.1-mini',
    version: 'test',
    inputUsdPerMillion: '1',
    outputUsdPerMillion: '1',
    usdPln: '4',
    fxVersion: 'test',
    maxInputTokens: 100000,
    maxOutputTokens: 4000,
    toolCallUsd: '0.01',
    maxToolCalls: 3,
  }
  it('adds the price of the tool calls to the tokens, each rounded up on its own', () => {
    expect(toolCallFee(agent, 3)).toBe('0.120000')
    expect(toolCallFee(agent, 1)).toBe('0.040000')
    // A search alone (8100 input tokens with its fixed block, 50 output).
    expect(chargeCost(agent, { input: 8100, output: 50, toolCalls: 1 })).toBe(
      '0.072600',
    )
    // Search and synthesis.
    expect(chargeCost(agent, { input: 8300, output: 120, toolCalls: 1 })).toBe(
      '0.073680',
    )
    expect(chargeCost(agent, { input: 300, output: 120, toolCalls: 1 })).toBe(
      '0.041680',
    )
  })
  it('reserves the token caps and the most tool calls', () => {
    expect(attemptCeiling(agent)).toBe('0.536000')
    expect(
      attemptCeiling({ ...agent, model: 'gpt-6-luna', maxInputTokens: 500000 }),
    ).toBe('2.136000')
  })
  it('charges no tool without a tool price', () => {
    expect(toolCallFee(config, 3)).toBe('0.000000')
    expect(attemptCeiling(config)).toBe(
      chargeCeiling(config, config.maxInputTokens, config.maxOutputTokens),
    )
  })
})
