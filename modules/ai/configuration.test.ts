import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiConfiguration } from './configuration.ts'
import { executionSettings } from './execution-settings.ts'
import { AiRequestError } from './errors.ts'

const pricing = {
  model: 'gpt-test',
  version: 'prices-1',
  inputUsdPerMillion: '0.25',
  outputUsdPerMillion: '2',
  usdPln: '4.1',
  fxVersion: 'fx-1',
  maxInputTokens: 20000,
  maxOutputTokens: 6000,
}
const variables = [
  'AI_PROFILE_PRICING_JSON',
  'AI_MATCHING_PRICING_JSON',
  'AI_RESEARCH_PRICING_JSON',
] as const

afterEach(() => vi.unstubAllEnvs())

describe('E01-AC01: one configuration read for every consumer', () => {
  describe.each(variables)('%s', (variable) => {
    it('reads a valid price list', () => {
      vi.stubEnv('OPENAI_API_KEY', 'key')
      vi.stubEnv(variable, JSON.stringify(pricing))
      expect(aiConfiguration(variable)).toEqual(pricing)
    })
    it('is not configured without the API key or the variable', () => {
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv(variable, JSON.stringify(pricing))
      expect(aiConfiguration(variable)).toBeNull()
      vi.stubEnv('OPENAI_API_KEY', 'key')
      vi.stubEnv(variable, '')
      expect(aiConfiguration(variable)).toBeNull()
      vi.stubEnv(variable, undefined)
      expect(aiConfiguration(variable)).toBeNull()
    })
    it.each([
      ['invalid JSON', '{broken'],
      ['JSON null', 'null'],
      ['an unknown field', JSON.stringify({ ...pricing, extra: 1 })],
      ['a missing key', JSON.stringify({ ...pricing, fxVersion: undefined })],
      ['a wrong type', JSON.stringify({ ...pricing, maxInputTokens: '20000' })],
      ['an empty model', JSON.stringify({ ...pricing, model: '' })],
      ['a zero price', JSON.stringify({ ...pricing, inputUsdPerMillion: '0' })],
      ['a zero rate', JSON.stringify({ ...pricing, usdPln: '0.000000' })],
      [
        'a negative price',
        JSON.stringify({ ...pricing, outputUsdPerMillion: '-1' }),
      ],
      [
        'seven fraction digits',
        JSON.stringify({ ...pricing, usdPln: '4.1234567' }),
      ],
      [
        'seven integer digits',
        JSON.stringify({ ...pricing, usdPln: '1234567' }),
      ],
      [
        'a fractional token cap',
        JSON.stringify({ ...pricing, maxInputTokens: 1.5 }),
      ],
      [
        'zero output tokens',
        JSON.stringify({ ...pricing, maxOutputTokens: 0 }),
      ],
      [
        'input tokens above the cap',
        JSON.stringify({ ...pricing, maxInputTokens: 2000001 }),
      ],
      [
        'output tokens above the cap',
        JSON.stringify({ ...pricing, maxOutputTokens: 6001 }),
      ],
    ])('rejects %s', (_, value) => {
      vi.stubEnv('OPENAI_API_KEY', 'key')
      vi.stubEnv(variable, value)
      expect(aiConfiguration(variable)).toBeNull()
    })
    it('accepts the token caps at their limits', () => {
      vi.stubEnv('OPENAI_API_KEY', 'key')
      const limits = {
        ...pricing,
        maxInputTokens: 2000000,
        maxOutputTokens: 6000,
      }
      vi.stubEnv(variable, JSON.stringify(limits))
      expect(aiConfiguration(variable)).toEqual(limits)
    })
    it('reads the environment again on every call', () => {
      vi.stubEnv('OPENAI_API_KEY', 'key')
      vi.stubEnv(variable, JSON.stringify(pricing))
      expect(aiConfiguration(variable)?.model).toBe('gpt-test')
      vi.stubEnv(variable, JSON.stringify({ ...pricing, model: 'gpt-next' }))
      expect(aiConfiguration(variable)?.model).toBe('gpt-next')
      vi.stubEnv(variable, '')
      expect(aiConfiguration(variable)).toBeNull()
    })
  })
  it('defaults to the profile price list', () => {
    vi.stubEnv('OPENAI_API_KEY', 'key')
    vi.stubEnv('AI_PROFILE_PRICING_JSON', JSON.stringify(pricing))
    expect(aiConfiguration()).toEqual(pricing)
  })
})

describe('provider and model chosen for an execution request', () => {
  const endpoint = {
    ref: 'paid',
    version: 1,
    url: 'https://paid.test/v1',
    credentialEnv: 'PAID_KEY',
  }
  const selection = (overrides = {}) =>
    JSON.stringify({
      version: 1,
      provider: 'openai',
      model: 'gpt-test',
      execution: 'direct',
      endpointRef: 'paid',
      endpointVersion: 1,
      runtimeParameters: {},
      ...overrides,
    })
  const refused = (code: string) => expect.objectContaining({ code })

  it('uses the job type price list on the default endpoint without a selection', () => {
    vi.stubEnv('OPENAI_API_KEY', 'key')
    vi.stubEnv('AI_RESEARCH_PRICING_JSON', JSON.stringify(pricing))
    expect(executionSettings('research', 'agent')).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      endpoint: null,
      endpointRef: null,
      endpointVersion: null,
      maxOutputTokens: 6000,
      pricing,
    })
  })
  it('uses an explicit selection with its endpoint and matching prices', () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    vi.stubEnv('PAID_KEY', 'secret')
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', selection())
    vi.stubEnv('AI_PROFILE_PRICING_JSON', JSON.stringify(pricing))
    expect(executionSettings('profile', 'single')).toMatchObject({
      provider: 'openai',
      endpoint: { url: 'https://paid.test/v1', credentialEnv: 'PAID_KEY' },
      endpointRef: 'paid',
      endpointVersion: 1,
      pricing,
    })
  })
  it('refuses a missing or inconsistent configuration', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(() => executionSettings('profile', 'single')).toThrow(
      refused('not_configured'),
    )
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', '{broken')
    expect(() => executionSettings('profile', 'single')).toThrow(
      refused('not_configured'),
    )
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    vi.stubEnv('PAID_KEY', 'secret')
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', selection())
    vi.stubEnv(
      'AI_PROFILE_PRICING_JSON',
      JSON.stringify({ ...pricing, model: 'other' }),
    )
    expect(() => executionSettings('profile', 'single')).toThrow(
      refused('not_configured'),
    )
  })
  it('refuses a mode the selected execution does not offer', () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    vi.stubEnv('PAID_KEY', 'secret')
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', selection())
    vi.stubEnv('AI_PROFILE_PRICING_JSON', JSON.stringify(pricing))
    expect(() => executionSettings('profile', 'batch')).toThrow(
      new AiRequestError('unsupported_mode'),
    )
  })
  it('refuses the local provider until it joins the coordination', () => {
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, ref: 'local', credentialEnv: null }]),
    )
    vi.stubEnv(
      'AI_PROFILE_EXECUTION_JSON',
      selection({
        provider: 'ollama',
        model: 'gpt-oss:20b',
        endpointRef: 'local',
        runtimeParameters: { numCtx: 8192 },
      }),
    )
    expect(() => executionSettings('profile', 'single')).toThrow(
      refused('executor_unavailable'),
    )
  })
})
