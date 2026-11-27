import type { PriceList } from '../../domain/price-list.ts'

export type CatalogModel = {
  provider: string
  model: string
  /** The reasoning efforts the model accepts; null means none is sent. */
  reasoningEfforts: readonly (string | null)[]
  /**
   * Price lists by assignment type. A paid model without one does not
   * serve the type.
   */
  prices: Partial<Record<'single' | 'agent', PriceList>>
  /** A model that runs on a local runtime: its endpoint and parameters. */
  local?: { endpointRef: string; endpointVersion: number; numCtx: number }
}

export type AiCatalog = {
  /** The providers AI knows, with the variable that holds their secret. */
  providers: Record<string, { credentialEnv: string | null }>
  models: readonly CatalogModel[]
}

/**
 * AI configuration: what AI decides about providers and models. Clients
 * choose only a provider, a model and a reasoning effort (client settings);
 * prices, token caps, endpoints, credentials and runtime parameters live
 * here. Fixed in code for now; changing them is a code change.
 */
export const aiCatalog: AiCatalog = {
  providers: {
    openai: { credentialEnv: 'OPENAI_API_KEY' },
    ollama: { credentialEnv: null },
  },
  models: [
    {
      provider: 'openai',
      model: 'gpt-6-luna',
      reasoningEfforts: ['low', 'medium', 'high'],
      prices: {
        // Standard rates, the whole allowed input as a conservative cap.
        single: {
          model: 'gpt-6-luna',
          version: 'openai-2026-11-04-standard',
          inputUsdPerMillion: '0.10',
          outputUsdPerMillion: '0.50',
          usdPln: '5',
          fxVersion: 'ceiling-5',
          maxInputTokens: 500000,
          maxOutputTokens: 6000,
        },
        // Agent work with web search: the standard rates of its steps
        // and the web search price per call, at most three calls. The
        // standard rates repeat those of `single`; a change of them is
        // made in both lists (solution design 0mq.17, decision 6).
        // ASSUMPTION(oferty-pracy-0mq.22/ASM-4)
        agent: {
          model: 'gpt-6-luna',
          version: 'openai-2026-11-04-standard',
          inputUsdPerMillion: '0.10',
          outputUsdPerMillion: '0.50',
          usdPln: '5',
          fxVersion: 'ceiling-5',
          maxInputTokens: 500000,
          maxOutputTokens: 6000,
          toolCallUsd: '0.01',
          maxToolCalls: 3,
        },
      },
    },
    {
      provider: 'ollama',
      model: 'gpt-oss:20b',
      reasoningEfforts: [null],
      prices: {},
      local: { endpointRef: 'ollama', endpointVersion: 1, numCtx: 32768 },
    },
  ],
}
