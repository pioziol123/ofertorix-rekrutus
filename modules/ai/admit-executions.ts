import { randomUUID } from 'node:crypto'
import { db } from '../../lib/db.ts'
import { attemptCeiling } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { sendExecutionJob } from './execution-queue.ts'
import type {
  AiJobType,
  ExecutionMode,
  ExecutionSettings,
} from './execution-settings.ts'
import { reserve } from './infrastructure/persistence/budget.ts'
import {
  insertExecution,
  type ExecutionSnapshot,
} from './infrastructure/persistence/executions.ts'

export type Admission = {
  jobType: AiJobType
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
 * Saves executions that share settings, in the current transaction. The
 * budget covers all of them or none: funded ones are queued, the others
 * wait for budget.
 */
export async function admitExecutions(
  admissions: Admission[],
  settings: ExecutionSettings,
): Promise<RequestedExecution[]> {
  const ceiling = attemptCeiling(settings.pricing)
  const others = money(decimal(ceiling) * BigInt(admissions.length - 1))
  const budget = await reserve(db(), settings.pricing, new Date(), others)
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
        funding: budget.enough
          ? { month: budget.month, reserved: ceiling }
          : null,
      },
    })
    if (budget.enough) await sendExecutionJob(executionId)
    requested.push({ executionId, state })
  }
  return requested
}
