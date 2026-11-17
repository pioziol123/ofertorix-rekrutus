import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseAiExecutionConfig,
  resolveEndpoint,
  savedEndpoint,
} from '../modules/ai/index.ts'
import {
  profileConfiguration,
  profileAiConfigured,
} from '../lib/profile/ai-configuration.ts'

const local = {
  version: 1,
  provider: 'ollama',
  model: 'gpt-oss:20b',
  execution: 'direct',
  endpointRef: 'local',
  endpointVersion: 1,
  runtimeParameters: { numCtx: 8192 },
}
const endpoint = {
  ref: 'local',
  version: 1,
  url: 'http://local.test',
  credentialEnv: null,
}
afterEach(() => vi.unstubAllEnvs())
describe('strict provider selection without implicit cloud fallback', () => {
  it('uses legacy configuration only when selection is absent', () => {
    expect(parseAiExecutionConfig(undefined)).toBeNull()
    expect(parseAiExecutionConfig(JSON.stringify(local))).toEqual(local)
  })
  it.each([
    '',
    'null',
    '{}',
    '[]',
    '{invalid',
    JSON.stringify({ ...local, unexpected: true }),
    JSON.stringify({
      ...local,
      runtimeParameters: { numCtx: 8192, temperature: 0 },
    }),
    JSON.stringify({ ...local, provider: 'other' }),
    JSON.stringify({ ...local, execution: 'batch' }),
    JSON.stringify({ ...local, model: 'other' }),
  ])('rejects invalid explicit selection %s', (value) => {
    expect(() => parseAiExecutionConfig(value)).toThrow(
      expect.objectContaining({ code: 'configuration' }),
    )
  })
  it.each(['matching', 'research'] as const)(
    'does not silently accept unsupported local %s',
    (useCase) => {
      expect(() =>
        parseAiExecutionConfig(JSON.stringify(local), useCase),
      ).toThrow(expect.objectContaining({ code: 'configuration' }))
    },
  )
  it('builds a local snapshot without paid credentials or pricing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('AI_PROFILE_PRICING_JSON', '')
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', JSON.stringify(local))
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
    vi.stubEnv('AI_PROFILE_EXECUTION_JSON', JSON.stringify(local))
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
      expect(() => resolveEndpoint('local', 1)).toThrow(
        expect.objectContaining({ code: 'configuration' }),
      )
    }
  })
})
