import {
  aiConfiguration,
  pricingConfiguration,
  parseAiExecutionConfig,
  resolveEndpoint,
} from '../ai/configuration.ts'
import type { AiConfiguration, ExecutionSnapshot } from '../ai/configuration.ts'
import { ModelError } from '../ai/models/model.ts'
import { OllamaAdapter } from '../ai/models/ollama.ts'
import { localFetch } from '../ai/models/local-http.ts'
import { profileRequest } from './ai-prompt.ts'

export function profileAiConfigured(): boolean {
  try {
    const choice = parseAiExecutionConfig(process.env.AI_PROFILE_EXECUTION_JSON)
    if (!choice) return aiConfiguration() !== null
    const endpoint = resolveEndpoint(choice.endpointRef, choice.endpointVersion)
    return (
      choice.provider === 'ollama' ||
      (endpoint.credentialEnv !== null &&
        pricingConfiguration()?.model === choice.model)
    )
  } catch {
    return false
  }
}
export async function profileConfiguration(
  input: string,
  fetcher?: typeof fetch,
): Promise<AiConfiguration | ExecutionSnapshot | null> {
  const choice = parseAiExecutionConfig(process.env.AI_PROFILE_EXECUTION_JSON)
  if (!choice) return aiConfiguration()
  const endpoint = resolveEndpoint(choice.endpointRef, choice.endpointVersion)
  const request = profileRequest(input, choice.model)
  const snapshot: ExecutionSnapshot = {
    ...request,
    ...choice,
    endpoint,
    promptVersion: 'profile-facts-v1',
    schemaVersion: 'profile-facts-v1',
    modelDigest: null,
  }
  if (choice.provider === 'openai') {
    const pricing = pricingConfiguration()
    if (!pricing || pricing.model !== choice.model || !endpoint.credentialEnv)
      throw new ModelError('configuration')
    snapshot.pricing = pricing
  } else {
    const adapter = new OllamaAdapter(fetcher ?? localFetch, {
      url: endpoint.url,
      numCtx: choice.runtimeParameters.numCtx,
      credential: () =>
        endpoint.credentialEnv
          ? process.env[endpoint.credentialEnv]
          : undefined,
    })
    snapshot.modelDigest = await adapter.checkModelAvailability(choice.model)
  }
  return snapshot
}
