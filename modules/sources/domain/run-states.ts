/**
 * The closed lists of a sync run's statuses and ways of starting, owned here
 * once (architecture rules, cost 4). The run state, the worker, the request
 * and the sync history read their types from these lists, so a value added
 * here fails the typecheck wherever a place does not handle it. Pure, so the
 * page may read them through the module's view entry.
 */

export const finishedRunStatuses = ['complete', 'partial', 'failed'] as const
export type FinishedRunStatus = (typeof finishedRunStatuses)[number]

export const syncRunStatuses = [
  'queued',
  'running',
  ...finishedRunStatuses,
] as const
export type SyncRunStatus = (typeof syncRunStatuses)[number]

export const runTriggers = ['manual', 'scheduled'] as const
export type RunTrigger = (typeof runTriggers)[number]
