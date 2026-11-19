import { transaction, db } from '../../lib/db.ts'
import { attemptCeiling } from './domain/cost.ts'
import { decimal, money } from './domain/money.ts'
import { resendExecutionJob, sendExecutionJob } from './execution-queue.ts'
import { reserve } from './infrastructure/persistence/budget.ts'
import {
  batchGroupsInProgress,
  endedBatchGroups,
  executionsInState,
  fundExecution,
  readExecutionRow,
  runningWithoutLiveLease,
  saveOutcome,
  type EndGuard,
  type ExecutionRow,
} from './infrastructure/persistence/executions.ts'
import { observeLapsedLeases } from './infrastructure/persistence/local-slot.ts'
import type { ProviderAdapter } from './provider-adapter.ts'
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
    return endLost(execution, adapter)
  })
  return ended
}

/**
 * Ends a running execution whose runner was lost, with the end its adapter
 * gives a lost lease, keeping the reservation (an uncertain settlement),
 * and queues the delivery of that end. With a guard, the end is a
 * conditional state change: of concurrent recoveries and a late worker's
 * save, exactly one ends the execution.
 */
async function endLost(
  execution: ExecutionRow,
  adapter: ProviderAdapter,
  guard?: EndGuard,
) {
  const outcome = {
    ...noOutcome(),
    end: adapter.endOf({ kind: 'lost_lease', processEnded: false }),
  }
  const saved = await saveOutcome(
    execution.id,
    { result: null, end: outcome.end },
    settlementOf(execution, outcome),
    guard,
  )
  if (saved) await sendExecutionJob(execution.id)
  return saved
}

/**
 * Ends the paid executions whose worker was lost: running without a live
 * lease, by the database clock, including those that ran before leases
 * existed. Executions on the shared local slot keep their own lease rule.
 * A provider batch is ended only while it is being sent; one already sent
 * is left to polling.
 */
async function endInterrupted() {
  for (const execution of await runningWithoutLiveLease()) {
    const settings = execution.snapshot.settings
    const adapter = providerAdapter(settings.provider)
    if (!adapter || adapter.sharedSlot) continue
    if (execution.mode === 'batch') {
      const runner = adapter.modes.batch?.(settings)
      if (runner && !runner.sending(execution.adapterState)) continue
    }
    await transaction(() => endLost(execution, adapter, { lapsed: true }))
  }
}

/**
 * Funds the executions that wait for budget, a group as a whole or not at
 * all, and sends again the jobs of queued executions whose job may be lost.
 * A running execution whose lease of the shared local slot lapsed ends as
 * its adapter decides, keeping the slot; paid work whose worker was lost
 * ends as interrupted, keeping its reservation. A provider batch gets its
 * next step (polling, or cleaning up once it ended).
 */
export async function recoverExecutions(): Promise<void> {
  for (const executionId of await observeLapsedLeases())
    await endLapsed(executionId)
  await endInterrupted()
  for (const execution of await executionsInState('queued'))
    await resendExecutionJob(execution.id)
  await continueBatches()
  const waiting = await executionsInState('waiting_budget')
  const groups = new Map<string, ExecutionRow[]>()
  for (const execution of waiting) {
    const key = execution.groupId ?? execution.id
    groups.set(key, [...(groups.get(key) ?? []), execution])
  }
  for (const group of groups.values()) await fund(group)
}

/**
 * Sends a job for each provider batch that is still running, so that its
 * adapter polls it, and for each ended one whose adapter still has to
 * clean up at the provider. A batch in sending belongs to the run sending
 * it: its adapter waits, and the batch ends as interrupted once that run's
 * lease lapsed.
 */
async function continueBatches() {
  for (const group of await batchGroupsInProgress())
    await resendExecutionJob(group.executionId)
  for (const group of await endedBatchGroups()) {
    const settings = group.snapshot.settings
    const runner = providerAdapter(settings.provider)?.modes.batch?.(settings)
    if (runner?.needsCleanup(group.state))
      await resendExecutionJob(group.executionId)
  }
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
