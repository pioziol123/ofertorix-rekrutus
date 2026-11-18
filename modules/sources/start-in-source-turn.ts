import { setTimeout as delay } from 'node:timers/promises'
import { transaction } from '../../lib/db.ts'
import type { SyncRunWork } from './execute-sync-run.ts'
import {
  findRunsAhead,
  lockSourceTurn,
} from './infrastructure/persistence/sync-runs.ts'
import type { SyncJobLookup } from './infrastructure/worker/sync-queue.ts'
import { readRun, startRun, type SyncRun } from './sync-run-state.ts'

/**
 * Starts the run for the queue attempt once it is its source's turn
 * (F2-06), and returns it; null when the attempt cannot take the run
 * (redelivery, finished run).
 *
 * The queue's group limit lets one job per source in at a time, but two
 * workers fetching at the same moment may each take a job of the same
 * source. So the start also checks, under the source's transaction lock,
 * that no other run of the source is running with an active job and that
 * no run of the source queued before this one already has an active job,
 * i.e. is about to start. Otherwise the attempt waits and checks again; an
 * aborted signal ends the wait with an error. A run ahead whose job is not
 * active (waiting for a retry, ended) does not hold the turn: the queue
 * keeps its job out until this one ends, and recovery ends a run without
 * work. Only a running run of the same scope, which the database lets run
 * once per scope, makes the attempt wait whatever its job's state, until
 * recovery ends it.
 *
 * ASSUMPTION(oferty-pracy-0mq.16/ASM-3): this second guard next to the
 * queue's group limit exists because that limit is not strict for
 * concurrent fetches.
 */
export async function startInSourceTurn(
  work: SyncRunWork,
  findJob: SyncJobLookup,
  pauseMs = 500,
): Promise<SyncRun | null> {
  for (;;) {
    const turn = await transaction(async () => {
      const run = await readRun(work.runId)
      if (!run) return { run: null }
      await lockSourceTurn(run.source)
      for (const ahead of await findRunsAhead(run.id)) {
        if (!ahead.jobId) continue
        const job = await findJob({ source: run.source, jobId: ahead.jobId })
        if (job?.state === 'active') return 'wait'
      }
      return { run: await startRun(work.runId, work) }
    }).catch((error: unknown) => {
      // ASSUMPTION(oferty-pracy-0mq.16/ASM-3): another run of the same
      // scope is still running, though its job no longer is (its attempts
      // are used up and recovery has not ended it yet). The run stays
      // queued: "not yet", not a failed attempt (0mq.3, Start).
      if ((error as { code?: unknown }).code === '23505') return 'wait' as const
      throw error
    })
    if (turn !== 'wait') return turn.run
    await delay(pauseMs, undefined, { signal: work.signal })
  }
}
