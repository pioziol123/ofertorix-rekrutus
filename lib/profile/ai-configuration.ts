import {
  aiConfiguration,
  localExecutionChoice,
  resolveEndpoint,
  OllamaAdapter,
  localFetch,
} from '../../modules/ai/index.ts'
import type {
  AiConfiguration,
  ExecutionSnapshot,
} from '../../modules/ai/index.ts'
import { profileRequest } from './ai-prompt.ts'

/** The Profile's settings key in the AI module. */
const settingsKey = 'profile'

export function profileAiConfigured(): boolean {
  try {
    const choice = localExecutionChoice(settingsKey)
    if (!choice) return aiConfiguration(settingsKey) !== null
    resolveEndpoint(choice.endpointRef, choice.endpointVersion)
    return true
  } catch {
    return false
  }
}
export async function profileConfiguration(
  input: string,
  fetcher?: typeof fetch,
): Promise<AiConfiguration | ExecutionSnapshot | null> {
  const choice = localExecutionChoice(settingsKey)
  if (!choice) return aiConfiguration(settingsKey)
  const endpoint = resolveEndpoint(choice.endpointRef, choice.endpointVersion)
  const request = profileRequest(input, choice.model)
  const adapter = new OllamaAdapter(fetcher ?? localFetch, {
    url: endpoint.url,
    numCtx: choice.runtimeParameters.numCtx,
    credential: () =>
      endpoint.credentialEnv ? process.env[endpoint.credentialEnv] : undefined,
  })
  return {
    ...request,
    ...choice,
    endpoint,
    promptVersion: 'profile-facts-v1',
    schemaVersion: 'profile-facts-v1',
    modelDigest: await adapter.checkModelAvailability(choice.model),
  }
}
