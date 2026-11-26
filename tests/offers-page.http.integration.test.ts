import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readdirSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The offer list without sync information (T5 of epic nq3, task
 * oferty-pracy-nq3.5) against the built web server on an isolated schema:
 * the rendered page (T5-AC01, AC04), the offer read (T5-AC04) and the
 * removed routes of the import form and of the portals' state (T5-AC02,
 * AC05).
 */

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

/** The database migrations in order, the queue migrations left out. */
const queueMigrations = new Set([
  '1770000000022_profile_cv_text_queue',
  '1770000000023_source_sync_run_queue',
  '1770000000025_ai_execution_queues',
  '1770000000028_ai_operation_queue_openai',
  '1770000000029_ai_operation_queue_ollama',
  '1770000000037_ai_execution_queues_removed',
])
const migrations = readdirSync(new URL('../migrations/', import.meta.url))
  .filter((name) => name.endsWith('.cjs'))
  .map((name) => name.slice(0, -'.cjs'.length))
  .filter((name) => !queueMigrations.has(name))
  .sort()

/** Text of the HTML without tags, with entities of quotes decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')

integration('offer list without sync information over HTTP (T5)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `offers_page_${suffix}`
  const queueSchema = `offersp_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, base: string
  const seen = randomUUID(),
    gone = randomUUID()

  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`)
    expect(response.status, path).toBe(200)
    return response
  }
  const page = async (path: string) => (await get(path)).text()
  const runs = async () =>
    Number(
      (await pool.query('SELECT count(*) AS n FROM source_sync_runs')).rows[0]
        .n,
    )

  /** Stores an ad of the source with a current version. */
  async function ad(
    id: string,
    source: string,
    scope: string,
    title: string,
    availability: string,
  ) {
    const version = randomUUID()
    await pool.query(
      `INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id,availability)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [id, source, id, `https://example.com/${id}`, scope, availability],
    )
    await pool.query(
      `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload,retrieved_at)
      VALUES($1,$2,$3,$4,now())`,
      [version, id, version, { title, company: 'TestCo', skills: [] }],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, version],
    )
  }

  beforeAll(async () => {
    await access('.output/server/index.mjs')
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    await admin.query(`CREATE SCHEMA ${schema}`)
    const connection = new URL(process.env.DATABASE_URL!)
    connection.searchParams.set('options', `-c search_path=${schema}`)
    pool = new Pool({ connectionString: connection.toString(), max: 2 })
    for (const name of migrations) {
      const sql: string[] = []
      createRequire(import.meta.url)(`../migrations/${name}.cjs`).up({
        sql: (s: string) => sql.push(s),
      })
      for (const statement of sql) await pool.query(statement)
    }
    const baytScope = randomUUID(),
      solidScope = randomUUID()
    await pool.query(
      'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        baytScope,
        'bayt',
        randomUUID(),
        {},
        solidScope,
        'solid-jobs',
        randomUUID(),
        {},
      ],
    )
    await ad(seen, 'bayt', baytScope, 'Seen PHP', 'available')
    await ad(gone, 'solid-jobs', solidScope, 'Gone PHP', 'unavailable')

    const probe = createServer().listen(0, '127.0.0.1')
    await once(probe, 'listening')
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('No test port')
    await new Promise((resolve) => probe.close(resolve))
    base = `http://127.0.0.1:${address.port}`
    child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: connection.toString(),
        PG_BOSS_SCHEMA: queueSchema,
        // The Polish portal the removed form would have requested is enabled.
        POLISH_SOURCES: 'bulldogjob',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(address.port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error('Isolated Nitro exited before startup')
      try {
        if ((await fetch(`${base}/api/offers`)).ok) return
      } catch {
        // The server may still be starting.
      }
      await delay(100)
    }
    throw new Error('Isolated Nitro startup timed out')
  }, 60_000)

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), delay(2000)])
      if (child.exitCode === null) {
        child.kill('SIGKILL')
        await once(child, 'exit')
      }
    }
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`)
      await admin.end()
    }
  }, 15_000)

  it('shows no sync summary, notice or portal sections, and keeps "Odśwież widok" (T5-AC01)', async () => {
    const html = await page('/offers')
    const shown = text(html)
    expect(shown).toContain('Wszystkie oferty')
    for (const removed of [
      'SOLID.Jobs — ostatni pełny import',
      'Ostatni import był niepełny',
      'Źródła JobSpy',
      'Polskie serwisy — pobieranie ofert',
      'Pobierz oferty',
      'Jeden import pobiera do 50 ofert',
    ])
      expect(shown).not.toContain(removed)
    const button = html.split('data-testid="offers-refresh"')[1]
    expect(button, 'the button "Odśwież widok"').toBeDefined()
    expect(text(button!.split('</button>')[0]!)).toContain('Odśwież widok')
  })

  it('reads the offers with their availability and source and without sync state (T5-AC04)', async () => {
    const all = await (await get('/api/offers')).json()
    for (const key of ['sync', 'jobspy', 'polish'])
      expect(all).not.toHaveProperty(key)
    expect(all).toHaveProperty('matching')
    const byId = Object.fromEntries(
      all.items.map((o: { id: string }) => [o.id, o]),
    )
    expect(byId[seen]).toMatchObject({
      availability: 'available',
      source: 'Bayt',
    })
    expect(byId[gone]).toMatchObject({ availability: 'unavailable' })
    const ids = async (availability: string) =>
      (
        await (await get(`/api/offers?availability=${availability}`)).json()
      ).items.map((o: { id: string }) => o.id)
    expect(await ids('available')).toEqual([seen])
    expect(await ids('unavailable')).toEqual([gone])
  })

  it('renders the availability filter, the label, the source and "Otwórz w … ↗" (T5-AC04)', async () => {
    const list = await page('/offers')
    expect(list).toContain('Widziane w źródle')
    expect(list).toContain('Niedostępne w źródle')
    const shown = text(list)
    expect(shown).toContain('Źródło przy każdej ofercie')
    expect(shown).toContain('Niedostępna w źródle')
    expect(shown).toContain('Bayt')
    const filtered = text(await page('/offers?availability=unavailable'))
    expect(filtered).toContain('Gone PHP')
    expect(filtered).not.toContain('Seen PHP')
    const detail = text(await page(`/offers?offer=${seen}`))
    expect(detail).toContain('Otwórz w Bayt ↗')
    expect(detail).toContain('Widziana w źródle')
    const unavailable = text(await page(`/offers?offer=${gone}`))
    expect(unavailable).toContain('Otwórz w SOLID.Jobs ↗')
    expect(unavailable).toMatch(/Dostępność\s+Niedostępna w źródle/)
  })

  it('refuses a Polish portal sync sent the way the removed form sent it and creates no sync (T5-AC02)', async () => {
    const response = await fetch(`${base}/api/sources/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({
        source: 'bulldogjob',
        technology: 'PHP',
        seniority: 'senior',
      }),
    })
    expect(response.status).toBe(404)
    await delay(500)
    expect(await runs()).toBe(0)
  })

  it('refuses the removed state of the JobSpy and Polish portals (T5-AC05)', async () => {
    for (const path of ['/api/sources/jobspy', '/api/sources/polish']) {
      const response = await fetch(`${base}${path}`)
      expect(response.status, path).toBe(404)
    }
  })
})
