import {
  aiConfiguration,
  parseAiExecutionConfig,
  pricingConfiguration,
  resolveEndpoint,
  type AiConfiguration,
} from './configuration.ts'
import { AiRequestError } from './errors.ts'
import type { ProviderSettings } from './provider-adapter.ts'

/** A job type is the key of an existing configuration and price list. */
export type AiJobType = 'profile' | 'matching' | 'research'
export const aiJobTypes: readonly AiJobType[] = [
  'profile',
  'matching',
  'research',
]

export type ExecutionMode = 'single' | 'batch' | 'agent'

/** The provider, model and prices chosen for an execution at request time. */
export type ExecutionSettings = ProviderSettings & {
  endpointRef: string | null
  endpointVersion: number | null
  pricing: AiConfiguration
}

const variables = (jobType: AiJobType) => {
  const prefix = `AI_${jobType.toUpperCase()}`
  return {
    selection: `${prefix}_EXECUTION_JSON`,
    pricing: `${prefix}_PRICING_JSON`,
  }
}

/**
 * Chooses the provider and model of a job type from the configuration, the
 * way the existing consumers do: an explicit execution selection with its
 * endpoint and matching price list, otherwise the job type's price list on
 * the default OpenAI endpoint.
 */
export function executionSettings(
  jobType: AiJobType,
  mode: ExecutionMode,
): ExecutionSettings {
  const names = variables(jobType)
  let choice
  try {
    choice = parseAiExecutionConfig(process.env[names.selection], jobType)
  } catch {
    throw new AiRequestError('not_configured')
  }
  if (!choice) {
    const pricing = aiConfiguration(names.pricing)
    if (!pricing) throw new AiRequestError('not_configured')
    return {
      provider: 'openai',
      model: pricing.model,
      endpoint: null,
      endpointRef: null,
      endpointVersion: null,
      maxOutputTokens: pricing.maxOutputTokens,
      pricing,
    }
  }
  if (choice.execution !== (mode === 'batch' ? 'batch' : 'direct'))
    throw new AiRequestError('unsupported_mode')
  // The local path joins the coordination with the shared local slot in
  // task oferty-pracy-0mq.9; until then only the paid provider runs here.
  if (choice.provider !== 'openai')
    throw new AiRequestError('executor_unavailable')
  let endpoint
  try {
    endpoint = resolveEndpoint(choice.endpointRef, choice.endpointVersion)
  } catch {
    throw new AiRequestError('not_configured')
  }
  const pricing = pricingConfiguration(names.pricing)
  if (!pricing || pricing.model !== choice.model || !endpoint.credentialEnv)
    throw new AiRequestError('not_configured')
  return {
    provider: choice.provider,
    model: choice.model,
    endpoint: { url: endpoint.url, credentialEnv: endpoint.credentialEnv },
    endpointRef: choice.endpointRef,
    endpointVersion: choice.endpointVersion,
    maxOutputTokens: pricing.maxOutputTokens,
    pricing,
  }
}

/**
 * The endpoint saved with an execution, if the configuration still has it
 * unchanged; queued work is never redirected to another endpoint.
 */
export function savedSettingsEndpoint(settings: ExecutionSettings): boolean {
  if (settings.endpointRef === null || settings.endpointVersion === null)
    return true
  try {
    const endpoint = resolveEndpoint(
      settings.endpointRef,
      settings.endpointVersion,
    )
    return (
      endpoint.url === settings.endpoint?.url &&
      endpoint.credentialEnv === settings.endpoint?.credentialEnv
    )
  } catch {
    return false
  }
}
