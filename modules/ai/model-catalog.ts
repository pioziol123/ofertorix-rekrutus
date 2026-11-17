import type { ExecutionMode } from './domain/execution-mode.ts'

/**
 * The price list of a model in one execution mode, with the token caps a
 * reservation covers. Amounts are decimal strings, see the cost arithmetic.
 */
export type AiConfiguration = {
  model: string
  version: string
  inputUsdPerMillion: string
  outputUsdPerMillion: string
  usdPln: string
  fxVersion: string
  maxInputTokens: number
  maxOutputTokens: number
}

export type CatalogModel = {
  provider: string
  model: string
  /** The reasoning efforts the model accepts; null means none is sent. */
  reasoningEfforts: readonly (string | null)[]
  /** Price lists by execution mode. A mode without one is not configured. */
  prices: Partial<Record<ExecutionMode, AiConfiguration>>
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
        // Conservative Batch rates of the offer assessments.
        batch: {
          model: 'gpt-6-luna',
          version: 'openai-2026-11-03-batch',
          inputUsdPerMillion: '0.10',
          outputUsdPerMillion: '0.375',
          usdPln: '5',
          fxVersion: 'ceiling-5',
          maxInputTokens: 200000,
          maxOutputTokens: 6000,
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
