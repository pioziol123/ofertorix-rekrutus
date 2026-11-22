import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCredentials, resolveEndpoint } from './configuration.ts'
import { decimal } from './domain/money.ts'
import { aiCatalog } from './model-catalog.ts'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AI configuration', () => {
  it('holds valid price lists: positive amounts and caps within the limits', () => {
    for (const model of aiCatalog.models)
      for (const list of Object.values(model.prices)) {
        expect(list.model).toBe(model.model)
        for (const amount of [
          list.inputUsdPerMillion,
          list.outputUsdPerMillion,
          list.usdPln,
        ])
          expect(decimal(amount)).toBeGreaterThan(0n)
        expect(list.maxInputTokens).toBeGreaterThan(0)
        expect(list.maxInputTokens).toBeLessThanOrEqual(2000000)
        expect(list.maxOutputTokens).toBeGreaterThan(0)
        expect(list.maxOutputTokens).toBeLessThanOrEqual(6000)
      }
  })

  it("knows a paid provider's secret only when it is present, and a local one needs none", () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(hasCredentials('openai')).toBe(false)
    vi.stubEnv('OPENAI_API_KEY', 'key')
    expect(hasCredentials('openai')).toBe(true)
    expect(hasCredentials('ollama')).toBe(true)
    expect(hasCredentials('unknown')).toBe(false)
  })

  it('resolves a local endpoint by reference and version, and refuses a missing or invalid one', () => {
    const endpoint = {
      ref: 'ollama',
      version: 1,
      url: 'http://localhost:11434',
      credentialEnv: null,
    }
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    expect(resolveEndpoint('ollama', 1)).toEqual(endpoint)
    expect(() => resolveEndpoint('ollama', 2)).toThrow()
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([{ ...endpoint, url: 'x' }]))
    expect(() => resolveEndpoint('ollama', 1)).toThrow()
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, credentialEnv: 'LOCAL_KEY' }]),
    )
    expect(() => resolveEndpoint('ollama', 1)).toThrow()
  })
})
