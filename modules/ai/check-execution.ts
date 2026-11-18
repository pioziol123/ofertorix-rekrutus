import { AiRequestError } from './errors.ts'
import { executionSettings } from './execution-settings.ts'
import { providerAdapter } from './provider-registry.ts'

declare const opaque: unique symbol

/**
 * The result of the check before a request. The client keeps it and
 * passes it with the request; its content belongs to AI and is not part
 * of the contract.
 */
export type ExecutionCheck = { readonly [opaque]: true }

type CheckContent = {
  settingsKey: string
  provider: string
  model: string
  fixed: Record<string, unknown>
}

const contents = new WeakMap<ExecutionCheck, CheckContent>()

/**
 * Checks, before a request and outside any transaction, that the work
 * under the client's settings key can be sent now, and fixes what the
 * provider needs carried to the execution (e.g. the version of a local
 * model). Refuses with `AiRequestError`: `not_configured`,
 * `unsupported_mode` or `provider_unavailable`.
 */
export async function checkExecution(
  settingsKey: string,
): Promise<ExecutionCheck> {
  const settings = executionSettings(settingsKey, 'single')
  const adapter = providerAdapter(settings.provider)
  const fixed = adapter?.check ? await adapter.check(settings) : {}
  const check = Object.freeze({}) as ExecutionCheck
  contents.set(check, {
    settingsKey,
    provider: settings.provider,
    model: settings.model,
    fixed,
  })
  return check
}

/**
 * What a check fixed for a request under the settings, read only inside
 * AI. A provider whose adapter checks before a request needs the check of
 * the same key, provider and model; otherwise the request is invalid.
 */
export function checkedValues(
  check: ExecutionCheck | undefined,
  request: { settingsKey: string; provider: string; model: string },
): Record<string, unknown> {
  const adapter = providerAdapter(request.provider)
  if (!adapter?.check) return {}
  const content = check ? contents.get(check) : undefined
  if (
    !content ||
    content.settingsKey !== request.settingsKey ||
    content.provider !== request.provider ||
    content.model !== request.model
  )
    throw new AiRequestError('invalid_request')
  return content.fixed
}
