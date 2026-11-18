import { transaction, db } from '../../lib/db.ts'
import { attemptCeiling } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { resendExecutionJob, sendExecutionJob } from './execution-queue.ts'
import { reserve } from './infrastructure/persistence/budget.ts'
import {
  executionsInState,
  fundExecution,
  readExecutionRow,
  saveOutcome,
  type ExecutionRow,
} from './infrastructure/persistence/executions.ts'
import { observeLapsedLeases } from './infrastructure/persistence/local-slot.ts'
import { providerAdapter } from './provider-registry.ts'
import { noOutcome, settlementOf } from './run-execution.ts'

/**
 * Ends, through its adapter, a running execution whose lease of the shared
 * local slot lapsed: the process is in an unknown state, the slot stays
 * occupied, and the end is delivered to the client.
 */
async function endLapsed(executionId: string) {
  const ended = await transaction(async () => {
    const execution = await readExecutionRow(executionId)
    const adapter = providerAdapter(execution?.snapshot.settings.provider ?? '')
    if (execution?.state !== 'running' || !adapter) return false
    const outcome = {
      ...noOutcome(),
      end: adapter.endOf({ kind: 'lost_lease' }),
    }
    const saved = await saveOutcome(
      executionId,
      { result: null, end: outcome.end },
      settlementOf(execution, outcome),
    )
    if (saved) await sendExecutionJob(executionId)
    return saved
  })
  return ended
}

/**
 * Funds the executions that wait for budget, a group as a whole or not at
 * all, and sends again the jobs of queued executions whose job may be lost.
 * A running execution whose lease of the shared local slot lapsed ends as
 * its adapter decides, keeping the slot. Any other running execution is
 * left alone: detecting interrupted work belongs to task
 * oferty-pracy-0mq.15.
 */
export async function recoverExecutions(): Promise<void> {
  for (const executionId of await observeLapsedLeases())
    await endLapsed(executionId)
  for (const execution of await executionsInState('queued'))
    await resendExecutionJob(execution.id)
  const waiting = await executionsInState('waiting_budget')
  const groups = new Map<string, ExecutionRow[]>()
  for (const execution of waiting) {
    const key = execution.groupId ?? execution.id
    groups.set(key, [...(groups.get(key) ?? []), execution])
  }
  for (const group of groups.values()) await fund(group)
}

async function fund(group: ExecutionRow[]) {
  const pricing = group[0]!.snapshot.settings.pricing
  if (!pricing) return
  const ceiling = attemptCeiling(pricing)
  await transaction(async () => {
    const others = money(decimal(ceiling) * BigInt(group.length - 1))
    const budget = await reserve(db(), pricing, new Date(), others)
    if (!budget.enough) return
    for (const execution of group)
      if (
        await fundExecution(execution.id, {
          month: budget.month,
          reserved: ceiling,
        })
      )
        await sendExecutionJob(execution.id)
  })
}
