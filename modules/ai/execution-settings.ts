import { hasCredentials, settingsFor } from './configuration.ts'
import type { ExecutionMode } from './domain/execution-mode.ts'
import { attemptCeiling } from './domain/cost.ts'
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
  const resolvedSettings: ExecutionSettings = {
    provider: settings.provider,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort,
    maxOutputTokens: pricing?.maxOutputTokens ?? 0,
    maxInputTokens: pricing?.maxInputTokens ?? 0,
    ...(pricing?.maxToolCalls !== undefined
      ? { maxToolCalls: pricing.maxToolCalls }
      : {}),
    runtime: model.local ?? null,
    pricing,
  }
  // An agent runs its steps only under settings that fit them.
  if (
    mode === 'agent' &&
    !providerAdapter(settings.provider)?.modes.agent?.(resolvedSettings).fits()
  )
    throw new AiRequestError('not_configured')
  return resolvedSettings
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

// ASSUMPTION(oferty-pracy-0mq.21/ASM-4): a public read for Matching's views.
/**
 * What one execution under a client's key reserves in a mode, in PLN as a
 * decimal string: the cost of the price list's token caps, or zero for a
 * model without a price list. Null when the key cannot be requested in the
 * mode now. Nothing is called; a client uses it to show the most a request
 * reserves.
 */
export function readReservation(
  settingsKey: string,
  mode: ExecutionMode,
): string | null {
  try {
    const settings = executionSettings(settingsKey, mode)
    return settings.pricing ? attemptCeiling(settings.pricing) : '0.000000'
  } catch (error) {
    if (error instanceof AiRequestError) return null
    throw error
  }
}
