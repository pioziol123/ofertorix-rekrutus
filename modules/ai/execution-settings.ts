import { hasCredentials, settingsFor } from './configuration.ts'
import type { ExecutionMode } from './domain/execution-mode.ts'
import { AiRequestError } from './errors.ts'
import type { AiConfiguration } from './model-catalog.ts'
import type { ProviderSettings } from './provider-adapter.ts'
import { supportsMode } from './provider-registry.ts'

export type { ExecutionMode } from './domain/execution-mode.ts'

/** The provider, model and prices fixed for an execution at request time. */
export type ExecutionSettings = ProviderSettings & { pricing: AiConfiguration }

/**
 * The settings of an execution under a client's settings key, in a mode.
 * Missing or invalid settings, a missing price list or a missing secret
 * are `not_configured`; a mode no adapter of the provider declares is
 * `unsupported_mode`.
 */
export function executionSettings(
  key: string,
  mode: ExecutionMode,
): ExecutionSettings {
  const resolved = settingsFor(key)
  if (!resolved) throw new AiRequestError('not_configured')
  const { settings, model } = resolved
  if (!supportsMode(settings.provider, mode))
    throw new AiRequestError('unsupported_mode')
  const pricing = model.prices[mode]
  if (!pricing || !hasCredentials(settings.provider))
    throw new AiRequestError('not_configured')
  return {
    provider: settings.provider,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    maxOutputTokens: pricing.maxOutputTokens,
    pricing,
  }
}
