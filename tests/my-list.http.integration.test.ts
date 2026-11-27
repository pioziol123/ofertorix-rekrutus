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
import { formatDate, formatDateTime } from '../lib/time/index.ts'
import {
  noteTooLongMessage,
  refusalText,
  stageChangedMessage,
} from '../modules/recruitments/view.ts'

/**
 * The page Moja lista and the application details (task oferty-pracy-lq3.2,
 * T2 of epic lq3) against the built web server on an isolated schema: the
 * navigation link (T2-AC01), the rows (T2-AC02, T2-AC11, A-AC11), the empty
 * list (T2-AC06), the address (T2-AC05), the drawer (T2-AC08, T2-AC11), a
 * choice and a stale choice in the details (T2-AC09), the link from offer
 * details (T2-AC10) and the note's route (A-AC03, A-AC07).
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

/** Text of the HTML without tags, with common entities decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const labels = {
  to_consider: 'Do rozważenia',
  cv_sent: 'CV wysłane',
  rejected: 'Odrzucone',
  removed: 'Zdjęta z listy',
} as const
type Stage = keyof typeof labels

integration('Moja lista and the application details over HTTP (T2)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `my_list_page_${suffix}`
  const queueSchema = `mylistp_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, base: string, scope: string

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify(body),
    })
  const start = (offerId: string, target: string) =>
    post(`/api/offers/${offerId}/application`, { target })
  const move = (offerId: string, expected: string, target: string) =>
    post(`/api/applications/${offerId}/stage`, { expected, target })
  const saveNote = (offerId: string, note: unknown) =>
    post(`/api/applications/${offerId}/note`, { note })
  const application = async (offerId: string) => {
    const response = await fetch(`${base}/api/applications/${offerId}`)
    return response.status === 404 ? null : await response.json()
  }
  const page = async (address: string) => {
    const response = await fetch(`${base}${address}`)
    expect(response.status, address).toBe(200)
    return response.text()
  }
  /** The rows of the rendered list, each as its HTML. */
  const rows = (html: string) =>
    html
      .split('data-testid="my-list-row"')
      .slice(1)
      .map((row) => row.split('</tr>')[0]!)
  const offerOfRow = (row: string) => /data-offer="([^"]+)"/.exec(row)?.[1]
  /** The rendered drawer of the application details, or undefined. */
  const drawer = (html: string) =>
    html.split('data-testid="application-details"')[1]?.split('</aside>')[0]

  async function offer(
    title = 'Recruited PHP',
    availability = 'available',
    salaries: unknown[] = [],
  ): Promise<string> {
    const id = randomUUID(),
      version = randomUUID()
    await pool.query(
      `INSERT INTO source_ads(id,source,external_id,url,last_seen_scope_id,availability)
      VALUES($1,'bayt',$4,$2,$3,$5)`,
      [id, `https://example.com/${id}`, scope, id, availability],
    )
    await pool.query(
      `INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload,retrieved_at)
      VALUES($1,$2,$3,$4,now())`,
      [
        version,
        id,
        version,
        { title, company: 'TestCo', skills: [], salaries },
      ],
    )
    await pool.query(
      'UPDATE source_ads SET current_revision_id=$2 WHERE id=$1',
      [id, version],
    )
    return id
  }
  /** An offer whose application is in the stage, through the routes. */
  async function offerIn(stage: Stage, title?: string, availability?: string) {
    const id = await offer(title, availability)
    if (stage === 'removed') {
      expect((await start(id, 'to_consider')).status).toBe(200)
      expect((await move(id, 'to_consider', 'removed')).status).toBe(200)
    } else expect((await start(id, stage)).status).toBe(200)
    return id
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
    scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'bayt',$2,'{}')",
      [scope, randomUUID()],
    )

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

  it('says "Brak ofert na liście dla wybranego etapu" when no application matches the choice (T2-AC06)', async () => {
    const html = await page('/my-list?stage=rejected')
    expect(text(html)).toContain('Brak ofert na liście dla wybranego etapu')
    expect(rows(html)).toEqual([])
  })

  it('has the link "Moja lista" in the navigation of each page, which opens the page (T2-AC01)', async () => {
    for (const path of [
      '/offers',
      '/my-list',
      '/syncs',
      '/profile',
      '/companies',
      '/ai-assignments',
    ]) {
      const html = await page(path)
      const nav = html.split('class="app-nav"')[1]?.split('</nav>')[0]
      expect(nav, path).toBeDefined()
      expect(nav, path).toMatch(
        /<a[^>]*href="\/my-list"[^>]*data-testid="nav-my-list"[^>]*>Moja lista<\/a>|<a[^>]*data-testid="nav-my-list"[^>]*href="\/my-list"[^>]*>Moja lista<\/a>/,
      )
    }
    const html = await page('/my-list')
    expect(html).toMatch(/<h1[^>]*>Moja lista<\/h1>/)
  })

  it('shows each row with title, company, stage label and icon, the unavailability mark only for an unavailable ad and the stage date, not grouped by day (T2-AC02, T2-AC11, A-AC11)', async () => {
    const byStage: Record<Stage, string> = {
      to_consider: await offerIn('to_consider', 'Oferta do rozważenia'),
      cv_sent: await offerIn('cv_sent', 'Oferta CV', 'unavailable'),
      rejected: await offerIn('rejected', 'Oferta odrzucona'),
      removed: await offerIn('removed', 'Oferta zdjęta'),
    }
    const html = await page('/my-list?stage=all')
    const shown = rows(html)
    const ofStage = (stage: Stage) =>
      shown.find((row) => offerOfRow(row) === byStage[stage])
    expect(ofStage('removed')).toBeUndefined()
    for (const stage of ['to_consider', 'cv_sent', 'rejected'] as const) {
      const row = ofStage(stage)!
      expect(row, stage).toBeDefined()
      const stored = await application(byStage[stage])
      const rowText = text(row)
      expect(rowText).toContain('TestCo')
      expect(rowText).toContain(labels[stage])
      expect(rowText).toContain(formatDate(new Date(stored.stageChangedAt)))
      expect(row).toMatch(/class="stage-label"[^>]*>\s*<svg/)
      expect(rowText.includes('Niedostępna w źródle'), stage).toBe(
        stage === 'cv_sent',
      )
      expect(row).not.toMatch(/<select/)
    }
    expect(text(ofStage('cv_sent')!)).toContain('Oferta CV')
    // One table with every row, no headings of days.
    const table = html
      .split('data-testid="my-list-table"')[1]!
      .split('</table>')[0]!
    expect(table.match(/<tbody/g)).toHaveLength(1)
    expect(table).not.toMatch(/<h2/)
    expect(text(table)).toContain('Ostatnia zmiana etapu')
    // The stage switch lists its choices and "Zdjęta z listy" under none.
    const choices = html
      .split('data-testid="my-list-stage"')[1]!
      .split('</select>')[0]!
    expect(
      [...choices.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(
        ([, label]) => text(label!),
      ),
    ).toEqual([
      'Aktywne',
      'Wszystkie',
      'Do rozważenia',
      'CV wysłane',
      'Odrzucone',
    ])
  })

  it('shows the details of an application: title, company, salary range, stage field, note with its counter, three changes newest first and "Otwórz ofertę" (T2-AC08, T2-AC11)', async () => {
    const id = await offer('Senior PHP w szufladzie', 'unavailable', [
      {
        from: 15000,
        to: 20000,
        currency: 'PLN',
        period: 'Month',
        employmentType: 'B2B',
      },
    ])
    await start(id, 'to_consider')
    await move(id, 'to_consider', 'cv_sent')
    await move(id, 'cv_sent', 'rejected')
    expect((await saveNote(id, 'Rozmowa z rekruterką')).status).toBe(200)
    const html = await page(`/my-list?stage=rejected&offer=${id}`)
    const details = drawer(html)!
    expect(details).toBeDefined()
    const shown = text(details)
    expect(shown).toContain('Senior PHP w szufladzie')
    expect(shown).toContain('TestCo')
    expect(shown).toContain('Niedostępna w źródle')
    expect(shown).toContain('Widełki')
    expect(shown).toContain('15 000 – 20 000 PLN / mies.')
    expect(shown).toContain('B2B · netto + VAT')
    expect(shown).toContain('Etap aplikacji')
    const select = details.split('<select')[1]!.split('</select>')[0]!
    expect(text(select.match(/<option[^>]*selected[^>]*>([^<]*)</)![1]!)).toBe(
      'Odrzucone',
    )
    expect(details).toMatch(/<textarea[^>]*>Rozmowa z rekruterką<\/textarea>/)
    expect(shown).toContain('20 / 10 000')
    expect(shown).toContain('Zapisz notatkę')
    const stored = await application(id)
    const history = details.split('data-testid="application-history"')[1]!
    const records = [...history.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(
      ([, record]) => text(record!),
    )
    expect(records).toEqual(
      (stored.history as { stage: Stage; changedAt: string }[]).map(
        (record) =>
          `${formatDateTime(new Date(record.changedAt))} ${labels[record.stage]}`,
      ),
    )
    expect(
      records.map((record) => record.split(' ').slice(2).join(' ')),
    ).toEqual(['Odrzucone', 'CV wysłane', 'Do rozważenia'])
    expect(history).toMatch(/class="stage-label"[^>]*>\s*<svg/)
    expect(details).toMatch(
      new RegExp(`href="/offers\\?offer=${id}"[^>]*>Otwórz ofertę</a>`),
    )
  })

  it('opens the details of an application outside the current view, "Zdjęta z listy" included (T2-R12)', async () => {
    const id = await offerIn('removed', 'Zdjęta oferta')
    const html = await page(`/my-list?offer=${id}`)
    expect(rows(html).map(offerOfRow)).not.toContain(id)
    expect(text(drawer(html)!)).toContain('Zdjęta oferta')
    expect(text(drawer(html)!)).toContain('Zdjęta z listy')
  })

  it('shows the list without details and without an error for an unknown address (T2-AC05)', async () => {
    for (const address of [
      `/my-list?offer=${randomUUID()}`,
      '/my-list?offer=not-an-id',
      '/my-list?stage=hired&size=30&page=999',
      '/my-list?page=0',
    ]) {
      const html = await page(address)
      expect(drawer(html), address).toBeUndefined()
      expect(html, address).not.toContain('role="alert"')
      expect(html, address).toContain('data-testid="page-jump"')
    }
    const clamped = text(await page('/my-list?stage=hired&size=30&page=999'))
    expect(clamped).toMatch(/Strona (\d+) z \1/)
  })

  it('shows a choice in the details as the new stage with a new history record, and refuses a choice from stale details with the message of A-R07 (T2-AC09)', async () => {
    const id = await offerIn('to_consider')
    const before = await application(id)
    const moved = await move(id, 'to_consider', 'cv_sent')
    expect(moved.status).toBe(200)
    const after = await application(id)
    expect(after.stage).toBe('cv_sent')
    expect(after.history).toHaveLength(before.history.length + 1)
    expect(after.history[0].stage).toBe('cv_sent')
    const details = drawer(await page(`/my-list?offer=${id}`))!
    const select = details.split('<select')[1]!.split('</select>')[0]!
    expect(text(select.match(/<option[^>]*selected[^>]*>([^<]*)</)![1]!)).toBe(
      'CV wysłane',
    )
    // Details still showing "Do rozważenia" choose "Odrzucone".
    const stale = await move(id, 'to_consider', 'rejected')
    expect(stale.status).toBe(409)
    const code = (await stale.json()).data.code
    expect(code).toBe('application_stage_changed')
    expect(refusalText(code)).toBe(stageChangedMessage)
    expect(await application(id)).toEqual(after)
  })

  it('has the link "Szczegóły aplikacji" in offer details of an offer with an application, "Zdjęta z listy" included, and none without one (T2-AC10)', async () => {
    const removed = await offerIn('removed')
    const none = await offer()
    const link = (html: string) =>
      html.split('data-testid="application-stage"')[1]!.split('aria-label')[0]!
    const withApplication = link(await page(`/offers?offer=${removed}`))
    expect(withApplication).toMatch(
      new RegExp(
        `href="/my-list\\?offer=${removed}"[^>]*>Szczegóły aplikacji</a>`,
      ),
    )
    expect(text(link(await page(`/offers?offer=${none}`)))).not.toContain(
      'Szczegóły aplikacji',
    )
    const opened = drawer(await page(`/my-list?offer=${removed}`))
    expect(opened).toBeDefined()
  })

  it('saves a note of 10 000 characters, refuses 10 001 with note_too_long, and refuses a note for an offer without an application without creating one (A-AC03, A-AC07)', async () => {
    const id = await offerIn('rejected')
    const before = await application(id)
    const full = 'n'.repeat(10_000)
    expect((await saveNote(id, full)).status).toBe(200)
    const tooLong = await saveNote(id, 'n'.repeat(10_001))
    expect(tooLong.status).toBe(422)
    const code = (await tooLong.json()).data.code
    expect(code).toBe('note_too_long')
    expect(refusalText(code)).toBe(noteTooLongMessage)
    const after = await application(id)
    expect(after.note).toBe(full)
    expect([after.stage, after.stageChangedAt]).toEqual([
      before.stage,
      before.stageChangedAt,
    ])
    const none = await offer()
    const missing = await saveNote(none, 'Notatka')
    expect(missing.status).toBe(404)
    expect((await missing.json()).data.code).toBe('application_not_found')
    expect(await application(none)).toBeNull()
    expect((await (await saveNote('not-an-id', 'x')).json()).data.code).toBe(
      'invalid_input',
    )
    expect((await (await saveNote(id, 42)).json()).data.code).toBe(
      'invalid_input',
    )
  })

  it('reads offers by IDs and refuses more than 100 or a malformed one as invalid input', async () => {
    const id = await offer('Po ID')
    const read = await fetch(
      `${base}/api/offer-summaries?ids=${id},${randomUUID()}`,
    )
    expect(read.status).toBe(200)
    expect((await read.json()).map((o: { title: string }) => o.title)).toEqual([
      'Po ID',
    ])
    const many = Array.from({ length: 101 }, () => randomUUID()).join(',')
    for (const ids of [many, 'not-an-id']) {
      const refused = await fetch(`${base}/api/offer-summaries?ids=${ids}`)
      expect(refused.status).toBe(422)
      expect((await refused.json()).data).toEqual({ code: 'invalid_input' })
    }
  })
})
