import { transaction } from '../../lib/db.ts'
import { hash } from './domain/canonical-hash.ts'
import type { ConnectorAd } from './infrastructure/adapters/connector.ts'
import {
  addCurrentRevision,
  insertObservation,
  upsertObservedAd,
} from './infrastructure/persistence/source-ads.ts'
import { addBatchToRunCounters } from './infrastructure/persistence/sync-runs.ts'

/** The run a batch belongs to. */
export type BatchRun = { id: string; scopeId: string; source: string }

export type BatchSummary = {
  /** Ads seen for the first time in this run. */
  newObservations: number
  /** Ads the run had already seen, in this batch or an earlier one. */
  repeatedObservations: number
  newRevisions: number
}

/** Saving a batch failed and nothing of it was kept; `cause` holds why. */
export class BatchSaveError extends Error {
  override name = 'BatchSaveError'
  constructor(cause: unknown) {
    super('Saving the batch of source ads failed', { cause })
  }
}

/**
 * Saves one batch of a run's ads: each ad is upserted as observed and
 * available with the source's expiry, the run's observation is recorded and
 * changed content becomes a new current revision. Ads outside the batch keep
 * their availability (F2-12). Repeated ads do not stop the save (F2-03).
 *
 * The whole batch, with the run's counters, is one transaction: on its own a
 * transaction per batch, inside a running transaction a part of it. Any
 * failure rolls the batch back and is thrown as `BatchSaveError`.
 */
export async function saveBatch(
  run: BatchRun,
  ads: ConnectorAd[],
): Promise<BatchSummary> {
  try {
    return await transaction(async () => {
      const summary: BatchSummary = {
        newObservations: 0,
        repeatedObservations: 0,
        newRevisions: 0,
      }
      for (const ad of ads) {
        const stored = await upsertObservedAd({
          source: run.source,
          externalId: ad.externalId,
          url: ad.url,
          validTo: ad.validTo,
          scopeId: run.scopeId,
        })
        if (await insertObservation(run.id, stored.id))
          summary.newObservations++
        else summary.repeatedObservations++
        const contentHash = hash(ad.content)
        if (contentHash !== stored.currentContentHash) {
          await addCurrentRevision(stored.id, contentHash, ad.content)
          summary.newRevisions++
        }
      }
      await addBatchToRunCounters(run.id, {
        uniqueAds: summary.newObservations,
        revisions: summary.newRevisions,
      })
      return summary
    })
  } catch (error) {
    throw new BatchSaveError(error)
  }
}
