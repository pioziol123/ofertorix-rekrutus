import { z } from 'zod'
import type { AiCatalog, CatalogModel } from '../model-catalog.ts'

/** A client's settings: everything a client decides about its executions. */
export type ClientSettings = {
  provider: string
  model: string
  reasoningEffort: string | null
}

const settingsSchema = z
  .object({
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1),
    reasoningEffort: z.string().trim().min(1).nullable(),
  })
  .strict()

/**
 * Checks a client's settings against the AI configuration: a known
 * provider, a model it offers and a reasoning effort the model accepts.
 * Returns null for missing, incomplete or invalid settings.
 */
export function resolveSettings(
  value: unknown,
  catalog: AiCatalog,
): { settings: ClientSettings; model: CatalogModel } | null {
  const parsed = settingsSchema.safeParse(value)
  if (!parsed.success) return null
  const settings = parsed.data
  if (!Object.hasOwn(catalog.providers, settings.provider)) return null
  const model = catalog.models.find(
    (m) => m.provider === settings.provider && m.model === settings.model,
  )
  if (!model || !model.reasoningEfforts.includes(settings.reasoningEffort))
    return null
  return { settings, model }
}
