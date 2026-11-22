import { z } from 'zod'
import { aiCatalog } from './model-catalog.ts'

/**
 * What the executors read of the installation's configuration: whether a
 * provider's secret is present, and the endpoints of local runtimes.
 */

/** Whether the secret the provider needs is present in the environment. */
export function hasCredentials(provider: string): boolean {
  const variable = aiCatalog.providers[provider]?.credentialEnv
  return variable === null || (!!variable && !!process.env[variable])
}

const name = z.string().trim().min(1)
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const aiEndpointSchema = z
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
const aiEndpointsSchema = z
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

/**
 * The endpoint of a local runtime by its reference and version, from the
 * configuration in `AI_ENDPOINTS_JSON`. Throws when the configuration is
 * invalid, has no such endpoint, or lacks the endpoint's secret.
 */
export function resolveEndpoint(ref: string, version: number): AiEndpoint {
  let entries: AiEndpoint[]
  try {
    entries = aiEndpointsSchema.parse(
      JSON.parse(process.env.AI_ENDPOINTS_JSON ?? 'null'),
    )
  } catch {
    throw new Error('Invalid endpoint configuration')
  }
  const endpoint = entries.find((e) => e.ref === ref && e.version === version)
  if (
    !endpoint ||
    (endpoint.credentialEnv && !process.env[endpoint.credentialEnv])
  )
    throw new Error('Missing endpoint')
  return endpoint
}
