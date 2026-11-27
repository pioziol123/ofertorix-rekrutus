import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import {
  InvalidOfferIds,
  readOffersByIds,
  startApplication,
} from '../modules/offers/index.ts'
import {
  ApplicationMissing,
  moveApplication,
  NoteTooLong,
  readApplication,
  readApplicationsPage,
  saveNote,
  stages,
  type Stage,
} from '../modules/recruitments/index.ts'
import {
  aiLeaseMigration,
  aiWithoutLeaseMigration,
  assignmentMigrations,
  matchingMigrations,
  migrate,
} from './matching-ai.fixtures.ts'

/**
 * Moja lista and the note of an application (task oferty-pracy-lq3.2, T2 of
 * epic lq3) on an isolated database: the note's limit and last save
 * (A-AC03), a restart (A-AC04), a note for an offer without an application
 * (A-AC07), a parallel move and note save (A-AC10), the stage switch
 * (T2-AC03), the order (T2-AC04), the pages (T2-AC05, T2-AC12) and the
 * reads the details show (T2-AC02, T2-AC08).
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('Moja lista and the note in isolated PostgreSQL', () => {
  const schema = `applications_list_${randomUUID().replaceAll('-', '')}`
  const connection = { connectionString: process.env.DATABASE_URL }
  let admin: Pool, pool: Pool, scope: string
  let clock = Date.parse('2026-11-26T10:00:00.000Z')
  /** A new moment for each move, one second after the previous one. */
  const tick = () => new Date((clock += 1000))

  /** Stores an ad of the source with a current version: an offer. */
  async function offer(
    content: Record<string, unknown> = {},
    availability = 'available',
  ): Promise<string> {
    const id = randomUUID(),
      revision = randomUUID()
    await pool.query(
      'INSERT INTO source_ads(id,source,external_id,last_seen_scope_id,availability) VALUES($1,$4,$2,$3,$5)',
      [id, randomUUID(), scope, 'solid', availability],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'h',$3)",
      [
        revision,
        id,
        { title: 'PHP Developer', company: 'TestCo', skills: [], ...content },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, revision],
    )
    return id
  }

  /** An offer whose application is in the given stage, moved at `at`. */
  async function offerIn(stage: Stage, at: Date = tick()): Promise<string> {
    const id = await offer()
    if (stage === 'removed') {
      await startApplication(id, 'to_consider', new Date(at.getTime() - 1))
      await moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'removed',
        now: at,
      })
    } else await startApplication(id, stage, at)
    return id
  }

  const ids = (page: { items: { offerId: string }[] }) =>
    page.items.map((item) => item.offerId)

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
  })
  beforeEach(async () => {
    clock += 60_000
    await pool.query(
      'TRUNCATE recruitment_stage_changes, recruitment_applications',
    )
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  describe('the note', () => {
    it('saves 10 000 characters in each stage and refuses 10 001, keeping the stored note (A-AC03)', async () => {
      for (const stage of stages) {
        const id = await offerIn(stage)
        const full = 'ż'.repeat(10_000)
        expect(await saveNote({ offerId: id, text: full })).toEqual({
          note: full,
        })
        expect((await readApplication(id))!.note).toBe(full)
        await expect(
          saveNote({ offerId: id, text: 'a'.repeat(10_001) }),
          stage,
        ).rejects.toThrow(NoteTooLong)
        expect((await readApplication(id))!.note).toBe(full)
      }
    })

    it('lets a later save replace an earlier one and leaves the stage and its date as they were (A-AC03)', async () => {
      const id = await offerIn('cv_sent')
      const before = (await readApplication(id))!
      await saveNote({ offerId: id, text: 'Pierwsza wersja' })
      await saveNote({ offerId: id, text: 'Druga wersja' })
      const after = (await readApplication(id))!
      expect(after.note).toBe('Druga wersja')
      expect(after.stage).toBe(before.stage)
      expect(after.stageChangedAt).toEqual(before.stageChangedAt)
      expect(after.history).toEqual(before.history)
    })

    it('refuses a note for an offer without an application and creates none (A-AC07)', async () => {
      const id = await offer()
      await expect(saveNote({ offerId: id, text: 'Notatka' })).rejects.toThrow(
        ApplicationMissing,
      )
      expect(await readApplication(id)).toBeNull()
      const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM recruitment_applications WHERE offer_id=$1',
        [id],
      )
      expect(rows[0].n).toBe(0)
    })

    it('saves both a move and a note save run at the same time (A-AC10)', async () => {
      for (let i = 0; i < 5; i++) {
        const id = await offerIn('to_consider')
        const now = tick()
        const results = await Promise.allSettled([
          moveApplication({
            offerId: id,
            expected: 'to_consider',
            target: 'cv_sent',
            now,
          }),
          saveNote({ offerId: id, text: `Notatka ${i}` }),
        ])
        expect(results.map((result) => result.status)).toEqual([
          'fulfilled',
          'fulfilled',
        ])
        const after = (await readApplication(id))!
        expect(after.stage).toBe('cv_sent')
        expect(after.stageChangedAt).toEqual(now)
        expect(after.note).toBe(`Notatka ${i}`)
      }
    })

    it('keeps notes after the server restarts (A-AC04)', async () => {
      const offers = await Promise.all(stages.map((stage) => offerIn(stage)))
      for (const [index, id] of offers.entries())
        await saveNote({ offerId: id, text: `Notatka ${index} — ąę` })
      const before = await Promise.all(offers.map(readApplication))
      await closePool()
      const restarted = new Pool({
        ...connection,
        options: `-c search_path=${schema}`,
      })
      setPool(restarted)
      pool = restarted
      const after = await Promise.all(offers.map(readApplication))
      expect(after).toEqual(before)
      expect(after.map((application) => application!.note)).toEqual(
        offers.map((_, index) => `Notatka ${index} — ąę`),
      )
    })
  })

  describe('the page of applications', () => {
    it('lists exactly the stages of each choice, Aktywne by default, and "Zdjęta z listy" under none (T2-AC03)', async () => {
      const byStage = Object.fromEntries(
        await Promise.all(
          stages.map(async (stage) => [stage, await offerIn(stage)] as const),
        ),
      ) as Record<Stage, string>
      const listed = async (stage?: string) =>
        new Set(ids(await readApplicationsPage(stage ? { stage } : {})))
      const of = (...chosen: Stage[]) =>
        new Set(chosen.map((stage) => byStage[stage]))
      expect(await listed()).toEqual(of('to_consider', 'cv_sent'))
      expect((await readApplicationsPage({})).stage).toBe('active')
      expect(await listed('active')).toEqual(of('to_consider', 'cv_sent'))
      expect(await listed('all')).toEqual(
        of('to_consider', 'cv_sent', 'rejected'),
      )
      expect(await listed('to_consider')).toEqual(of('to_consider'))
      expect(await listed('cv_sent')).toEqual(of('cv_sent'))
      expect(await listed('rejected')).toEqual(of('rejected'))
      expect(await listed('removed')).toEqual(of('to_consider', 'cv_sent'))
    })

    it('orders rows from the latest stage change, keeps the order after a note edit and gives one order for equal moments (T2-AC04)', async () => {
      const first = await offerIn('to_consider')
      const second = await offerIn('cv_sent')
      const third = await offerIn('to_consider')
      await moveApplication({
        offerId: first,
        expected: 'to_consider',
        target: 'cv_sent',
        now: tick(),
      })
      const order = ids(await readApplicationsPage({}))
      expect(order).toEqual([first, third, second])
      await saveNote({ offerId: second, text: 'Edycja notatki' })
      expect(ids(await readApplicationsPage({}))).toEqual(order)

      const same = tick()
      const tied = await Promise.all(
        [1, 2, 3, 4].map(() => offerIn('rejected', same)),
      )
      const once = ids(await readApplicationsPage({ stage: 'rejected' }))
      expect(new Set(once)).toEqual(new Set(tied))
      expect(ids(await readApplicationsPage({ stage: 'rejected' }))).toEqual(
        once,
      )
    })

    it('gives the stage and the moment of its current stage for each row (T2-AC02)', async () => {
      const justAfterMidnight = new Date('2026-11-26T23:05:00.000Z')
      const id = await offerIn('cv_sent', justAfterMidnight)
      expect((await readApplicationsPage({})).items).toEqual([
        { offerId: id, stage: 'cv_sent', stageChangedAt: justAfterMidnight },
      ])
    })

    it('pages by 10, 20, 50 and 100, 20 by default, and clamps an unknown address to the defaults and the last page (T2-AC05)', async () => {
      const all: string[] = []
      for (let i = 0; i < 45; i++) all.unshift(await offerIn('to_consider'))
      const standard = await readApplicationsPage({})
      expect([standard.size, standard.page, standard.pages]).toEqual([20, 1, 3])
      expect(standard.total).toBe(45)
      expect(ids(standard)).toEqual(all.slice(0, 20))
      for (const size of [10, 20]) {
        const page = await readApplicationsPage({
          size: String(size),
          page: '2',
        })
        expect(page.size).toBe(size)
        expect(ids(page)).toEqual(all.slice(size, size * 2))
      }
      for (const size of [50, 100]) {
        const page = await readApplicationsPage({ size: String(size) })
        expect([page.size, page.pages]).toEqual([size, 1])
        expect(ids(page)).toEqual(all)
      }
      const unknown = await readApplicationsPage({
        stage: 'hired',
        size: '30',
        page: '999',
      })
      expect([unknown.stage, unknown.size, unknown.page]).toEqual([
        'active',
        20,
        3,
      ])
      expect(ids(unknown)).toEqual(all.slice(40))
      expect((await readApplicationsPage({ page: '0' })).page).toBe(1)
      const empty = await readApplicationsPage({ stage: 'rejected', page: '4' })
      expect([empty.page, empty.pages, empty.items]).toEqual([1, 1, []])
    })

    it('shows the previous page once a move empties the last one (T2-AC12)', async () => {
      const ids = []
      for (let i = 0; i < 11; i++) ids.push(await offerIn('to_consider'))
      const only = ids[0]!
      const last = await readApplicationsPage({ size: '10', page: '2' })
      expect(last.items.map((item) => item.offerId)).toEqual([only])
      await moveApplication({
        offerId: only,
        expected: 'to_consider',
        target: 'rejected',
        now: tick(),
      })
      const after = await readApplicationsPage({ size: '10', page: '2' })
      expect([after.page, after.pages]).toEqual([1, 1])
      expect(after.items.map((item) => item.offerId)).not.toContain(only)
      expect((await readApplication(only))!.stage).toBe('rejected')
    })
  })

  describe('the reads of the application details', () => {
    it('gives the offer, the stage and three changes newest first (T2-AC08)', async () => {
      const id = await offer(
        {
          title: 'Senior PHP',
          company: 'Firma',
          salaries: [
            {
              from: 15000,
              to: 20000,
              currency: 'PLN',
              period: 'Month',
              employmentType: 'B2B',
            },
          ],
        },
        'unavailable',
      )
      const moments = [tick(), tick(), tick()]
      await startApplication(id, 'to_consider', moments[0])
      await moveApplication({
        offerId: id,
        expected: 'to_consider',
        target: 'cv_sent',
        now: moments[1]!,
      })
      await moveApplication({
        offerId: id,
        expected: 'cv_sent',
        target: 'rejected',
        now: moments[2]!,
      })
      expect((await readApplication(id))!.history).toEqual([
        { stage: 'rejected', changedAt: moments[2] },
        { stage: 'cv_sent', changedAt: moments[1] },
        { stage: 'to_consider', changedAt: moments[0] },
      ])
      const [summary] = await readOffersByIds([id])
      expect(summary).toMatchObject({
        id,
        title: 'Senior PHP',
        company: 'Firma',
        availability: 'unavailable',
      })
      expect(summary!.salaries).toMatchObject([
        {
          from: 15000,
          to: 20000,
          currency: 'PLN',
          period: 'Month',
          contract: 'B2B',
        },
      ])
    })

    it('reads offers by IDs, leaving out missing ones, and refuses more than 100 or a malformed ID', async () => {
      const present = await offer()
      expect(
        (await readOffersByIds([present, randomUUID()])).map((o) => o.id),
      ).toEqual([present])
      expect(await readOffersByIds([])).toEqual([])
      const many = Array.from({ length: 101 }, () => randomUUID())
      await expect(readOffersByIds(many)).rejects.toThrow(InvalidOfferIds)
      await expect(readOffersByIds(['not-an-id'])).rejects.toThrow(
        InvalidOfferIds,
      )
      expect(await readOffersByIds(many.slice(0, 100))).toEqual([])
    })
  })
})
