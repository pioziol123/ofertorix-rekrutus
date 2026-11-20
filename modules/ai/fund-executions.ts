import { db, transaction } from '../../lib/db.ts'
import { attemptCeiling } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { sendExecutionJob } from './execution-jobs.ts'
import { reserve } from './infrastructure/persistence/budget.ts'
import {
  executionsInState,
  fundExecution,
  type ExecutionRow,
} from './infrastructure/persistence/executions.ts'

/**
 * A step of the periodic process (B6-R01, B6-R09): funds the executions
 * that wait for budget, a group as a whole or not at all, and sends the job
 * of each execution it funded, in the same transaction. Funding is a
 * conditional write, so a repeated pass funds nothing twice.
 */
export async function fundWaitingExecutions(): Promise<void> {
  const groups = new Map<string, ExecutionRow[]>()
  for (const execution of await executionsInState('waiting_budget')) {
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
        await sendExecutionJob(execution.id, execution.snapshot.settings)
  })
}
