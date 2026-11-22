import { z } from 'zod'
import type {
  Executor,
  ExecutorParameters,
  ServiceDeclaration,
  ServiceOffer,
} from '../executors/declaration.ts'
import { findExecutor } from '../executors/registry.ts'
import { assignmentSettings } from './assignment-settings.ts'
import { AssignmentError, type AssignmentType } from './assignment.ts'

const settingsSchema = z
  .object({
    executor: z.string().trim().min(1),
    parameters: z.record(z.string(), z.string().nullable()),
    requestingModule: z.string().trim().min(1),
  })
  .strict()

/**
 * The requesting module's display name under a settings name (T11-R05);
 * the settings name itself when the table no longer holds valid settings
 * under it, so an assignment placed under them is still shown.
 * ASSUMPTION(oferty-pracy-sq2.12/ASM-1)
 */
export function requestingModuleName(settingsName: string): string {
  const parsed = settingsSchema.safeParse(
    Object.hasOwn(assignmentSettings, settingsName)
      ? assignmentSettings[settingsName]
      : undefined,
  )
  return parsed.success ? parsed.data.requestingModule : settingsName
}

/** The executor found for a settings name and a type, with its offer. */
export type ResolvedExecutor = {
  executor: Executor
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
 * The offer of an executor for an assignment type with exactly these
 * parameters, as its declaration gives it now; undefined when the executor
 * does not serve the type or no longer offers the parameters.
 */
export function findOffer(
  executor: Executor,
  type: AssignmentType,
  parameters: ExecutorParameters,
): ServiceOffer | undefined {
  return executor.services[type]?.offers.find((candidate) =>
    sameParameters(candidate.parameters, parameters),
  )
}

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
  const executor = findExecutor(parsed.data.executor)
  if (!executor) throw new AssignmentError('unknown_settings')
  const service = executor.services[type]
  if (!service) throw new AssignmentError('unsupported_type')
  const parameters = parsed.data.parameters
  const offer = findOffer(executor, type, parameters)
  if (!offer) throw new AssignmentError('invalid_parameters')
  if (!executor.configured(parameters))
    throw new AssignmentError('not_configured')
  return { executor, service, parameters, offer }
}
