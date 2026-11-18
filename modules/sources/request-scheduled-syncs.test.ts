import { describe, expect, it, vi } from 'vitest'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import type { SourceConnector } from './infrastructure/adapters/connector.ts'
import { requestScheduledSyncs } from './request-scheduled-syncs.ts'
import { requestSync } from './request-sync.ts'
import { AdmittedRunFinishedError } from './sync-run-state.ts'

vi.mock('../../lib/db.ts', () => ({
  transaction: (work: () => Promise<unknown>) => work(),
}))
vi.mock('./infrastructure/persistence/sync-runs.ts', () => ({
  lockScheduleOccurrence: vi.fn(async () => {}),
  hasScheduledRun: vi.fn(async () => false),
}))
vi.mock('./request-sync.ts', () => ({ requestSync: vi.fn() }))

const scheduled = (name: string): SourceConnector => ({
  name,
  infersUnavailabilityFromAbsence: false,
  scheduled: true,
  enabled: () => true,
  scopeParameters: () => ({ source: name }),
  fetch: async () => ({ complete: true }),
})

describe('schedule requests', () => {
  it('leaves an occurrence whose request met a finishing run to the next check, and requests the other sources', async () => {
    vi.mocked(requestSync)
      .mockRejectedValueOnce(new AdmittedRunFinishedError())
      .mockResolvedValueOnce({ id: 'other-run', existing: false })
    const connectors = createConnectorRegistry([
      scheduled('first'),
      scheduled('second'),
    ])
    expect(
      await requestScheduledSyncs({
        connectors,
        now: new Date('2026-11-18T08:00:00Z'),
      }),
    ).toEqual([{ id: 'other-run', existing: false }])
  })

  it('passes any other error on', async () => {
    vi.mocked(requestSync).mockRejectedValueOnce(new Error('queue down'))
    await expect(
      requestScheduledSyncs({
        connectors: createConnectorRegistry([scheduled('first')]),
      }),
    ).rejects.toThrow('queue down')
  })
})
