/**
 * Test connectors of the Sources tests: sources `test-1` … `test-8`, the
 * scheduled `test-scheduled` and the disabled `test-disabled`. A scope is
 * `{ scope: <name> }`; each fetch of a scope takes the next plan the test
 * stored for it in `sync_test_plans`, so a later attempt of the same run can
 * behave differently. They run in the test process and in the worker's
 * pool processes.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { db } from '../../../lib/db.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createConnectorRegistry } from '../../../modules/sources/infrastructure/adapters/connector-registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  ConnectorError,
  toConnectorAd,
  type SourceConnector,
} from '../../../modules/sources/infrastructure/adapters/connector.ts'

/** What one fetch does. */
export type FetchPlan = {
  /** External ids of the ads of each batch, saved one batch after another. */
  batches: string[][]
  /** Pause after each batch. */
  pauseMs?: number
  /**
   * How the fetch ends: the whole scope checked; part of it; a connector
   * error with a safe message; an error the sync handler does not handle;
   * never.
   */
  end: 'complete' | 'partial' | 'connector-error' | 'throw' | 'hang'
}

export const planTables = `
  CREATE TABLE sync_test_plans (
    scope text NOT NULL, seq int NOT NULL, plan jsonb NOT NULL,
    PRIMARY KEY (scope, seq)
  );
  CREATE TABLE sync_test_fetches (scope text PRIMARY KEY, n int NOT NULL);
`

/** Stores the plans of the next fetches of the scope, in order. */
export async function planFetches(scope: string, ...plans: FetchPlan[]) {
  const { rows } = await db().query(
    'SELECT coalesce(max(seq),0)::int AS last FROM sync_test_plans WHERE scope=$1',
    [scope],
  )
  for (const [index, plan] of plans.entries())
    await db().query(
      'INSERT INTO sync_test_plans(scope,seq,plan) VALUES ($1,$2,$3)',
      [scope, rows[0].last + index + 1, plan],
    )
}

async function nextPlan(scope: string): Promise<FetchPlan> {
  const { rows } = await db().query(
    `INSERT INTO sync_test_fetches(scope,n) VALUES ($1,1)
     ON CONFLICT (scope) DO UPDATE SET n=sync_test_fetches.n+1 RETURNING n`,
    [scope],
  )
  const plan = await db().query(
    'SELECT plan FROM sync_test_plans WHERE scope=$1 AND seq=$2',
    [scope, rows[0].n],
  )
  if (!plan.rows[0])
    throw new Error(`No plan for fetch ${rows[0].n} of ${scope}`)
  return plan.rows[0].plan as FetchPlan
}

function testConnector(
  name: string,
  options: { scheduled?: boolean; enabled?: boolean } = {},
): SourceConnector {
  return {
    name,
    infersUnavailabilityFromAbsence: true,
    scheduled: options.scheduled ?? false,
    enabled: () => options.enabled ?? true,
    scopeParameters(request) {
      const scope = (request as { scope?: unknown } | undefined)?.scope ?? name
      if (typeof scope !== 'string' || scope === '')
        throw new ConnectorError('Invalid sync settings')
      return { source: name, scope }
    },
    async fetch(parameters, onBatch) {
      const plan = await nextPlan(String(parameters.scope))
      for (const batch of plan.batches) {
        await onBatch(
          batch.map((id) =>
            toConnectorAd({
              jobOfferKey: id,
              url: `https://example.test/${id}`,
            }),
          ),
        )
        if (plan.pauseMs) await sleep(plan.pauseMs)
      }
      switch (plan.end) {
        case 'complete':
          return { complete: true }
        case 'partial':
          return { complete: false, reason: 'Limit reached' }
        case 'connector-error':
          throw new ConnectorError('Portal answered HTTP 500')
        case 'throw':
          // An error after the fetch that the sync handler does not handle,
          // so the attempt fails.
          return {
            get complete(): true {
              throw new Error('Test fault after the fetch')
            },
          }
        case 'hang':
          await new Promise(() => {})
      }
      throw new Error(`Unknown end of plan: ${String(plan.end)}`)
    },
  }
}

export const testConnectors = createConnectorRegistry([
  ...Array.from({ length: 8 }, (_, index) =>
    testConnector(`test-${index + 1}`),
  ),
  testConnector('test-scheduled', { scheduled: true }),
  testConnector('test-disabled', { enabled: false }),
])
