import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import { deliver, sourcesMigrations } from '../../tests/sync-run.fixtures.ts'
import { endFailedSyncRun, readSyncDetails, readSyncHistory } from './index.ts'
import {
  ConnectorError,
  toConnectorAd,
  type BatchReceiver,
  type ConnectorAd,
  type ConnectorResult,
  type SourceConnector,
} from './infrastructure/adapters/connector.ts'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'
import { historyPageStatement } from './infrastructure/persistence/sync-history.ts'
import { admitRun } from './sync-run-state.ts'

/**
 * The sync history and details reads on a real database (T1-AC02, AC03,
 * AC06, AC08, AC11): new and changed ads counted at read time, the order,
 * the filters with their Polish day boundaries, defaults and clamping.
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const ad = (id: string, title = `Offer ${id}`): ConnectorAd =>
  toConnectorAd({ jobOfferKey: id, title })

/** A simulated source searching the scope of `keyword`. */
function simulated(
  name: string,
  keyword: string,
  fetch: (onBatch: BatchReceiver) => Promise<ConnectorResult>,
): SourceConnector {
  return {
    name,
    infersUnavailabilityFromAbsence: false,
    scheduled: false,
    enabled: () => true,
    scopeParameters: () => ({ source: name, keyword }),
    fetch: (_parameters, onBatch) => fetch(onBatch),
  }
}

const batches =
  (list: ConnectorAd[][], result: ConnectorResult = { complete: true }) =>
  async (onBatch: BatchReceiver) => {
    for (const batch of list) await onBatch(batch)
    return result
  }

integration('sync history reads in an isolated PostgreSQL schema', () => {
  const schema = `sync_history_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    for (const migration of sourcesMigrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../../migrations/${migration}.cjs`).up({
        sql: (statement: string) => sql.push(statement),
      })
      await pool.query(sql.join('\n'))
    }
    setPool(pool)
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
  })

  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  /** Admits and carries out a run of the connector, as the worker does. */
  async function sync(connector: SourceConnector): Promise<string> {
    const run = await admitRun({
      source: connector.name,
      parameters: connector.scopeParameters(),
      trigger: 'manual',
      scheduleDay: '2026-11-26',
      sendJob: async () => {},
    })
    await deliver(run.id, createConnectorRegistry([connector]))
    return run.id
  }

  const scopes = new Map<string, string>()
  /** Stores a run directly, as runs stored before the task are. */
  async function stored(run: {
    source: string
    createdAt: string
    trigger?: 'manual' | 'scheduled'
    status?: string
    seen?: number
    revisions?: number
    startedAt?: string | null
    finishedAt?: string | null
    error?: string | null
    diagnostics?: unknown
  }): Promise<string> {
    let scope = scopes.get(run.source)
    if (!scope) {
      scope = randomUUID()
      await pool.query(
        'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
        [scope, run.source, randomUUID(), {}],
      )
      scopes.set(run.source, scope)
    }
    const id = randomUUID()
    const status = run.status ?? 'complete'
    const finished = !['queued', 'running'].includes(status)
    await pool.query(
      `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,status,
        created_at,started_at,finished_at,seen,revisions,error,diagnostics)
      VALUES($1,$2,$3,'2026-11-26',$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        scope,
        run.trigger ?? 'manual',
        status,
        run.createdAt,
        run.startedAt === undefined
          ? status === 'queued'
            ? null
            : run.createdAt
          : run.startedAt,
        run.finishedAt === undefined
          ? finished
            ? run.createdAt
            : null
          : run.finishedAt,
        run.seen ?? 0,
        run.revisions ?? 0,
        run.error ?? null,
        run.diagnostics === undefined ? null : JSON.stringify(run.diagnostics),
      ],
    )
    return id
  }
  beforeEach(() => scopes.clear())

  const ids = (page: { items: { id: string }[] }) =>
    page.items.map((item) => item.id)

  describe('new and changed ads (T1-R06, T1-AC03)', () => {
    it('counts as new only the ads this source never showed before, across its scopes, and as changed the known ads with new content', async () => {
      const php = (fetch: Parameters<typeof simulated>[2]) =>
        simulated('himalayas', 'php', fetch)
      const go = (fetch: Parameters<typeof simulated>[2]) =>
        simulated('himalayas', 'go', fetch)
      const first = await sync(php(batches([[ad('one'), ad('two')]])))
      // Another scope of the same source: `one` unchanged, `two` changed,
      // `three` never shown before.
      const second = await sync(
        go(
          batches([
            [ad('one'), ad('two', 'Offer two, new salary')],
            [ad('three')],
          ]),
        ),
      )
      // An incomplete run: `three` changed, `four` new.
      const partial = await sync(
        php(
          batches([[ad('three', 'Offer three, remote'), ad('four')]], {
            complete: false,
            reason: 'stopped',
          }),
        ),
      )
      // A failed run that saved nothing.
      const failed = await sync(
        php(async () => {
          throw new ConnectorError('Portal unavailable')
        }),
      )
      // A run ended by the failure handler before it ever started.
      const never = (
        await admitRun({
          source: 'himalayas',
          parameters: { source: 'himalayas', keyword: 'php' },
          trigger: 'manual',
          scheduleDay: '2026-11-26',
          sendJob: async () => {},
        })
      ).id
      await endFailedSyncRun({ runId: never })
      // Another source seeing the same external ids: new in its own source.
      const other = await sync(
        simulated('solid-jobs', 'php', batches([[ad('one'), ad('five')]])),
      )

      const history = await readSyncHistory({ period: 'all' })
      const counted = Object.fromEntries(
        history.items.map((item) => [
          item.id,
          [item.status, item.seen, item.newAds, item.changedAds],
        ]),
      )
      expect(counted).toEqual({
        [first]: ['complete', 2, 2, 0],
        [second]: ['complete', 3, 1, 1],
        [partial]: ['partial', 2, 1, 1],
        [failed]: ['failed', 0, 0, 0],
        [never]: ['failed', 0, 0, 0],
        [other]: ['complete', 2, 2, 0],
      })
      expect(await readSyncDetails(second)).toMatchObject({
        newAds: 1,
        changedAds: 1,
      })
    })

    it('counts runs stored before the task from what they stored, and never gives fewer than 0 changed', async () => {
      const early = await stored({
        source: 'indeed',
        createdAt: '2026-11-01T10:00:00Z',
        finishedAt: '2026-11-01T10:05:00Z',
        seen: 2,
        revisions: 2,
      })
      const later = await stored({
        source: 'indeed',
        createdAt: '2026-11-02T10:00:00Z',
        finishedAt: '2026-11-02T10:05:00Z',
        seen: 2,
        // Fewer versions than new ads: changed stays at 0.
        revisions: 0,
      })
      const known = randomUUID()
      const fresh = randomUUID()
      const older = randomUUID()
      for (const [id, external, firstSeen] of [
        [known, 'k', '2026-11-01T10:01:00Z'],
        [older, 'o', '2026-11-01T10:02:00Z'],
        [fresh, 'f', '2026-11-02T10:01:00Z'],
      ])
        await pool.query(
          `INSERT INTO source_ads(id,source,external_id,first_seen_at,last_seen_scope_id)
          VALUES($1,'indeed',$2,$3,$4)`,
          [id, external, firstSeen, scopes.get('indeed')],
        )
      for (const [run, adId] of [
        [early, known],
        [early, older],
        [later, known],
        [later, fresh],
      ])
        await pool.query(
          'INSERT INTO source_run_seen(run_id,source_ad_id) VALUES($1,$2)',
          [run, adId],
        )
      await pool.query('UPDATE source_sync_runs SET revisions=1 WHERE id=$1', [
        later,
      ])
      const history = await readSyncHistory({ period: 'all' })
      expect(
        history.items.map((item) => [item.id, item.newAds, item.changedAds]),
      ).toEqual([
        [later, 1, 0],
        [early, 2, 0],
      ])
      await pool.query('UPDATE source_sync_runs SET revisions=0 WHERE id=$1', [
        later,
      ])
      expect(await readSyncDetails(later)).toMatchObject({
        newAds: 1,
        changedAds: 0,
      })
    })

    it('has no new or changed ads for a queued or running run', async () => {
      const queued = await stored({
        source: 'bayt',
        createdAt: '2026-11-26T08:00:00Z',
        status: 'queued',
      })
      const running = await stored({
        source: 'indeed',
        createdAt: '2026-11-26T08:01:00Z',
        status: 'running',
        seen: 4,
        revisions: 4,
      })
      const history = await readSyncHistory(
        { period: 'all' },
        new Date('2026-11-26T10:00:00Z'),
      )
      expect(
        history.items.map((item) => [
          item.id,
          item.seen,
          item.newAds,
          item.changedAds,
        ]),
      ).toEqual([
        [running, 4, null, null],
        [queued, 0, null, null],
      ])
    })
  })

  describe('the history read (T1-AC02, AC06, AC11)', () => {
    const now = new Date('2026-11-26T10:00:00Z')

    it('lists every sync of every source, both ways of starting and every state for period "all", latest requested first, without way of starting or scope in the row', async () => {
      const runs = []
      const states = ['queued', 'running', 'complete', 'partial', 'failed']
      const sources = ['solid-jobs', 'himalayas', 'indeed', 'bulldogjob']
      for (let i = 0; i < 10; i++)
        runs.push(
          await stored({
            source: sources[i % sources.length]!,
            trigger: i % 2 ? 'scheduled' : 'manual',
            status: states[i % states.length]!,
            createdAt: new Date(
              Date.parse('2026-01-01T12:00:00Z') + i * 86_400_000 * 30,
            ).toISOString(),
          }),
        )
      const history = await readSyncHistory({ period: 'all' }, now)
      expect(ids(history)).toEqual([...runs].reverse())
      expect(history.total).toBe(10)
      expect(history.page).toBe(1)
      expect(history.pages).toBe(1)
      expect(new Set(history.items.map((item) => item.source))).toEqual(
        new Set(sources),
      )
      expect(Object.keys(history.items[0]!).sort()).toEqual(
        [
          'changedAds',
          'id',
          'markedUnavailable',
          'newAds',
          'requestedAt',
          'seen',
          'source',
          'status',
          'trigger',
        ].sort(),
      )
      // Pages split the same order.
      const first = await readSyncHistory({ period: 'all', size: '10' }, now)
      expect(ids(first)).toEqual([...runs].reverse())
    })

    it('names every catalogue source with its display name and whether it is enabled', async () => {
      const history = await readSyncHistory({}, now)
      const byId = Object.fromEntries(
        history.sources.map((source) => [source.id, source]),
      )
      expect(byId['solid-jobs']).toEqual({
        id: 'solid-jobs',
        name: 'SOLID.Jobs',
        enabled: true,
        marksUnavailable: true,
      })
      expect(byId.himalayas).toMatchObject({
        name: 'Himalayas',
        marksUnavailable: false,
      })
      expect(byId.indeed?.name).toBe('Indeed')
      expect(byId.nofluffjobs?.name).toBe('No Fluff Jobs')
      expect(history.sources.map((source) => source.id)).toHaveLength(15)
    })

    it('orders syncs requested at the same moment by id', async () => {
      const a = await stored({
        source: 'indeed',
        createdAt: '2026-11-26T08:00:00Z',
      })
      const b = await stored({
        source: 'bayt',
        createdAt: '2026-11-26T08:00:00Z',
      })
      expect(ids(await readSyncHistory({}, now))).toEqual(
        [a, b].sort().reverse(),
      )
    })

    it('narrows the list by each filter; an empty choice means all', async () => {
      const indeedManual = await stored({
        source: 'indeed',
        createdAt: '2026-11-26T08:00:00Z',
        status: 'failed',
      })
      const baytScheduled = await stored({
        source: 'bayt',
        trigger: 'scheduled',
        createdAt: '2026-11-26T07:00:00Z',
        status: 'partial',
      })
      const solidScheduled = await stored({
        source: 'solid-jobs',
        trigger: 'scheduled',
        createdAt: '2026-11-26T06:00:00Z',
      })
      const read = async (address: Record<string, unknown>) =>
        ids(await readSyncHistory(address, now))
      expect(await read({})).toEqual([
        indeedManual,
        baytScheduled,
        solidScheduled,
      ])
      expect(await read({ source: '' })).toEqual(await read({}))
      expect(await read({ source: 'indeed,solid-jobs' })).toEqual([
        indeedManual,
        solidScheduled,
      ])
      expect(await read({ state: ['partial', 'complete'] })).toEqual([
        baytScheduled,
        solidScheduled,
      ])
      expect(await read({ trigger: 'manual' })).toEqual([indeedManual])
      expect(await read({ trigger: 'scheduled' })).toEqual([
        baytScheduled,
        solidScheduled,
      ])
      expect(
        await read({ source: 'bayt,indeed', trigger: 'scheduled' }),
      ).toEqual([baytScheduled])
      const filtered = await readSyncHistory(
        {
          source: 'bayt',
          state: 'partial',
          trigger: 'scheduled',
          period: 'today',
        },
        now,
      )
      expect(filtered.filters).toEqual({
        sources: ['bayt'],
        states: ['partial'],
        trigger: 'scheduled',
        period: 'today',
      })
    })

    it('bounds the periods by Polish calendar days, by request time, across the change to winter time', async () => {
      const at = (createdAt: string) => stored({ source: 'indeed', createdAt })
      // 00:00 on 26 November in Poland, and one second before it.
      const todayStart = await at('2026-11-25T23:00:00Z')
      const yesterdayEnd = await at('2026-11-25T22:59:59Z')
      // 00:00 on 20 November in Poland: the first day of the last 7.
      const weekStart = await at('2026-11-19T23:00:00Z')
      const beforeWeek = await at('2026-11-19T22:59:59Z')
      // 00:00 on 28 October in Poland (winter time since 25 October).
      const monthStart = await at('2026-10-27T23:00:00Z')
      const beforeMonth = await at('2026-10-27T22:59:59Z')
      const read = async (period: string) =>
        ids(await readSyncHistory({ period }, now))
      expect(await read('today')).toEqual([todayStart])
      expect(await read('7d')).toEqual([todayStart, yesterdayEnd, weekStart])
      expect(await read('30d')).toEqual([
        todayStart,
        yesterdayEnd,
        weekStart,
        beforeWeek,
        monthStart,
      ])
      expect(await read('all')).toEqual([
        todayStart,
        yesterdayEnd,
        weekStart,
        beforeWeek,
        monthStart,
        beforeMonth,
      ])
      // Without a period in the address: the last 7 days.
      expect(ids(await readSyncHistory({}, now))).toEqual(await read('7d'))
    })

    it('pages the list by 10, 20, 50 and 100, 20 by default', async () => {
      const runs: string[] = []
      for (let i = 0; i < 101; i++)
        runs.push(
          await stored({
            source: 'indeed',
            createdAt: new Date(
              Date.parse('2026-11-26T09:00:00Z') - i * 60_000,
            ).toISOString(),
          }),
        )
      expect((await readSyncHistory({}, now)).items).toHaveLength(20)
      for (const size of [10, 20, 50, 100]) {
        const page = await readSyncHistory(
          { size: String(size), page: '2' },
          now,
        )
        expect(page.size).toBe(size)
        expect(page.pages).toBe(Math.ceil(101 / size))
        expect(ids(page)).toEqual(runs.slice(size, Math.min(2 * size, 101)))
      }
    })

    it('shows the default of each unreadable value, 20 per page and the last page for an invalid address, and the first page for page 0 (T1-AC11)', async () => {
      const runs: string[] = []
      for (let i = 0; i < 45; i++)
        runs.push(
          await stored({
            source: 'indeed',
            createdAt: new Date(
              Date.parse('2026-11-26T09:00:00Z') - i * 60_000,
            ).toISOString(),
          }),
        )
      const invalid = await readSyncHistory(
        {
          source: 'nowhere',
          state: 'lost',
          trigger: 'sometimes',
          period: 'forever',
          size: '30',
          page: '999',
        },
        now,
      )
      expect(invalid).toMatchObject({
        total: 45,
        page: 3,
        pages: 3,
        size: 20,
        filters: { sources: [], states: [], trigger: null, period: '7d' },
      })
      expect(ids(invalid)).toEqual(runs.slice(40))
      const first = await readSyncHistory({ page: '0' }, now)
      expect(first.page).toBe(1)
      expect(ids(first)).toEqual(runs.slice(0, 20))
    })

    it('counts new ads only for the runs of the page shown, not for the runs a later page skips', async () => {
      for (let i = 0; i < 40; i++)
        await stored({
          source: 'indeed',
          createdAt: new Date(
            Date.parse('2026-11-26T09:00:00Z') - i * 60_000,
          ).toISOString(),
        })
      const statement = historyPageStatement(
        { sources: [], states: [], trigger: null, requestedFrom: null },
        { limit: 5, offset: 30 },
      )
      const explained = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${statement.text}`,
        statement.values,
      )
      /** Loops of every plan node counting a run's new ads. */
      const loops: number[] = []
      const visit = (node: Record<string, unknown>) => {
        if (
          node['Parent Relationship'] === 'SubPlan' ||
          String(node['Subplan Name'] ?? '').startsWith('SubPlan')
        )
          loops.push(Number(node['Actual Loops']))
        for (const child of (node.Plans ?? []) as Record<string, unknown>[])
          visit(child)
      }
      visit(explained.rows[0]['QUERY PLAN'][0].Plan)
      expect(loops.length).toBeGreaterThan(0)
      for (const count of loops) expect(count).toBeLessThanOrEqual(5)
      const page = await readSyncHistory(
        { period: 'all', size: '10', page: '4' },
        now,
      )
      expect(page.items).toHaveLength(10)
      expect(page.items.every((item) => item.newAds === 0)).toBe(true)
    })

    it('shows page 1 when nothing matches', async () => {
      const empty = await readSyncHistory({ page: '4' }, now)
      expect(empty).toMatchObject({ items: [], total: 0, page: 1, pages: 1 })
    })
  })

  describe('ads marked unavailable (T2-AC01, AC04)', () => {
    const now = new Date('2026-11-26T10:00:00Z')
    const count = (id: string, marked: number) =>
      pool.query(
        'UPDATE source_sync_runs SET marked_unavailable=$2 WHERE id=$1',
        [id, marked],
      )

    it('gives no count and no date while no sync has recorded one', async () => {
      const before = await stored({
        source: 'solid-jobs',
        createdAt: '2026-11-25T08:00:00Z',
      })
      const history = await readSyncHistory({ period: 'all' }, now)
      expect(history.unavailableCountedSince).toBeNull()
      expect(history.items).toEqual([
        expect.objectContaining({ id: before, markedUnavailable: null }),
      ])
    })

    it('gives each sync its recorded count and the finish of the earliest sync that recorded one, whatever the filters', async () => {
      const before = await stored({
        source: 'solid-jobs',
        createdAt: '2026-11-24T08:00:00Z',
      })
      const first = await stored({
        source: 'solid-jobs',
        createdAt: '2026-11-24T23:00:00Z',
        finishedAt: '2026-11-24T23:30:00Z',
      })
      const later = await stored({
        source: 'solid-jobs',
        createdAt: '2026-11-26T08:00:00Z',
      })
      await count(first, 2)
      await count(later, 0)
      const history = await readSyncHistory({ period: 'today' }, now)
      expect(history.unavailableCountedSince).toBe('2026-11-24T23:30:00.000Z')
      expect(history.items).toEqual([
        expect.objectContaining({ id: later, markedUnavailable: 0 }),
      ])
      const all = await readSyncHistory({ period: 'all' }, now)
      expect(
        all.items.map((item) => [item.id, item.markedUnavailable]),
      ).toEqual([
        [later, 0],
        [first, 2],
        [before, null],
      ])
      expect(await readSyncDetails(first)).toMatchObject({
        markedUnavailable: 2,
      })
      expect(
        all.sources.find((source) => source.id === 'solid-jobs'),
      ).toMatchObject({ marksUnavailable: true })
    })
  })

  describe('the details read (T1-AC08, AC10)', () => {
    it('gives a sync’s course, its stored error and its diagnostics as stored', async () => {
      const id = await stored({
        source: 'bayt',
        trigger: 'scheduled',
        status: 'partial',
        createdAt: '2026-11-26T08:00:00Z',
        startedAt: '2026-11-26T08:00:10Z',
        finishedAt: '2026-11-26T08:03:00Z',
        seen: 3,
        error: 'Portal rejected <b>requests</b>',
        diagnostics: { http: 429, pages: [1, 2] },
      })
      await pool.query('UPDATE source_sync_runs SET pages=2 WHERE id=$1', [id])
      expect(await readSyncDetails(id)).toEqual({
        id,
        source: 'bayt',
        trigger: 'scheduled',
        status: 'partial',
        requestedAt: '2026-11-26T08:00:00.000Z',
        startedAt: '2026-11-26T08:00:10.000Z',
        finishedAt: '2026-11-26T08:03:00.000Z',
        seen: 3,
        newAds: 0,
        changedAds: 0,
        markedUnavailable: null,
        pages: 2,
        error: 'Portal rejected <b>requests</b>',
        diagnostics: { http: 429, pages: [1, 2] },
      })
    })

    it('finds nothing for an unknown or malformed id', async () => {
      expect(await readSyncDetails(randomUUID())).toBeNull()
      expect(await readSyncDetails('nonsense')).toBeNull()
      expect(await readSyncDetails('')).toBeNull()
    })
  })
})
