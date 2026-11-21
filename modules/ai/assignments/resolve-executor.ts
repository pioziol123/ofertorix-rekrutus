import { z } from 'zod'
import type {
  ExecutorDeclaration,
  ExecutorParameters,
  ServiceDeclaration,
  ServiceOffer,
} from '../executors/declaration.ts'
import { executorDeclaration } from '../executors/registry.ts'
import { assignmentSettings } from './assignment-settings.ts'
import { AssignmentError, type AssignmentType } from './assignment.ts'

const settingsSchema = z
  .object({
    executor: z.string().trim().min(1),
    parameters: z.record(z.string(), z.string().nullable()),
    requestingModule: z.string().trim().min(1),
  })
  .strict()

/** The executor found for a settings name and a type, with its offer. */
export type ResolvedExecutor = {
  executor: ExecutorDeclaration
  service: ServiceDeclaration
  parameters: ExecutorParameters
  offer: ServiceOffer
}

const sameParameters = (a: ExecutorParameters, b: ExecutorParameters) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(
    ([name, value]) => Object.hasOwn(b, name) && b[name] === value,
  )

/**
 * Finds the executor and its parameters under a settings name for an
 * assignment type, and checks them against the executor's declaration,
 * without calling a provider. Refuses with `unknown_settings`,
 * `unsupported_type`, `invalid_parameters` or `not_configured` (T1-R04).
 */
export function resolveExecutor(
  settingsName: string,
  type: AssignmentType,
): ResolvedExecutor {
  const parsed = settingsSchema.safeParse(
    Object.hasOwn(assignmentSettings, settingsName)
      ? assignmentSettings[settingsName]
      : undefined,
  )
  if (!parsed.success) throw new AssignmentError('unknown_settings')
  const executor = executorDeclaration(parsed.data.executor)
  if (!executor) throw new AssignmentError('unknown_settings')
  const service = executor.services[type]
  if (!service) throw new AssignmentError('unsupported_type')
  const parameters = parsed.data.parameters
  const offer = service.offers.find((candidate) =>
    sameParameters(candidate.parameters, parameters),
  )
  if (!offer) throw new AssignmentError('invalid_parameters')
  if (!executor.configured(parameters))
    throw new AssignmentError('not_configured')
  return { executor, service, parameters, offer }
}
