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

/**
 * The result in a model's text: a JSON value that matches the response
 * schema, or undefined when the text is not JSON or does not match.
 */
export function parseResult(
  text: string,
  schema: Record<string, unknown>,
): unknown {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (value === null) return undefined
  return schemaValidator(schema)?.safeParse(value).success ? value : undefined
}
