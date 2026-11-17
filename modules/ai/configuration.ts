import { z } from 'zod'
import { decimal } from './domain/money.ts'
import { ModelError } from './provider-adapter.ts'

export type AiConfiguration = {
  model: string
  version: string
  inputUsdPerMillion: string
  outputUsdPerMillion: string
  usdPln: string
  fxVersion: string
  maxInputTokens: number
  maxOutputTokens: number
}
export function aiConfiguration(
  variable = 'AI_PROFILE_PRICING_JSON',
): AiConfiguration | null {
  return process.env.OPENAI_API_KEY ? pricingConfiguration(variable) : null
}
export function pricingConfiguration(
  variable = 'AI_PROFILE_PRICING_JSON',
): AiConfiguration | null {
  if (!process.env[variable]) return null
  try {
    const c = z
      .object({
        model: z.string().min(1),
        version: z.string().min(1),
        inputUsdPerMillion: z.string(),
        outputUsdPerMillion: z.string(),
        usdPln: z.string(),
        fxVersion: z.string().min(1),
        maxInputTokens: z.number().int().positive().max(2000000),
        maxOutputTokens: z.number().int().positive().max(6000),
      })
      .strict()
      .parse(JSON.parse(process.env[variable]!))
    if (
      decimal(c.inputUsdPerMillion) <= 0n ||
      decimal(c.outputUsdPerMillion) <= 0n ||
      decimal(c.usdPln) <= 0n
    )
      return null
    return c
  } catch {
    return null
  }
}

const name = z.string().trim().min(1)
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const baseSelection = {
  version: z.literal(1),
  model: name,
  endpointRef: name,
  endpointVersion: integer,
}
export const aiExecutionConfigSchema = z.discriminatedUnion('provider', [
  z
    .object({
      ...baseSelection,
      provider: z.literal('openai'),
      execution: z.enum(['direct', 'batch']),
      runtimeParameters: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...baseSelection,
      provider: z.literal('ollama'),
      model: z.literal('gpt-oss:20b'),
      execution: z.literal('direct'),
      runtimeParameters: z.object({ numCtx: integer }).strict(),
    })
    .strict(),
])
export type AiExecutionConfig = z.infer<typeof aiExecutionConfigSchema>
export type AiUseCase = 'profile' | 'matching' | 'research'
export function parseAiExecutionConfig(
  value: string | undefined,
  useCase: AiUseCase = 'profile',
): AiExecutionConfig | null {
  if (value === undefined) return null
  try {
    const result = aiExecutionConfigSchema.parse(JSON.parse(value))
    const supported =
      useCase === 'profile'
        ? result.execution === 'direct'
        : result.provider === 'openai' &&
          result.execution === (useCase === 'matching' ? 'batch' : 'direct')
    if (!supported) throw new Error('Unsupported execution')
    return result
  } catch {
    throw new ModelError('configuration')
  }
}
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
export type ExecutionSnapshot = AiExecutionConfig & {
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
