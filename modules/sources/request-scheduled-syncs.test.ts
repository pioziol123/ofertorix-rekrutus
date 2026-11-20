import { describe, expect, it, vi } from 'vitest'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import type { SourceConnector } from './infrastructure/adapters/connector.ts'
import { requestScheduledSyncs } from './request-scheduled-syncs.ts'
import { requestSync } from './request-sync.ts'

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
  it('returns only the runs created now, not an unfinished run a request met (B5-R07)', async () => {
    vi.mocked(requestSync)
      .mockResolvedValueOnce({ id: 'unfinished-run', existing: true })
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

  it('passes any error on', async () => {
    vi.mocked(requestSync).mockRejectedValueOnce(new Error('queue down'))
    await expect(
      requestScheduledSyncs({
        connectors: createConnectorRegistry([scheduled('first')]),
      }),
    ).rejects.toThrow('queue down')
  })
})
