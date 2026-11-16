import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { setPool } from '../lib/db.ts'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  HimalayasHttpError,
  parsePage,
  type HimalayasPage,
} from '../lib/sources/himalayas.ts'
import { syncHimalayas } from '../lib/sources/himalayas-sync.ts'
import { hash } from '../lib/sources/solid.ts'
import { readOffers } from '../lib/offers.ts'
import { himalayasWith } from './source-connectors.fixtures.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
const raw = (id: string, overrides: Record<string, unknown> = {}) => ({
  guid: `https://himalayas.app/companies/acme/jobs/${id}`,
  applicationLink: `https://himalayas.app/companies/acme/jobs/${id}?ref=api%2Bfeed`,
  title: 'Senior PHP Engineer',
  description: '<p>Full description</p>',
  pubDate: 1_700_000_000,
  expiryDate: 1_800_000_000,
  locationRestrictions: ['Poland'],
  ...overrides,
})
const page = (
  ids: string[],
  overrides: Partial<HimalayasPage> = {},
): HimalayasPage => ({
  ...parsePage(
    {
      jobs: ids.map((id) => raw(id)),
      totalCount: ids.length,
      offset: 0,
      limit: 20,
    },
    1,
  ),
  ...overrides,
})

integration(
  'manual Himalayas pilot persistence in an isolated PostgreSQL schema',
  () => {
    const schema = `himalayas_test_${randomUUID().replaceAll('-', '')}`
    let admin: Pool, pool: Pool
    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
        max: 4,
      })
      // The batch save uses the shared database access (T-03).
      setPool(pool)
      for (const migration of [
        '1770000000001_sources',
        '1770000000005_jobspy',
        '1770000000014_sync_run_state',
        '1770000000015_sync_run_attempt',
      ]) {
        const sql: string[] = []
        createRequire(import.meta.url)(`../migrations/${migration}.cjs`).up({
          sql: (statement: string) => sql.push(statement),
        })
        await pool.query(sql.join('\n'))
      }
    })
    beforeEach(async () => {
      await pool.query(
        'TRUNCATE source_run_seen,source_ad_revisions,source_ads,source_sync_runs,source_scopes CASCADE',
      )
    })
    afterAll(async () => {
      await pool?.end()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })
    const run = (ids: string[], overrides: Partial<HimalayasPage> = {}) =>
      syncHimalayas(himalayasWith(async () => page(ids, overrides)))

    it('persists exact source links, dates and content and projects the real source', async () => {
      const result = await run(['one'])
      expect(result).toMatchObject({
        status: 'complete',
        seen: 1,
        revisions: 1,
        pages: 1,
      })
      expect(result.diagnostics).toMatchObject({
        marketComplete: false,
        pages: 1,
        stopReason: 'exhausted',
      })
      const stored = (await pool.query('SELECT * FROM source_ads')).rows[0]
      expect(stored.source).toBe('himalayas')
      expect(stored.external_id).toBe(raw('one').guid)
      expect(stored.url).toBe(raw('one').applicationLink)
      expect(stored.valid_to.toISOString()).toBe(
        new Date(1_800_000_000_000).toISOString(),
      )
      const payload = (
        await pool.query('SELECT payload FROM source_ad_revisions')
      ).rows[0].payload
      expect(payload.sourceRecord).toEqual(raw('one'))
      expect(payload.validFrom).toBeNull()
      const offers = await readOffers(pool)
      expect(offers[0]).toMatchObject({
        source: 'Himalayas',
        url: raw('one').applicationLink,
        published: null,
        qualificationUnknown: ['PHP', 'senior'],
      })
    })

    it('stores ads with the identifiers, links, expiry, hashes and content from before connectors', async () => {
      expect((await run(['pinned'])).status).toBe('complete')
      expect(
        (
          await pool.query(
            'SELECT a.external_id,a.url,a.valid_to,r.content_hash,r.payload FROM source_ads a JOIN source_ad_revisions r ON r.id=a.current_revision_id ORDER BY a.external_id',
          )
        ).rows.map(({ payload, valid_to, ...row }) => {
          // The stored content is the content the hash was computed from.
          expect(hash(payload)).toBe(row.content_hash)
          return { ...row, valid_to: valid_to?.toISOString() ?? null }
        }),
      ).toEqual([
        {
          external_id: 'https://himalayas.app/companies/acme/jobs/pinned',
          url: 'https://himalayas.app/companies/acme/jobs/pinned?ref=api%2Bfeed',
          valid_to: '2027-01-15T08:00:00.000Z',
          content_hash:
            'd1a100ef1f4457880c11826b7dbd71d1619ea68df82b0c02ebbc7e5db27f51d7',
        },
      ])
    })

    it('is idempotent across runs and preserves changed and reverted revisions', async () => {
      expect((await run(['one'])).revisions).toBe(1)
      expect((await run(['one'])).revisions).toBe(0)
      const changed = page(['one'])
      changed.jobs[0]!.title = 'Updated Senior PHP'
      expect(
        (await syncHimalayas(himalayasWith(async () => changed))).revisions,
      ).toBe(1)
      expect((await run(['one'])).revisions).toBe(1)
      expect((await pool.query('SELECT * FROM source_ads')).rowCount).toBe(1)
      expect(
        (await pool.query('SELECT * FROM source_ad_revisions')).rowCount,
      ).toBe(3)
    })

    it('never marks unseen offers unavailable, including after a complete empty search', async () => {
      await run(['old'])
      expect((await run([])).status).toBe('complete')
      expect(
        (await pool.query('SELECT availability FROM source_ads')).rows,
      ).toEqual([{ availability: 'available' }])
    })

    it('retains saved pages and old offers after 429 without retrying or exposing response text', async () => {
      await run(['old'])
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(page(['new'], { totalCount: 21 }))
        .mockRejectedValueOnce(new HimalayasHttpError(429, '60'))
      const result = await syncHimalayas(himalayasWith(fetcher))
      expect(fetcher.mock.calls.map(([index]) => index)).toEqual([1, 2])
      expect(result).toMatchObject({
        status: 'partial',
        seen: 1,
        pages: 1,
        diagnostics: { stopReason: 'http_429', retryAfter: '60' },
      })
      expect(
        (await pool.query('SELECT availability FROM source_ads')).rows,
      ).toEqual([{ availability: 'available' }, { availability: 'available' }])
      const failed = await syncHimalayas(
        himalayasWith(async () => {
          throw new Error('secret connection string and raw HTML')
        }),
      )
      expect(failed).toMatchObject({ status: 'failed', seen: 0 })
      expect(JSON.stringify(failed)).not.toContain('secret connection')
      expect((await pool.query('SELECT * FROM source_ads')).rowCount).toBe(2)
    })

    it.each([
      'duplicates',
      'rejected',
      'missingDescriptions',
      'pagination',
      'countChange',
    ])(
      'records an incomplete read for %s without discarding valid offers',
      async (kind) => {
        const fetcher = vi.fn()
        if (kind === 'duplicates')
          fetcher
            .mockResolvedValueOnce(page(['one'], { totalCount: 21 }))
            .mockResolvedValueOnce(page(['one'], { totalCount: 21 }))
        else if (kind === 'countChange')
          fetcher
            .mockResolvedValueOnce(page(['one'], { totalCount: 21 }))
            .mockResolvedValueOnce(page(['two'], { totalCount: 22 }))
        else
          fetcher.mockResolvedValue(
            page(
              ['one'],
              kind === 'pagination' ? { valid: false } : { [kind]: 1 },
            ),
          )
        const result = await syncHimalayas(himalayasWith(fetcher))
        expect(result.status).toBe('partial')
        expect(result.seen).toBeGreaterThan(0)
        if (kind === 'duplicates') {
          expect(result.diagnostics.duplicates).toBe(1)
          expect(result.seen).toBe(1)
          expect(
            (await pool.query('SELECT * FROM source_ad_revisions')).rowCount,
          ).toBe(1)
        }
        if (kind === 'pagination' || kind === 'countChange')
          expect(result.diagnostics.stopReason).toBe('changing_pagination')
      },
    )

    it('counts a page whose ads were all repeated', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(page(['one'], { totalCount: 40 }))
        .mockResolvedValueOnce(page(['one'], { totalCount: 40 }))
      const result = await syncHimalayas(himalayasWith(fetcher))
      expect(result).toMatchObject({ status: 'partial', pages: 2, seen: 1 })
      expect(result.diagnostics).toMatchObject({ pages: 2, duplicates: 1 })
    })

    it('records a failed page save as an incomplete run with a generic message', async () => {
      await pool.query(
        `ALTER TABLE source_ad_revisions ADD CONSTRAINT reject_fixture CHECK (payload->>'title' <> 'Rejected fixture')`,
      )
      const rejected = page(['rejected'])
      rejected.jobs[0]!.title = 'Rejected fixture'
      try {
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(page(['saved'], { totalCount: 21 }))
          .mockResolvedValueOnce(rejected)
        const result = await syncHimalayas(himalayasWith(fetcher))
        // Since 0mq.5 the shared executor ends the run on a save error with
        // the generic message and keeps no source diagnostics (A5-R01).
        expect(result).toMatchObject({
          status: 'partial',
          seen: 1,
          error: 'Import interrupted by a storage or processing error',
          diagnostics: null,
        })
      } finally {
        await pool.query(
          'ALTER TABLE source_ad_revisions DROP CONSTRAINT reject_fixture',
        )
      }
    })

    it('does not count a rolled-back page as saved and retains earlier committed pages', async () => {
      await pool.query(
        `ALTER TABLE source_ad_revisions ADD CONSTRAINT reject_fixture CHECK (payload->>'title' <> 'Rejected fixture')`,
      )
      const rejected = page(['rejected'])
      rejected.jobs[0]!.title = 'Rejected fixture'
      try {
        const failed = await syncHimalayas(himalayasWith(async () => rejected))
        expect(failed).toMatchObject({
          status: 'failed',
          seen: 0,
          pages: 0,
          revisions: 0,
        })
        expect((await pool.query('SELECT * FROM source_ads')).rowCount).toBe(0)
        const fetcher = vi
          .fn()
          .mockResolvedValueOnce(page(['saved'], { totalCount: 21 }))
          .mockResolvedValueOnce(rejected)
        const partial = await syncHimalayas(himalayasWith(fetcher))
        expect(partial).toMatchObject({
          status: 'partial',
          seen: 1,
          pages: 1,
          revisions: 1,
        })
        expect(
          (await pool.query('SELECT external_id FROM source_ads')).rows,
        ).toEqual([{ external_id: raw('saved').guid }])
      } finally {
        await pool.query(
          'ALTER TABLE source_ad_revisions DROP CONSTRAINT reject_fixture',
        )
      }
    })

    it('does not store untrusted Retry-After response content in diagnostics', async () => {
      const result = await syncHimalayas(
        himalayasWith(async () => {
          throw new HimalayasHttpError(429, '<html>secret response body</html>')
        }),
      )
      expect(result).toMatchObject({
        status: 'failed',
        diagnostics: { retryAfter: null, stopReason: 'http_429' },
      })
      expect(JSON.stringify(result)).not.toContain('secret response')
    })

    it('stops at five pages and preserves all accumulated candidates', async () => {
      const fetcher = vi.fn(async (index: number) =>
        page([`job-${index}`], { totalCount: 200 }),
      )
      const result = await syncHimalayas(himalayasWith(fetcher))
      expect(fetcher).toHaveBeenCalledTimes(5)
      expect(result).toMatchObject({
        status: 'partial',
        seen: 5,
        pages: 5,
        diagnostics: { stopReason: 'page_limit' },
      })
    })

    it('prevents a concurrent manual run from fetching and keeps the active run intact', async () => {
      let release!: () => void
      let entered!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        entered = resolve
      })
      const active = syncHimalayas(
        himalayasWith(async () => {
          entered()
          await gate
          return page(['active'])
        }),
      )
      await started
      try {
        const duplicate = vi.fn()
        await expect(syncHimalayas(himalayasWith(duplicate))).rejects.toThrow(
          'already running',
        )
        expect(duplicate).not.toHaveBeenCalled()
        expect(
          (await pool.query('SELECT status FROM source_sync_runs')).rows,
        ).toEqual([{ status: 'running' }])
      } finally {
        release()
        await active
      }
    })
  },
)
