import { transaction } from '../../lib/db.ts'
import { sendExecutionJob } from './execution-queue.ts'
import { archiveArtifact } from './infrastructure/persistence/batch-archive.ts'
import {
  claimGroup,
  readGroupAdapterState,
  runningGroupRows,
  saveGroupAdapterState,
  saveOutcome,
  type ExecutionRow,
} from './infrastructure/persistence/executions.ts'
import type {
  BatchContext,
  BatchItemOutcome,
  BatchRunner,
  ProviderAdapter,
} from './provider-adapter.ts'
import { providerAdapter } from './provider-registry.ts'
import {
  noOutcome,
  responseOutcome,
  settlementOf,
  type Outcome,
} from './run-execution.ts'

/**
 * The coordination of a provider batch. A group's items move together:
 * the run that takes the queued items has the adapter send them; later
 * runs have it poll and collect the batch. When the batch ends, the
 * outcome of every item is saved, with the adapter's state, in one
 * transaction, and each item's job delivers its outcome on its own, so an
 * error in one item's delivery does not hold the others back. The
 * coordination stores the adapter's state and never reads it.
 */

/**
 * The context of one step: the adapter's state as it was read, and a save
 * that succeeds only while no other run has changed it since.
 */
function batchContext(
  groupId: string,
  state: unknown,
  claimed: boolean,
): BatchContext & { current: () => unknown } {
  let current = state
  return {
    groupId,
    state,
    claimed,
    current: () => current,
    async save(next) {
      const saved = await transaction(() =>
        saveGroupAdapterState(groupId, current, next),
      )
      if (saved) current = next
      return saved
    },
    archive: (kind, key, content) =>
      transaction(() => archiveArtifact(groupId, kind, key, content)),
  }
}

/** What one item's outcome means, read like the response of a single call. */
function itemOutcome(
  execution: ExecutionRow,
  adapter: ProviderAdapter,
  outcome: BatchItemOutcome | undefined,
): Outcome {
  if (outcome?.kind === 'response')
    return responseOutcome(
      outcome.response,
      adapter,
      execution.snapshot.responseSchema.schema,
    )
  if (outcome)
    return {
      ...noOutcome(),
      end: outcome.end,
      usage: outcome.usage,
      responseId: outcome.responseId,
      notSent: outcome.notCharged,
    }
  // An adapter must give every item an outcome; one it did not is ended
  // with its cost unknown.
  return { ...noOutcome(), end: { state: 'failed', cause: 'unknown' } }
}

/**
 * Saves the outcome of every running item with the adapter's state of the
 * ended batch, and queues each item's delivery. Nothing is saved when
 * another run changed the adapter's state first, so a batch's outcomes are
 * saved and settled once.
 */
async function saveOutcomes(
  groupId: string,
  items: ExecutionRow[],
  adapter: ProviderAdapter,
  expected: unknown,
  ended: { outcomes: Map<string, BatchItemOutcome>; state: unknown },
) {
  await transaction(async () => {
    if (!(await saveGroupAdapterState(groupId, expected, ended.state))) return
    for (const execution of items) {
      const outcome = itemOutcome(
        execution,
        adapter,
        ended.outcomes.get(execution.operationId),
      )
      const saved = await saveOutcome(
        execution.id,
        { result: outcome.result, end: outcome.end },
        settlementOf(execution, outcome),
      )
      if (saved) await sendExecutionJob(execution.id)
    }
  })
}

/** Ends every running item when no adapter can carry the batch. */
async function endUnavailable(items: ExecutionRow[]) {
  await transaction(async () => {
    for (const execution of items) {
      const outcome: Outcome = {
        ...noOutcome(),
        end: { state: 'failed', cause: 'adapter_unavailable' },
        notSent: true,
      }
      if (
        await saveOutcome(
          execution.id,
          { result: null, end: outcome.end },
          settlementOf(execution, outcome),
        )
      )
        await sendExecutionJob(execution.id)
    }
  })
}

function runnerOf(execution: {
  snapshot: ExecutionRow['snapshot']
}): { adapter: ProviderAdapter; runner: BatchRunner } | null {
  const settings = execution.snapshot.settings
  const adapter = providerAdapter(settings.provider)
  const runner = adapter?.modes.batch?.(settings)
  return adapter && runner ? { adapter, runner } : null
}

/** Removes what an ended batch left at the provider, when it needs it. */
async function cleanUp(groupId: string) {
  const saved = await readGroupAdapterState(groupId)
  if (!saved) return
  const found = runnerOf(saved)
  if (!found || !found.runner.needsCleanup(saved.state)) return
  await found.runner.cleanup(batchContext(groupId, saved.state, false))
}

/**
 * Carries a batch group one step further: takes its queued items, has the
 * adapter send, poll or collect the batch, saves the outcomes once it
 * ends, and cleans up what it left at the provider.
 */
export async function runBatch(groupId: string): Promise<void> {
  const claimed = (await transaction(() => claimGroup(groupId))) > 0
  const items = await runningGroupRows(groupId)
  if (items.length) {
    const found = runnerOf(items[0]!)
    if (!found) {
      await endUnavailable(items)
      return
    }
    const context = batchContext(groupId, items[0]!.adapterState, claimed)
    const step = await found.runner.advance(
      items.map((execution) => ({
        itemId: execution.operationId,
        request: {
          model: execution.snapshot.settings.model,
          instructions: execution.snapshot.instruction,
          input: execution.snapshot.input,
          output: execution.snapshot.responseSchema,
        },
      })),
      context,
    )
    if (step.kind === 'wait') return
    await saveOutcomes(groupId, items, found.adapter, context.current(), step)
  }
  await cleanUp(groupId)
}
