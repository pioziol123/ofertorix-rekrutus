// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { AiCatalog, AiConfiguration } from '../modules/ai/model-catalog.ts'

/**
 * Test replacements for the settings and the price lists AI keeps in code.
 * A test file swaps them in with
 *
 *   vi.mock('../modules/ai/client-settings.ts', () => import('./ai-test-configuration.ts'))
 *   vi.mock('../modules/ai/model-catalog.ts', () => import('./ai-test-configuration.ts'))
 *
 * and then gives a settings key the price list it needs.
 */
export const clientSettings: Record<string, unknown> = {}
export const aiCatalog: AiCatalog = {
  providers: {
    openai: { credentialEnv: 'OPENAI_API_KEY' },
    ollama: { credentialEnv: null },
  },
  models: [
    {
      provider: 'ollama',
      model: 'gpt-oss:20b',
      reasoningEfforts: [null],
      prices: {},
      local: { endpointRef: 'ollama', endpointVersion: 1, numCtx: 8192 },
    },
  ],
}

/**
 * Gives a settings key a paid model with the price list in the mode (or in
 * each of the modes), or removes its settings with null.
 */
export function usePricing(
  key: string,
  pricing: AiConfiguration | null,
  mode:
    'single' | 'batch' | 'agent' | ('single' | 'batch' | 'agent')[] = 'single',
) {
  Reflect.deleteProperty(clientSettings, key)
  if (!pricing) return
  const model = pricing.model
  aiCatalog.models = [
    ...aiCatalog.models.filter((m) => m.model !== model),
    {
      provider: 'openai',
      model,
      reasoningEfforts: ['low'],
      prices: Object.fromEntries(
        (Array.isArray(mode) ? mode : [mode]).map((m) => [m, pricing]),
      ),
    },
  ]
  clientSettings[key] = { provider: 'openai', model, reasoningEffort: 'low' }
}

/** Gives a settings key the local model on its local runtime. */
export function useLocalModel(key: string, numCtx = 8192) {
  aiCatalog.models = aiCatalog.models.map((m) =>
    m.local ? { ...m, local: { ...m.local, numCtx } } : m,
  )
  clientSettings[key] = {
    provider: 'ollama',
    model: 'gpt-oss:20b',
    reasoningEffort: null,
  }
}
