// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { AiCatalog } from '../modules/ai/infrastructure/adapters/model-catalog.ts'
import type { PriceList } from '../modules/ai/domain/price-list.ts'

/**
 * A test replacement for the price lists AI keeps in code. A test file
 * swaps it in with
 *
 *   vi.mock('../modules/ai/infrastructure/adapters/model-catalog.ts', () => import('./ai-test-configuration.ts'))
 *
 * and then gives the model of its settings the price list it needs.
 */
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
 * Gives the paid model of the price list that price list for the
 * assignment type (or each of the types), with the reasoning effort the
 * settings of assignments use.
 */
export function usePricing(
  pricing: PriceList,
  type: 'single' | 'agent' | ('single' | 'agent')[] = 'single',
) {
  const model = pricing.model
  aiCatalog.models = [
    ...aiCatalog.models.filter((m) => m.model !== model),
    {
      provider: 'openai',
      model,
      reasoningEfforts: ['low'],
      prices: Object.fromEntries(
        (Array.isArray(type) ? type : [type]).map((t) => [t, pricing]),
      ),
    },
  ]
}

/** Removes the paid model, so no assignment of it can be placed. */
export function removePricing(model: string) {
  aiCatalog.models = aiCatalog.models.filter((m) => m.model !== model)
}
