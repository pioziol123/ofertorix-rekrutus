import { z } from 'zod'

/** The validator of a response schema (JSON Schema), or null if unusable. */
export function schemaValidator(
  schema: Record<string, unknown>,
): z.ZodType | null {
  try {
    return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0])
  } catch {
    return null
  }
}
