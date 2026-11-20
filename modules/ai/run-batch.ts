import { transaction } from '../../lib/db.ts'
import { sendExecutionJob } from './execution-jobs.ts'
import { archiveArtifact } from './infrastructure/persistence/batch-archive.ts'
import {
  batchGroupsInProgress,
  claimGroup,
  endedBatchGroups,
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
  endAsUnknown,
  noOutcome,
  responseOutcome,
  settlementOf,
  type Outcome,
} from './run-execution.ts'

/**
 * The coordination of a provider batch. A group's items move together:
 * the job that takes the queued items has the adapter send them; the
 * periodic process has it poll and collect the sent batch (B6-D03). When the batch ends, the
 * outcome of every item is saved, with the adapter's state, in one
 * transaction, and each item's job delivers its outcome on its own, so an
 * error in one item's delivery does not hold the others back. The
 * coordination stores the adapter's state and never reads it.
 */

/**
 * The context of one step: the adapter's state as it was read, and a save
 * that succeeds only while no other run has changed it since. The run that
 * took the group (`claimed`) saves only while the group still runs.
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
        saveGroupAdapterState(groupId, current, next, claimed),
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
 * ended batch, and sends each item's delivery job. Nothing is saved when
 * another run changed the adapter's state first, so a batch's outcomes are
 * saved and settled once, nor, for the run that took the group, when the
 * group ended while it was being sent.
 */
async function saveOutcomes(
  groupId: string,
  items: ExecutionRow[],
  adapter: ProviderAdapter,
  expected: unknown,
  ended: { outcomes: Map<string, BatchItemOutcome>; state: unknown },
  claimed: boolean,
) {
  await transaction(async () => {
    if (!(await saveGroupAdapterState(groupId, expected, ended.state, claimed)))
      return
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
      if (saved)
        await sendExecutionJob(execution.id, execution.snapshot.settings)
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
        await sendExecutionJob(execution.id, execution.snapshot.settings)
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
 * Has the adapter carry the group's running items one step further: send
 * them (the run that took them) or poll and collect the sent batch, and
 * saves the outcomes once it ends.
 */
async function advance(
  groupId: string,
  items: ExecutionRow[],
  found: { adapter: ProviderAdapter; runner: BatchRunner },
  claimed: boolean,
) {
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
  await saveOutcomes(
    groupId,
    items,
    found.adapter,
    context.current(),
    step,
    claimed,
  )
}

/**
 * What a job of a batch item does with its group. The job that takes the
 * group's queued items has the adapter send them. A job that takes none
 * and finds the group running while it is still being sent finds a sending
 * that an ended attempt left: every running item ends as uncertain with
 * the cause unknown, keeping its reservation (B6-R05). A group already
 * sent is left to the periodic process (B6-D03).
 */
export async function carryOutBatchItem(groupId: string): Promise<void> {
  const claimed = (await transaction(() => claimGroup(groupId))) > 0
  const items = await runningGroupRows(groupId)
  if (!items.length) return
  const found = runnerOf(items[0]!)
  // No adapter can carry the batch any more: its items end as before.
  if (!found) return endUnavailable(items)
  if (claimed) return advance(groupId, items, found, true)
  if (found.runner.sending(items[0]!.adapterState))
    await transaction(async () => {
      for (const execution of items) await endAsUnknown(execution)
    })
}

/**
 * Runs `step` for each group, so that an error of one group does not hold
 * the others back; the errors are raised together afterwards.
 */
async function eachGroup(
  groupIds: string[],
  step: (groupId: string) => Promise<void>,
) {
  const errors: unknown[] = []
  for (const groupId of groupIds)
    await step(groupId).catch((error: unknown) => errors.push(error))
  if (errors.length)
    throw new AggregateError(errors, `${errors.length} batch groups failed`)
}

/**
 * A step of the periodic process (B6-R09): polls and collects every sent
 * batch group, saves the outcomes of a batch that ended and sends their
 * delivery jobs. A group still being sent belongs to the job sending it
 * and is skipped.
 */
export async function advanceSentBatches(): Promise<void> {
  await eachGroup(await batchGroupsInProgress(), async (groupId) => {
    const items = await runningGroupRows(groupId)
    if (!items.length) return
    const found = runnerOf(items[0]!)
    if (!found) return endUnavailable(items)
    if (found.runner.sending(items[0]!.adapterState)) return
    await advance(groupId, items, found, false)
  })
}

/**
 * A step of the periodic process (B6-R09): removes what each ended batch
 * left at the provider, when its adapter says it still needs it; a failed
 * removal is tried again by a later pass.
 */
export async function cleanUpEndedBatches(): Promise<void> {
  await eachGroup(await endedBatchGroups(), cleanUp)
}
