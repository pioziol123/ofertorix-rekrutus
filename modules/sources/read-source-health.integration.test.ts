import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import { addHours, addMinutes } from '../../lib/time/index.ts'
import { sourcesMigrations } from '../../tests/sync-run.fixtures.ts'
import { readSourceHealth } from './index.ts'
import type { SourceConnector } from './infrastructure/adapters/connector.ts'
import { createConnectorRegistry } from './infrastructure/adapters/connector-registry.ts'

/**
 * The health read on a real database (T4-AC01–AC05): the strip's counts
 * and the warning list from the stored runs of every scope, at the 24/25
 * and 71/73-hour boundaries, with disabled sources.
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

const now = new Date('2026-11-26T12:00:00Z')

/** A catalogue source; its runs are stored directly. */
const connector = (name: string, enabled = true): SourceConnector => ({
  name,
  infersUnavailabilityFromAbsence: false,
  scheduled: false,
  enabled: () => enabled,
  scopeParameters: () => ({ source: name }),
  fetch: async () => ({ complete: true }),
})

integration('source health read in an isolated PostgreSQL schema', () => {
  const schema = `source_health_${randomUUID().replaceAll('-', '')}`
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

  const scopes = new Map<string, string>()
  beforeEach(async () => {
    scopes.clear()
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

  /** The scope `key` of the source, created on first use. */
  async function scopeOf(source: string, key = 'php'): Promise<string> {
    let scope = scopes.get(`${source}/${key}`)
    if (!scope) {
      scope = randomUUID()
      await pool.query(
        'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
        [scope, source, randomUUID(), {}],
      )
      scopes.set(`${source}/${key}`, scope)
    }
    return scope
  }

  /**
   * Stores a run of the source: unfinished, or finished `hoursAgo` hours
   * before `now` after a 5-minute fetch, with `newAds` ads first seen
   * during it.
   */
  async function run(
    source: string,
    status: string,
    options: { hoursAgo?: number; newAds?: number; scope?: string } = {},
  ): Promise<string> {
    const id = randomUUID()
    const finishedAt = addHours(now, -(options.hoursAgo ?? 1))
    const startedAt = addMinutes(finishedAt, -5)
    const unfinished = ['queued', 'running'].includes(status)
    await pool.query(
      `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,status,
        created_at,started_at,finished_at,seen,revisions)
      VALUES($1,$2,'manual','2026-11-26',$3,$4,$5,$6,$7,$7)`,
      [
        id,
        await scopeOf(source, options.scope),
        status,
        startedAt,
        status === 'queued' ? null : startedAt,
        unfinished ? null : finishedAt,
        options.newAds ?? 0,
      ],
    )
    for (let i = 0; i < (options.newAds ?? 0); i++) {
      const ad = randomUUID()
      await pool.query(
        `INSERT INTO source_ads(id,source,external_id,first_seen_at,last_seen_scope_id)
        VALUES($1,$2,$3,$4,$5)`,
        [ad, source, ad, addMinutes(startedAt, 1), await scopeOf(source)],
      )
      await pool.query(
        'INSERT INTO source_run_seen(run_id,source_ad_id) VALUES($1,$2)',
        [id, ad],
      )
    }
    return id
  }

  const read = (...connectors: SourceConnector[]) =>
    readSourceHealth(now, createConnectorRegistry(connectors))

  it('counts queued and running syncs of every source, a disabled one included (T4-AC01)', async () => {
    await run('alfa', 'queued')
    await run('beta', 'queued')
    await run('gamma', 'running')
    await run('alfa', 'complete', { scope: 'go' })
    const health = await read(
      connector('alfa'),
      connector('beta'),
      connector('gamma', false),
    )
    expect(health.unfinished).toBe(3)
  })

  it('counts enabled sources whose latest finished sync is Nieudana or Niepełna, never a disabled one (T4-AC02)', async () => {
    await run('alfa', 'complete', { hoursAgo: 3 })
    await run('alfa', 'failed', { hoursAgo: 2 })
    await run('beta', 'partial', { hoursAgo: 2 })
    // A later complete sync in another scope of the same source.
    await run('gamma', 'failed', { hoursAgo: 3 })
    await run('gamma', 'complete', { hoursAgo: 2, scope: 'go' })
    // An unfinished sync after a complete one does not count.
    await run('delta', 'complete', { hoursAgo: 2 })
    await run('delta', 'running', { scope: 'go' })
    await run('off', 'failed', { hoursAgo: 1 })
    const health = await read(
      connector('alfa'),
      connector('beta'),
      connector('gamma'),
      connector('delta'),
      connector('off', false),
    )
    expect(health.latestProblem).toBe(2)
  })

  it('sums new ads of syncs finished within 24 hours, those of a disabled source included, not one finished 25 hours ago (T4-AC03)', async () => {
    await run('alfa', 'complete', { hoursAgo: 1, newAds: 2 })
    await run('alfa', 'partial', { hoursAgo: 23, newAds: 1, scope: 'go' })
    await run('off', 'complete', { hoursAgo: 2, newAds: 3 })
    await run('beta', 'complete', { hoursAgo: 25, newAds: 4 })
    const health = await read(
      connector('alfa'),
      connector('beta'),
      connector('off', false),
    )
    expect(health.newIn24h).toBe(6)
  })

  it('lists a source with its latest complete sync 73 hours ago and one with none, not one at 71 hours, never a disabled one (T4-AC04)', async () => {
    await run('stale', 'complete', { hoursAgo: 80 })
    await run('stale', 'complete', { hoursAgo: 73 })
    await run('stale', 'partial', { hoursAgo: 1 })
    await run('never', 'partial', { hoursAgo: 1 })
    await run('fresh', 'complete', { hoursAgo: 71 })
    await run('off', 'failed', { hoursAgo: 1 })
    const health = await read(
      connector('stale'),
      connector('never'),
      connector('fresh'),
      connector('off', false),
    )
    expect(health.warnings).toEqual([
      {
        source: 'never',
        name: 'never',
        latestCompleteAt: null,
        reasons: ['no-complete'],
      },
      {
        source: 'stale',
        name: 'stale',
        latestCompleteAt: addHours(now, -73).toISOString(),
        reasons: ['no-complete'],
      },
    ])
  })

  it('lists three Nieudana in a row across scopes, not Nieudana, Niepełna, Nieudana, and a source meeting both conditions once with both reasons (T4-AC05)', async () => {
    // Complete 10 hours ago, then three failed in two scopes.
    await run('failing', 'complete', { hoursAgo: 10 })
    await run('failing', 'failed', { hoursAgo: 3 })
    await run('failing', 'failed', { hoursAgo: 2, scope: 'go' })
    await run('failing', 'failed', { hoursAgo: 1 })
    await run('broken', 'complete', { hoursAgo: 10 })
    await run('broken', 'failed', { hoursAgo: 3 })
    await run('broken', 'partial', { hoursAgo: 2 })
    await run('broken', 'failed', { hoursAgo: 1 })
    for (const hoursAgo of [3, 2, 1]) await run('both', 'failed', { hoursAgo })
    const health = await read(
      connector('failing'),
      connector('broken'),
      connector('both'),
    )
    expect(
      health.warnings.map((warning) => [warning.source, warning.reasons]),
    ).toEqual([
      ['both', ['no-complete', 'failing']],
      ['failing', ['failing']],
    ])
  })

  it('gives an empty strip and no warning without enabled sources or runs', async () => {
    expect(await read(connector('off', false))).toEqual({
      unfinished: 0,
      latestProblem: 0,
      newIn24h: 0,
      warnings: [],
    })
  })
})
