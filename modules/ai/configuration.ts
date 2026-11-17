import { z } from 'zod'
import { clientSettings } from './client-settings.ts'
import type { ExecutionMode } from './domain/execution-mode.ts'
import { resolveSettings, type ClientSettings } from './domain/settings.ts'
import {
  aiCatalog,
  type AiConfiguration,
  type CatalogModel,
} from './model-catalog.ts'
import { ModelError } from './provider-adapter.ts'

export type { AiConfiguration } from './model-catalog.ts'

/**
 * A client's settings under its key, checked against the AI configuration.
 * Null when the key has no settings or they are invalid.
 */
export function settingsFor(
  key: string,
): { settings: ClientSettings; model: CatalogModel } | null {
  const value = Object.hasOwn(clientSettings, key)
    ? clientSettings[key]
    : undefined
  return resolveSettings(value, aiCatalog)
}

/** Whether the secret the provider needs is present in the environment. */
export function hasCredentials(provider: string): boolean {
  const variable = aiCatalog.providers[provider]?.credentialEnv
  return variable === null || (!!variable && !!process.env[variable])
}

/**
 * The price list of a settings key's model in a mode, when its settings are
 * valid and the provider's secret is present; otherwise null.
 */
export function aiConfiguration(
  key: string,
  mode: ExecutionMode = 'single',
): AiConfiguration | null {
  const resolved = settingsFor(key)
  if (!resolved || !hasCredentials(resolved.settings.provider)) return null
  return resolved.model.prices[mode] ?? null
}

/**
 * The stored choice of an execution on a local runtime. The existing local
 * Profile path saves it in its snapshot.
 */
export type AiExecutionConfig = {
  version: 1
  provider: 'ollama'
  execution: 'direct'
  model: string
  endpointRef: string
  endpointVersion: number
  runtimeParameters: { numCtx: number }
}

/**
 * The local execution chosen for a settings key, or null when the key's
 * settings name no local model (or are invalid).
 */
export function localExecutionChoice(key: string): AiExecutionConfig | null {
  const resolved = settingsFor(key)
  const local = resolved?.model.local
  if (!resolved || !local || resolved.settings.provider !== 'ollama')
    return null
  return {
    version: 1,
    provider: 'ollama',
    execution: 'direct',
    model: resolved.model.model,
    endpointRef: local.endpointRef,
    endpointVersion: local.endpointVersion,
    runtimeParameters: { numCtx: local.numCtx },
  }
}

const name = z.string().trim().min(1)
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const endpointSchema = z
  .object({
    ref: name,
    version: integer,
    url: z
      .string()
      .url()
      .refine((value) => {
        const u = new URL(value)
        return (
          ['http:', 'https:'].includes(u.protocol) &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash
        )
      }),
    credentialEnv: z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/)
      .nullable(),
  })
  .strict()
export const aiEndpointsSchema = z
  .array(endpointSchema)
  .superRefine((values, context) => {
    const keys = values.map((v) => JSON.stringify([v.ref, v.version]))
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: 'custom',
        message: 'Duplicate endpoint version',
      })
  })
export type AiEndpoint = z.infer<typeof endpointSchema>
export function resolveEndpoint(ref: string, version: number): AiEndpoint {
  try {
    const entries = aiEndpointsSchema.parse(
      JSON.parse(process.env.AI_ENDPOINTS_JSON ?? 'null'),
    )
    const endpoint = entries.find((e) => e.ref === ref && e.version === version)
    if (
      !endpoint ||
      (endpoint.credentialEnv && !process.env[endpoint.credentialEnv])
    )
      throw new Error('Missing endpoint')
    return endpoint
  } catch {
    throw new ModelError('configuration')
  }
}

/**
 * The snapshot the existing Profile path saves for an explicit execution
 * choice. Rows saved before the settings key may still name OpenAI with
 * its own endpoint and price list.
 */
export type ExecutionSnapshot = (
  | AiExecutionConfig
  | (Omit<AiExecutionConfig, 'provider' | 'runtimeParameters'> & {
      provider: 'openai'
      runtimeParameters: Record<string, never>
    })
) & {
  promptVersion: string
  schemaVersion: string
  instructions: string
  input: string
  output: { name: string; schema: Record<string, unknown> }
  modelDigest: string | null
  endpoint: AiEndpoint
  pricing?: AiConfiguration
}
export function savedEndpoint(snapshot: ExecutionSnapshot): AiEndpoint {
  const endpoint = resolveEndpoint(
    snapshot.endpointRef,
    snapshot.endpointVersion,
  )
  if (
    endpoint.url !== snapshot.endpoint.url ||
    endpoint.credentialEnv !== snapshot.endpoint.credentialEnv
  )
    throw new ModelError('configuration')
  return endpoint
}
export function isExecutionSnapshot(
  value: AiConfiguration | ExecutionSnapshot,
): value is ExecutionSnapshot {
  return value.version === 1
}
