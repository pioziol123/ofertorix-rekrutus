import { setTimeout as delay } from 'node:timers/promises'
import { readRun, type SyncRun } from './sync-run-state.ts'

/**
 * Waits until the run is finished and returns it (F2-10): reads its state
 * every `intervalMs`, with no time limit, also for a pending run another
 * request created. Stopping the wait does not change the run. Throws when
 * the run does not exist.
 */
export async function waitForSyncRun(
  runId: string,
  options: {
    intervalMs?: number
    /** Tests replace the pause between reads. */
    sleep?: (ms: number) => Promise<unknown>
  } = {},
): Promise<SyncRun> {
  const sleep = options.sleep ?? delay
  for (;;) {
    const run = await readRun(runId)
    if (!run) throw new Error('Sync run not found')
    if (run.status !== 'queued' && run.status !== 'running') return run
    await sleep(options.intervalMs ?? 1000)
  }
}
