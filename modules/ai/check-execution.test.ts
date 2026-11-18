import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkedValues, checkExecution } from './check-execution.ts'
import { resolveEndpoint, savedEndpoint } from './configuration.ts'
import { AiRequestError } from './errors.ts'
import { isConfigured } from './execution-settings.ts'
import { ollamaProvider } from './infrastructure/adapters/ollama.ts'
import { registerProviderAdapter } from './provider-registry.ts'

// The settings AI keeps under a client's key, replaced per test.
const ai = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('./client-settings.ts', () => ({ clientSettings: ai.settings }))

const key = 'client-x'
const endpoint = {
  ref: 'ollama',
  version: 1,
  url: 'http://local.test',
  credentialEnv: null,
}
const tags = vi.fn<typeof fetch>()
beforeEach(() => {
  tags.mockReset()
  tags.mockResolvedValue(
    Response.json({
      models: [{ name: 'gpt-oss:20b', digest: 'sha256:fixed' }],
    }),
  )
  registerProviderAdapter(ollamaProvider(tags))
  ai.settings[key] = {
    provider: 'ollama',
    model: 'gpt-oss:20b',
    reasoningEffort: null,
  }
})
afterEach(() => vi.unstubAllEnvs())

const local = { settingsKey: key, provider: 'ollama', model: 'gpt-oss:20b' }

describe('provider chosen from the settings without implicit cloud fallback', () => {
  it('is configured for the paid provider only with its secret', () => {
    ai.settings[key] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    vi.stubEnv('OPENAI_API_KEY', 'key')
    expect(isConfigured(key)).toBe(true)
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(isConfigured(key)).toBe(false)
  })
  it.each([
    [
      'a reasoning effort the local model does not accept',
      { reasoningEffort: 'low' },
    ],
    ['an unknown local model', { model: 'other' }],
    ['an unknown provider', { provider: 'other' }],
  ])(
    'is not configured with %s, even when paid credentials exist',
    async (_, change) => {
      vi.stubEnv('OPENAI_API_KEY', 'key')
      vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
      ai.settings[key] = { ...(ai.settings[key] as object), ...change }
      expect(isConfigured(key)).toBe(false)
      await expect(checkExecution(key)).rejects.toThrow(
        new AiRequestError('not_configured'),
      )
    },
  )
  it('is configured locally only with the endpoint of the local runtime', () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(isConfigured(key)).toBe(false)
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    expect(isConfigured(key)).toBe(true)
  })
})

describe('A14-AC13: the check before a request', () => {
  it('fixes the endpoint and the model version without paid credentials, as an opaque value', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    const check = await checkExecution(key)
    expect(Object.keys(check)).toEqual([])
    expect(JSON.stringify(check)).toBe('{}')
    expect(tags).toHaveBeenCalledExactlyOnceWith(
      'http://local.test/api/tags',
      expect.anything(),
    )
    expect(checkedValues(check, local)).toEqual({
      endpoint,
      modelDigest: 'sha256:fixed',
    })
  })
  it('refuses a request without the check, or with the check of other settings', async () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    const check = await checkExecution(key)
    expect(() => checkedValues(undefined, local)).toThrow(
      new AiRequestError('invalid_request'),
    )
    expect(() =>
      checkedValues(check, { ...local, settingsKey: 'other' }),
    ).toThrow(new AiRequestError('invalid_request'))
    expect(checkedValues(undefined, { ...local, provider: 'openai' })).toEqual(
      {},
    )
  })
  it.each([
    ['an unreachable runtime', () => Promise.reject(new Error('down'))],
    ['a missing model', async () => Response.json({ models: [] })],
    ['an HTTP error', async () => new Response('', { status: 500 })],
  ])('reports %s as provider_unavailable', async (_, answer) => {
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    tags.mockImplementation(answer)
    await expect(checkExecution(key)).rejects.toThrow(
      new AiRequestError('provider_unavailable'),
    )
  })
})

describe('endpoints of a local runtime', () => {
  it('rejects changed or removed endpoint versions instead of redirecting queued work', () => {
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([
        { ...endpoint, version: 2, url: 'http://new.test' },
        endpoint,
      ]),
    )
    expect(savedEndpoint(endpoint)).toEqual(endpoint)
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, url: 'http://redirect.test' }]),
    )
    expect(() => savedEndpoint(endpoint)).toThrow(
      expect.objectContaining({ code: 'configuration' }),
    )
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, version: 2 }]),
    )
    expect(() => savedEndpoint(endpoint)).toThrow(
      expect.objectContaining({ code: 'configuration' }),
    )
  })
  it('rejects duplicate endpoint versions and credentials embedded in URLs', () => {
    for (const entries of [
      [endpoint, endpoint],
      [{ ...endpoint, url: 'http://secret:password@local.test' }],
    ]) {
      vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify(entries))
      expect(() => resolveEndpoint('ollama', 1)).toThrow(
        expect.objectContaining({ code: 'configuration' }),
      )
    }
  })
})
