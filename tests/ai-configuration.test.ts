import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEndpoint, savedEndpoint } from '../modules/ai/index.ts'
import {
  profileConfiguration,
  profileAiConfigured,
} from '../lib/profile/ai-configuration.ts'

// The settings AI keeps under the Profile's key, replaced per test.
const ai = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('../modules/ai/client-settings.ts', () => ({
  clientSettings: ai.settings,
}))

// The local choice AI derives from the settings and its own configuration.
const local = {
  version: 1,
  provider: 'ollama',
  model: 'gpt-oss:20b',
  execution: 'direct',
  endpointRef: 'ollama',
  endpointVersion: 1,
  runtimeParameters: { numCtx: 32768 },
}
const endpoint = {
  ref: 'ollama',
  version: 1,
  url: 'http://local.test',
  credentialEnv: null,
}
beforeEach(() => {
  ai.settings.profile = {
    provider: 'ollama',
    model: 'gpt-oss:20b',
    reasoningEffort: null,
  }
})
afterEach(() => vi.unstubAllEnvs())
describe('provider chosen from the settings without implicit cloud fallback', () => {
  it('uses the paid price list when the settings name the paid provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'key')
    ai.settings.profile = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    expect(profileAiConfigured()).toBe(true)
    expect(await profileConfiguration('PHP')).toMatchObject({
      model: 'gpt-6-luna',
      maxOutputTokens: 6000,
    })
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(profileAiConfigured()).toBe(false)
    expect(await profileConfiguration('PHP')).toBeNull()
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
      ai.settings.profile = { ...(ai.settings.profile as object), ...change }
      expect(profileAiConfigured()).toBe(false)
      expect(await profileConfiguration('PHP')).toBeNull()
    },
  )
  it('builds a local snapshot without paid credentials or pricing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        models: [{ name: local.model, digest: 'sha256:fixed' }],
      }),
    )
    expect(profileAiConfigured()).toBe(true)
    const snapshot = await profileConfiguration('PHP', fetcher)
    expect(snapshot).toMatchObject({
      ...local,
      modelDigest: 'sha256:fixed',
      input: 'PHP',
      endpoint,
      promptVersion: 'profile-facts-v1',
      schemaVersion: 'profile-facts-v1',
    })
    expect(snapshot).not.toHaveProperty('pricing')
  })
  it('rejects changed or removed endpoint versions instead of redirecting queued work', async () => {
    vi.stubEnv('AI_ENDPOINTS_JSON', JSON.stringify([endpoint]))
    const snapshot = await profileConfiguration(
      'PHP',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          models: [{ name: local.model, digest: 'sha256:fixed' }],
        }),
      ),
    )
    if (!snapshot || snapshot.version !== 1)
      throw new Error('Expected execution snapshot')
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([
        { ...endpoint, version: 2, url: 'http://new.test' },
        endpoint,
      ]),
    )
    expect(savedEndpoint(snapshot)).toEqual(endpoint)
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, url: 'http://redirect.test' }]),
    )
    expect(() => savedEndpoint(snapshot)).toThrow(
      expect.objectContaining({ code: 'configuration' }),
    )
    vi.stubEnv(
      'AI_ENDPOINTS_JSON',
      JSON.stringify([{ ...endpoint, version: 2 }]),
    )
    expect(() => savedEndpoint(snapshot)).toThrow(
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
