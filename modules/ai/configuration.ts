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

const name = z.string().trim().min(1)
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const aiEndpointSchema = z
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
  .array(aiEndpointSchema)
  .superRefine((values, context) => {
    const keys = values.map((v) => JSON.stringify([v.ref, v.version]))
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: 'custom',
        message: 'Duplicate endpoint version',
      })
  })
export type AiEndpoint = z.infer<typeof aiEndpointSchema>
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
 * The endpoint fixed for an execution, checked against the configuration
 * when the execution runs: a changed or removed endpoint version is
 * refused instead of redirecting queued work.
 */
export function savedEndpoint(saved: AiEndpoint): AiEndpoint {
  const endpoint = resolveEndpoint(saved.ref, saved.version)
  if (
    endpoint.url !== saved.url ||
    endpoint.credentialEnv !== saved.credentialEnv
  )
    throw new ModelError('configuration')
  return endpoint
}
