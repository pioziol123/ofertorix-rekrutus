import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiConfiguration } from './configuration.ts'
import { decimal } from './domain/money.ts'
import { resolveSettings } from './domain/settings.ts'
import { executionSettings } from './execution-settings.ts'
import { AiRequestError } from './errors.ts'
import {
  OpenAiAdapter,
  openAiProvider,
} from './infrastructure/adapters/openai.ts'
import { aiCatalog, type AiCatalog } from './model-catalog.ts'

// The keys are the clients' own names; AI must not care which they are.
const ai = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('./client-settings.ts', async (original) => {
  const real = await original<typeof import('./client-settings.ts')>()
  Object.assign(ai.settings, real.clientSettings)
  return { clientSettings: ai.settings }
})
const realKeys = vi.hoisted(() => [] as string[])

const pricing = {
  model: 'model-a',
  version: 'prices-1',
  inputUsdPerMillion: '0.25',
  outputUsdPerMillion: '2',
  usdPln: '4.1',
  fxVersion: 'fx-1',
  maxInputTokens: 20000,
  maxOutputTokens: 6000,
}
const catalog: AiCatalog = {
  providers: {
    paid: { credentialEnv: 'PAID_KEY' },
    local: { credentialEnv: null },
  },
  models: [
    {
      provider: 'paid',
      model: 'model-a',
      reasoningEfforts: ['low', 'high'],
      prices: { single: pricing },
    },
    {
      provider: 'local',
      model: 'model-b',
      reasoningEfforts: [null],
      prices: {},
    },
  ],
}
const valid = { provider: 'paid', model: 'model-a', reasoningEffort: 'low' }

beforeEach(() => {
  if (!realKeys.length) realKeys.push(...Object.keys(ai.settings))
  vi.stubEnv('OPENAI_API_KEY', 'key')
})
afterEach(() => {
  vi.unstubAllEnvs()
  for (const key of Object.keys(ai.settings))
    if (!realKeys.includes(key)) Reflect.deleteProperty(ai.settings, key)
})

describe('A14-AC08: settings validation', () => {
  it('accepts a known provider, a model it offers and an effort the model accepts', () => {
    expect(resolveSettings(valid, catalog)).toEqual({
      settings: valid,
      model: catalog.models[0],
    })
    expect(
      resolveSettings(
        { provider: 'local', model: 'model-b', reasoningEffort: null },
        catalog,
      )?.settings.model,
    ).toBe('model-b')
  })
  it.each([
    ['missing settings', undefined],
    ['settings that are not an object', 'paid'],
    ['a missing reasoning effort', { provider: 'paid', model: 'model-a' }],
    ['an unknown field', { ...valid, temperature: 0 }],
    ['an empty model', { ...valid, model: ' ' }],
    ['an unknown provider', { ...valid, provider: 'other' }],
    ['an unknown model', { ...valid, model: 'model-c' }],
    ['a model of another provider', { ...valid, model: 'model-b' }],
    [
      'an effort the model does not accept',
      { ...valid, reasoningEffort: 'medium' },
    ],
    [
      'no effort for a model that needs one',
      { ...valid, reasoningEffort: null },
    ],
    [
      'an effort for a model that takes none',
      { provider: 'local', model: 'model-b', reasoningEffort: 'low' },
    ],
  ])('refuses %s', (_, value) => {
    expect(resolveSettings(value, catalog)).toBeNull()
  })

  it('refuses a request whose key has no settings as not_configured', () => {
    for (const key of ['', 'unknown-client', 'constructor', '__proto__'])
      expect(() => executionSettings(key, 'single')).toThrow(
        new AiRequestError('not_configured'),
      )
  })
  it.each([
    [
      'an unknown provider',
      { provider: 'other', model: 'gpt-6-luna', reasoningEffort: 'low' },
    ],
    [
      'an unknown model',
      { provider: 'openai', model: 'gpt-0', reasoningEffort: 'low' },
    ],
    [
      'an effort the model does not accept',
      { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'extreme' },
    ],
  ])('refuses settings with %s as not_configured', (_, settings) => {
    ai.settings['client-x'] = settings
    expect(() => executionSettings('client-x', 'single')).toThrow(
      new AiRequestError('not_configured'),
    )
  })
  it('refuses a paid provider without its secret as not_configured', () => {
    ai.settings['client-x'] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(() => executionSettings('client-x', 'single')).toThrow(
      new AiRequestError('not_configured'),
    )
  })
  it('works for any key the client defines', () => {
    ai.settings['any name a client picks'] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'high',
    }
    expect(executionSettings('any name a client picks', 'single')).toEqual({
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'high',
      maxOutputTokens: 6000,
      maxInputTokens: 500000,
      runtime: null,
      pricing: aiCatalog.models[0]!.prices.single,
    })
  })
})

describe('A14-AC10: modes no adapter declares', () => {
  it('accepts batch on OpenAI once its batch adapter declares it (0mq.21)', () => {
    ai.settings['client-x'] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    expect(executionSettings('client-x', 'batch')).toMatchObject({
      provider: 'openai',
      pricing: aiCatalog.models[0]!.prices.batch,
    })
  })
  it.each(['agent'] as const)('refuses %s as unsupported_mode', (mode) => {
    ai.settings['client-x'] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    expect(() => executionSettings('client-x', mode)).toThrow(
      new AiRequestError('unsupported_mode'),
    )
  })
  it('accepts the local model in single mode without a price list, so nothing is reserved', () => {
    ai.settings['client-x'] = {
      provider: 'ollama',
      model: 'gpt-oss:20b',
      reasoningEffort: null,
    }
    expect(executionSettings('client-x', 'single')).toMatchObject({
      provider: 'ollama',
      pricing: null,
      runtime: { endpointRef: 'ollama', endpointVersion: 1 },
    })
    expect(() => executionSettings('client-x', 'batch')).toThrow(
      new AiRequestError('unsupported_mode'),
    )
  })
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
  it('names in every client setting a provider and model it knows', () => {
    for (const key of realKeys)
      expect(resolveSettings(ai.settings[key], aiCatalog)).not.toBeNull()
  })
  it('gives the transitional consumers the price list of their key and mode', () => {
    ai.settings['client-x'] = {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEffort: 'low',
    }
    const luna = aiCatalog.models[0]!
    expect(aiConfiguration('client-x')).toEqual(luna.prices.single)
    expect(aiConfiguration('client-x', 'batch')).toEqual(luna.prices.batch)
    expect(aiConfiguration('client-x', 'agent')).toBeNull()
    expect(aiConfiguration('unknown-client')).toBeNull()
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(aiConfiguration('client-x')).toBeNull()
  })
})

describe('A14-AC08: the settings of today give the same provider requests', () => {
  it('sends the request the existing paid path sends, for every key in the settings', async () => {
    for (const key of realKeys) {
      const settings = executionSettings(key, 'single')
      const bodies: string[] = []
      const fetcher = vi.fn<typeof fetch>(async (_, init) => {
        bodies.push(String(init?.body))
        return Response.json({ status: 'incomplete' })
      })
      const request = {
        model: settings.model,
        instructions: 'Extract facts.',
        input: 'Some text',
        output: { name: 'facts', schema: { type: 'object' } },
      }
      await openAiProvider(fetcher).modes.single!(settings, {
        fixed: {},
      }).generate(request)
      // The existing paths: the price list's output cap and a low effort.
      await new OpenAiAdapter(fetcher, {
        maxOutputTokens: settings.pricing!.maxOutputTokens,
      }).generate(request)
      expect(bodies[0]).toBe(bodies[1])
      expect(JSON.parse(bodies[0]!)).toMatchObject({
        reasoning: { effort: 'low' },
        max_output_tokens: 6000,
      })
    }
  })
})

describe('A14-AC08: no AI code depends on a key value', () => {
  it('names the keys only in the settings file', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
          files.push(path)
      }
    }
    const root = join(import.meta.dirname)
    walk(root)
    const offenders = files.filter((file) => {
      if (file.endsWith('client-settings.ts')) return false
      const text = readFileSync(file, 'utf8')
      return realKeys.some((key) => new RegExp(`['"\`]${key}['"\`]`).test(text))
    })
    expect(realKeys.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
