import { randomUUID } from 'node:crypto'
import { db } from '../../lib/db.ts'
import { attemptCeiling } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { sendExecutionJob } from './execution-queue.ts'
import type { ExecutionMode, ExecutionSettings } from './execution-settings.ts'
import { reserve } from './infrastructure/persistence/budget.ts'
import {
  insertExecution,
  type ExecutionSnapshot,
} from './infrastructure/persistence/executions.ts'
import { enqueueLocal } from './infrastructure/persistence/local-slot.ts'
import { providerAdapter } from './provider-registry.ts'

export type Admission = {
  settingsKey: string
  operationId: string
  inputVersion: string | null
  mode: ExecutionMode
  groupId: string | null
  supersedes: string | null
  snapshot: ExecutionSnapshot
  attempt: number
  generation: string
}

export type RequestedExecution = {
  executionId: string
  state: 'queued' | 'waiting_budget'
}

/**
 * The funding of executions that share settings: the budget covers all of
 * them or none. Work on a model without a price list costs nothing and is
 * funded without a reservation.
 */
async function fund(count: number, settings: ExecutionSettings) {
  if (!settings.pricing) return { month: null, reserved: '0' }
  const ceiling = attemptCeiling(settings.pricing)
  const others = money(decimal(ceiling) * BigInt(count - 1))
  const budget = await reserve(db(), settings.pricing, new Date(), others)
  return budget.enough ? { month: budget.month, reserved: ceiling } : null
}

/**
 * Saves executions that share settings, in the current transaction. Funded
 * ones are queued, the others wait for budget. Executions of a provider on
 * the shared local slot also take their place in the local queue.
 */
export async function admitExecutions(
  admissions: Admission[],
  settings: ExecutionSettings,
): Promise<RequestedExecution[]> {
  const funding = await fund(admissions.length, settings)
  const sharedSlot = providerAdapter(settings.provider)?.sharedSlot === true
  const requested: RequestedExecution[] = []
  for (const admission of admissions) {
    const executionId = randomUUID()
    const state = await insertExecution({
      ...admission,
      id: executionId,
      publicationToken: randomUUID(),
      attempt: {
        id: randomUUID(),
        number: admission.attempt,
        generation: admission.generation,
        funding,
      },
    })
    if (sharedSlot) await enqueueLocal(executionId)
    if (funding) await sendExecutionJob(executionId)
    requested.push({ executionId, state })
  }
  return requested
}
