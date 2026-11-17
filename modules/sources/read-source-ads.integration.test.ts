import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool, transaction } from '../../lib/db.ts'
import {
  missingAdCompany,
  missingAdTitle,
  readAdVersionList,
  readAdVersions,
  readCurrentAds,
  readCurrentAdVersions,
} from './index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration(
  'public read of source ads in an isolated PostgreSQL schema',
  () => {
    const schema = `read_ads_${randomUUID().replaceAll('-', '')}`
    let admin: Pool
    let pool: Pool
    let scope: string
    let ad: string, oldVersion: string, currentVersion: string

    beforeAll(async () => {
      admin = new Pool({ connectionString: process.env.DATABASE_URL })
      await admin.query(`CREATE SCHEMA ${schema}`)
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema}`,
      })
      const sql: string[] = []
      createRequire(import.meta.url)(
        '../../migrations/1770000000001_sources.cjs',
      ).up({ sql: (s: string) => sql.push(s) })
      await pool.query(sql.join('\n'))
      setPool(pool)
    }, 30_000)

    beforeEach(async () => {
      await pool.query(
        'TRUNCATE source_ad_revisions, source_ads, source_scopes CASCADE',
      )
      scope = randomUUID()
      await pool.query(
        'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
        [scope, 'himalayas', randomUUID(), {}],
      )
      ad = randomUUID()
      oldVersion = randomUUID()
      currentVersion = randomUUID()
      await insertAd(ad, 'himalayas', 'https://himalayas.app/jobs/1', [
        [
          oldVersion,
          '2026-10-01T10:00:00Z',
          { title: 'Old PHP', company: 'OldCo', isRemote: false },
        ],
        [
          currentVersion,
          '2026-10-02T10:00:00Z',
          {
            title: '  Senior PHP  ',
            company: 'TestCo',
            description: '<p>PHP &amp; SQL</p>',
            skills: [
              { name: 'PHP', level: 'Advanced' },
              { name: 'Redis', optional: true },
            ],
            salaries: [
              {
                from: 20000,
                to: 25000,
                currency: 'PLN',
                period: 'Month',
                employmentType: 'B2B',
                origin: 'portal_estimate',
              },
            ],
            locations: ['Warszawa'],
            experienceLevel: 'Senior',
            contractTime: 'FullTime',
            isRemote: true,
            isHybrid: false,
            validFrom: '2026-09-30T00:00:00Z',
            qualificationUnknown: ['timezone'],
          },
        ],
      ])
      await pool.query(
        "UPDATE source_ads SET valid_to='2020-01-01',availability='unavailable' WHERE id=$1",
        [ad],
      )
    })

    afterAll(async () => {
      await closePool()
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await admin.end()
      }
    })

    async function insertAd(
      id: string,
      source: string,
      url: string | null,
      versions: [string, string, Record<string, unknown>][],
    ) {
      await pool.query(
        'INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id) VALUES($1,$2,$3,$4,$5)',
        [id, source, randomUUID(), url, scope],
      )
      for (const [versionId, at, payload] of versions)
        await pool.query(
          'INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload,retrieved_at) VALUES($1,$2,$3,$4,$5)',
          [versionId, id, randomUUID(), payload, at],
        )
      await pool.query(
        'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
        [id, versions.at(-1)![0]],
      )
    }

    it('reads the current ad with its current version in the unified form (A6-AC01)', async () => {
      const [read] = await readCurrentAds([ad, randomUUID()])
      const stored = (
        await pool.query(
          'SELECT first_seen_at,last_seen_at,valid_to FROM source_ads WHERE id=$1',
          [ad],
        )
      ).rows[0]
      expect(read).toEqual({
        id: ad,
        versionId: currentVersion,
        title: 'Senior PHP',
        company: 'TestCo',
        url: 'https://himalayas.app/jobs/1',
        description: 'PHP & SQL',
        skills: [
          { name: 'PHP', optional: false },
          { name: 'Redis', optional: true },
        ],
        salaries: [
          {
            from: 20000,
            to: 25000,
            currency: 'PLN',
            period: 'Month',
            contract: 'B2B',
            origin: 'portal_estimate',
          },
        ],
        locations: ['Warszawa'],
        seniority: 'Senior',
        hours: 'FullTime',
        mode: 'remote',
        firstSeen: stored.first_seen_at.toISOString(),
        lastSeen: stored.last_seen_at.toISOString(),
        published: '2026-09-30T00:00:00.000Z',
        validTo: stored.valid_to.toISOString(),
        availability: 'unavailable',
        expired: true,
        source: 'Himalayas',
        qualificationUnknown: ['timezone'],
        remoteEligibility: expect.any(Object),
      })
    })

    it('reads many ads in one query, and the whole catalogue without a list', async () => {
      const other = randomUUID(),
        otherVersion = randomUUID()
      await insertAd(other, 'test', null, [
        [otherVersion, '2026-10-03T10:00:00Z', {}],
      ])
      const many = await readCurrentAds([other, ad, other])
      expect(
        many
          .map((a) => [a.id, a.versionId])
          .sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
      ).toEqual(
        [
          [ad, currentVersion],
          [other, otherVersion],
        ].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
      )
      const unnamed = many.find((a) => a.id === other)!
      expect(unnamed).toMatchObject({
        title: missingAdTitle,
        company: missingAdCompany,
        url: null,
        expired: false,
        availability: 'available',
      })
      expect(unnamed.source).toBeUndefined()
      expect((await readCurrentAds()).map((a) => a.id).sort()).toEqual(
        [ad, other].sort(),
      )
      expect(await readCurrentAds([])).toEqual([])
    })

    it('reads a given version with the content of that version', async () => {
      const [old] = await readAdVersions([oldVersion, randomUUID()])
      expect(old).toMatchObject({
        id: ad,
        versionId: oldVersion,
        title: 'Old PHP',
        company: 'OldCo',
        mode: null,
        availability: 'unavailable',
        expired: true,
        source: 'Himalayas',
      })
      const both = await readAdVersions([currentVersion, oldVersion])
      expect(both.map((v) => v.title).sort()).toEqual(['Old PHP', 'Senior PHP'])
    })

    it('lists the versions of an ad newest first and the current versions of many ads', async () => {
      expect(await readAdVersionList(ad)).toEqual([
        { id: currentVersion, at: new Date('2026-10-02T10:00:00Z') },
        { id: oldVersion, at: new Date('2026-10-01T10:00:00Z') },
      ])
      expect(await readAdVersionList(randomUUID())).toEqual([])
      expect(await readCurrentAdVersions([ad, randomUUID()])).toEqual([
        { adId: ad, versionId: currentVersion },
      ])
    })

    it('takes no row locks, so a change to the ad does not wait for a reader', async () => {
      await transaction(async () => {
        await readCurrentAds([ad])
        await readCurrentAds()
        await readAdVersions([oldVersion])
        await readAdVersionList(ad)
        await readCurrentAdVersions([ad])
        await expect(
          pool.query(
            'SELECT 1 FROM source_ads a JOIN source_ad_revisions r ON r.source_ad_id=a.id WHERE a.id=$1 FOR UPDATE NOWAIT',
            [ad],
          ),
        ).resolves.toBeTruthy()
      })
    })

    it('refuses a catalogue larger than 10 000 ads', async () => {
      await pool.query(
        `WITH ads AS (
        INSERT INTO source_ads(id,source,external_id,last_seen_scope_id)
        SELECT gen_random_uuid(),'test','bulk-'||n,$1 FROM generate_series(1,10000) n
        RETURNING id
      ) INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload)
      SELECT gen_random_uuid(),id,'bulk','{}' FROM ads`,
        [scope],
      )
      await pool.query(
        'UPDATE source_ads a SET current_revision_id=r.id FROM source_ad_revisions r WHERE r.source_ad_id=a.id AND a.current_revision_id IS NULL',
      )
      await expect(readCurrentAds()).rejects.toThrow(
        'Offer catalog exceeds current reader limit',
      )
    }, 30_000)
  },
)
