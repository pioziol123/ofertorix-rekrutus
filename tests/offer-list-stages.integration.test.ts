import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  listOffers,
  parseFilters,
  startApplication,
} from '../modules/offers/index.ts'
import { moveApplication, type Stage } from '../modules/recruitments/index.ts'
import {
  aiLeaseMigration,
  aiWithoutLeaseMigration,
  assignmentMigrations,
  matchingMigrations,
  migrate,
} from './matching-ai.fixtures.ts'

/**
 * The stage of applications on the offer list (task oferty-pracy-lq3.3, T3
 * of epic lq3) on an isolated database: the list reads every stage in a
 * fixed number of queries (T3-AC05) and filters by the stored stages
 * (T3-AC02, T3-AC03).
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('the stage on the offer list in isolated PostgreSQL', () => {
  const schema = `offer_list_stages_${randomUUID().replaceAll('-', '')}`
  const connection = { connectionString: process.env.DATABASE_URL }
  let admin: Pool, pool: Pool, scope: string
  let clock = Date.parse('2026-11-27T10:00:00.000Z')
  const tick = () => new Date((clock += 1000))
  const offers: string[] = []

  /** Stores an ad of the source with a current version: an offer. */
  async function offer(title: string): Promise<string> {
    const id = randomUUID(),
      revision = randomUUID()
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
      [id, randomUUID(), scope],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'h',$3)",
      [revision, id, { title, skills: [{ name: 'PHP' }] }],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, revision],
    )
    return id
  }

  /** The list for the query and the number of queries sent to read it. */
  async function countedList(query: Record<string, unknown> = {}) {
    const spy = vi.spyOn(pool, 'query')
    try {
      const list = await listOffers(parseFilters(query))
      return { list, queries: spy.mock.calls.length }
    } finally {
      spy.mockRestore()
    }
  }

  beforeAll(async () => {
    admin = new Pool(connection)
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({ ...connection, options: `-c search_path=${schema}` })
    await migrate(pool, [
      ...matchingMigrations,
      aiLeaseMigration,
      aiWithoutLeaseMigration,
      ...assignmentMigrations,
      '1770000000039_recruitments',
    ])
    setPool(pool)
    scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
      [scope, randomUUID()],
    )
    for (let i = 0; i < 60; i++)
      offers.push(await offer(`Offer ${String(i).padStart(2, '0')}`))
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  it('reads the offer list in the same number of queries with 0, 1 and 50 applications (T3-AC05)', async () => {
    /** The offers of the list that carry a stage, from every page. */
    const saved = async () =>
      (await countedList({ stage: stagesChosen })).list.total
    const stagesChosen = 'to_consider,cv_sent,rejected,removed'
    const none = await countedList()
    expect(none.list.total).toBe(60)
    expect(none.list.items.some((o) => o.stage)).toBe(false)
    expect(await saved()).toBe(0)

    await startApplication(offers[0]!, 'to_consider', tick())
    const one = await countedList()
    expect(
      (await countedList({ stage: 'to_consider' })).list.items.map((o) => ({
        id: o.id,
        stage: o.stage,
      })),
    ).toEqual([{ id: offers[0], stage: 'to_consider' }])

    for (const id of offers.slice(1, 50))
      await startApplication(id, 'cv_sent', tick())
    const fifty = await countedList()
    expect(await saved()).toBe(50)
    const withStage = await countedList({ stage: 'cv_sent,to_consider' })
    expect(withStage.list.total).toBe(50)

    expect(one.queries).toBe(none.queries)
    expect(fifty.queries).toBe(none.queries)
    expect(withStage.queries).toBe(none.queries)
  })

  it('filters by the stored stages together with another filter, counting and paging the filtered list (T3-AC02, T3-AC03)', async () => {
    // Offers 0–49 have applications from the test above; move two of them on.
    const move = (offerId: string, expected: Stage, target: Stage) =>
      moveApplication({ offerId, expected, target, now: tick() })
    await move(offers[1]!, 'cv_sent', 'rejected')
    await move(offers[0]!, 'to_consider', 'removed')

    const stagesOf = async (stage: string) =>
      (await countedList({ stage })).list
    expect((await stagesOf('none')).total).toBe(10)
    expect(
      (await stagesOf('none')).items.every(
        (o) => !o.stage && o.id !== offers[0],
      ),
    ).toBe(true)
    expect((await stagesOf('removed')).items.map((o) => o.id)).toEqual([
      offers[0],
    ])
    expect((await stagesOf('rejected')).items.map((o) => o.id)).toEqual([
      offers[1],
    ])
    expect((await stagesOf('to_consider')).total).toBe(0)
    // 48 offers in "CV wysłane": three pages of 20, page 9 shows the last.
    const sent = (await countedList({ stage: 'cv_sent', page: '9' })).list
    expect(sent).toMatchObject({ total: 48, page: 3 })
    expect(sent.items).toHaveLength(8)
    // Only offers 10–19 meet the search, all of them in "CV wysłane".
    const both = (await countedList({ stage: 'cv_sent,none', q: 'Offer 1' }))
      .list
    expect(both.items.map((o) => o.id).sort()).toEqual(
      offers.slice(10, 20).sort(),
    )
    const none = (await countedList({ stage: 'none', q: 'Offer 5' })).list
    expect(none.items.map((o) => o.id).sort()).toEqual(
      offers.slice(50, 60).sort(),
    )
  })
})
