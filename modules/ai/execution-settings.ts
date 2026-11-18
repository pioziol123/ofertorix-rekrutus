import { hasCredentials, settingsFor } from './configuration.ts'
import type { ExecutionMode } from './domain/execution-mode.ts'
import { AiRequestError } from './errors.ts'
import type { AiConfiguration } from './model-catalog.ts'
import type { ProviderSettings } from './provider-adapter.ts'
import { providerAdapter, supportsMode } from './provider-registry.ts'

export type { ExecutionMode } from './domain/execution-mode.ts'

/**
 * The provider, model and prices fixed for an execution at request time.
 * A model on a local runtime has no price list: its inference costs
 * nothing, so nothing is reserved or charged for it.
 */
export type ExecutionSettings = ProviderSettings & {
  pricing: AiConfiguration | null
}

/**
 * The settings of an execution under a client's settings key, in a mode.
 * Missing or invalid settings, a missing price list of a paid model, a
 * missing secret or an unconfigured local runtime are `not_configured`; a
 * mode no adapter of the provider declares is `unsupported_mode`.
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
  const pricing = model.prices[mode] ?? null
  if ((!pricing && !model.local) || !hasCredentials(settings.provider))
    throw new AiRequestError('not_configured')
  return {
    provider: settings.provider,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    maxOutputTokens: pricing?.maxOutputTokens ?? 0,
    runtime: model.local ?? null,
    pricing,
  }
}

/**
 * Whether a client can request single executions under its key now: the
 * settings are valid and complete, and the provider's runtime is
 * configured. Nothing is called.
 */
export function isConfigured(settingsKey: string): boolean {
  try {
    const settings = executionSettings(settingsKey, 'single')
    return providerAdapter(settings.provider)?.ready?.(settings) ?? true
  } catch (error) {
    if (error instanceof AiRequestError) return false
    throw error
  }
}
