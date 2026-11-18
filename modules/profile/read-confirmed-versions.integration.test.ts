import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool, transaction } from '../../lib/db.ts'
import { emptyProfile } from '../../lib/profile/model.ts'
import {
  confirmProfile,
  saveDraft,
  readActiveProfileVersion,
  readProfileVersionMetadata,
  readProfileVersions,
} from './index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('reading confirmed profile versions in isolated PostgreSQL', () => {
  const schema = `profile_read_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../../migrations/1770000000004_profiles.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
    setPool(pool)
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE profile_imports,profile_drafts,profile_head,profile_versions CASCADE',
    )
    await pool.query('INSERT INTO profile_head(singleton) VALUES(true)')
  })

  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  /** Confirms a draft with the summary and returns the new version. */
  async function confirm(summary: string, activeId: string | null) {
    const current = await pool.query(
      'SELECT revision FROM profile_drafts WHERE singleton',
    )
    const data = emptyProfile()
    data.summary = summary
    const draft = await saveDraft(data, current.rows[0]?.revision ?? 0)
    return confirmProfile(draft.revision, activeId, randomUUID())
  }

  it('reports explicitly that no version is active before the first confirmation', async () => {
    expect(await readActiveProfileVersion()).toEqual({ active: false })
  })

  it('returns the active version with its id, number, confirmation time and data', async () => {
    const first = await confirm('First', null)
    const second = await confirm('Second', first.id)

    const read = await readActiveProfileVersion()

    expect(read).toEqual({
      active: true,
      version: {
        id: second.id,
        number: 2,
        confirmedAt: second.created_at,
        data: expect.objectContaining({ summary: 'Second' }),
      },
    })
  })

  it('returns the indicated versions and skips unknown ids', async () => {
    const first = await confirm('First', null)
    const second = await confirm('Second', first.id)

    const read = await readProfileVersions([first.id, randomUUID(), first.id])

    expect(read).toEqual([
      {
        id: first.id,
        number: 1,
        confirmedAt: first.created_at,
        data: expect.objectContaining({ summary: 'First' }),
      },
    ])
    expect(
      (await readProfileVersions([first.id, second.id]))
        .map((version) => version.data.summary)
        .sort(),
    ).toEqual(['First', 'Second'])
    expect(await readProfileVersions([])).toEqual([])
  })

  it('returns metadata of the indicated versions without their data', async () => {
    const first = await confirm('First', null)
    const second = await confirm('Second', first.id)

    const read = await readProfileVersionMetadata([second.id, first.id])

    expect(read.sort((a, b) => a.number - b.number)).toEqual([
      { id: first.id, number: 1, confirmedAt: first.created_at },
      { id: second.id, number: 2, confirmedAt: second.created_at },
    ])
  })

  it('takes no row lock, so a confirmation proceeds while a transaction that read the version is open', async () => {
    const first = await confirm('First', null)
    const second = await transaction(async () => {
      expect(await readActiveProfileVersion()).toMatchObject({
        version: { id: first.id },
      })
      // The confirmation runs on its own connection while the reading
      // transaction is still open; a row lock would make it wait.
      return Promise.race([
        confirm('Second', first.id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Confirmation waited')), 3000),
        ),
      ])
    })
    expect(await readActiveProfileVersion()).toMatchObject({
      version: { id: second.id },
    })
  })
})
