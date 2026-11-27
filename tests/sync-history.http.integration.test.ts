import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readdirSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { formatDate } from '../lib/time/index.ts'
import { syncStates } from '../modules/sources/view.ts'

/**
 * The page "Synchronizacje" and its routes (T1 of epic nq3, task
 * oferty-pracy-nq3.1) against the built web server on an isolated schema:
 * the navigation link, the rows, the empty list, the details drawer and
 * the address (T1-AC01, AC04, AC08–AC11), and the count of ads marked
 * unavailable (T2-AC01, AC03, AC04, AC07).
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
    .replace(/\s+/g, ' ')

integration('page "Synchronizacje" over HTTP (T1)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `sync_page_${suffix}`
  const queueSchema = `syncp_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, base: string

  const page = async (path: string) => {
    const response = await fetch(`${base}${path}`)
    expect(response.status, path).toBe(200)
    return response.text()
  }

  let scope: string
  /** Stores a run of Bayt requested `minutesAgo` minutes ago. */
  async function run(
    status: string,
    options: {
      minutesAgo?: number
      trigger?: string
      seen?: number
      revisions?: number
      error?: string | null
      diagnostics?: unknown
      /** Another scope than Bayt's. */
      scope?: string
      markedUnavailable?: number | null
    } = {},
  ): Promise<string> {
    const id = randomUUID()
    const unfinished = ['queued', 'running'].includes(status)
    await pool.query(
      `INSERT INTO source_sync_runs(id,scope_id,trigger,schedule_day,status,
        created_at,started_at,finished_at,seen,revisions,pages,error,diagnostics,
        marked_unavailable)
      VALUES($1,$2,$3,'2026-11-26',$4::text,
        now()-make_interval(mins=>$5::int),
        CASE WHEN $4::text<>'queued' THEN now()-make_interval(mins=>$5::int) END,
        CASE WHEN NOT $6::boolean THEN now() END,
        $7,$8,2,$9,$10,$11)`,
      [
        id,
        options.scope ?? scope,
        options.trigger ?? 'manual',
        status,
        options.minutesAgo ?? 1,
        unfinished,
        options.seen ?? 0,
        options.revisions ?? 0,
        options.error ?? null,
        options.diagnostics === undefined
          ? null
          : JSON.stringify(options.diagnostics),
        options.markedUnavailable ?? null,
      ],
    )
    return id
  }
  /** Stores an ad of Bayt first seen when the run started, seen by the run. */
  async function seenNew(runId: string) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO source_ads(id,source,external_id,last_seen_scope_id,first_seen_at)
      SELECT $1,'bayt',$2,$3,started_at FROM source_sync_runs WHERE id=$4`,
      [id, id, scope, runId],
    )
    await pool.query(
      'INSERT INTO source_run_seen(run_id,source_ad_id) VALUES($1,$2)',
      [runId, id],
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
        // Bayt is disabled; SOLID.Jobs is always enabled (T3).
        JOBSPY_ENABLED: 'false',
        JOBSPY_SOURCES: '',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(address.port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error('Isolated Nitro exited before startup')
      try {
        if ((await fetch(`${base}/api/sources/syncs`)).ok) return
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

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE source_run_seen, source_ad_revisions, source_ads, source_sync_runs, source_scopes CASCADE',
    )
    scope = randomUUID()
    await pool.query(
      'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
      [scope, 'bayt', randomUUID(), {}],
    )
  })

  it('links "Synchronizacje" from the navigation of every page and offers "Odśwież" (T1-AC01)', async () => {
    for (const path of [
      '/offers',
      '/companies',
      '/profile',
      '/ai-assignments',
      '/syncs',
    ])
      expect(await page(path), path).toMatch(
        /href="\/syncs"[^>]*>Synchronizacje</,
      )
    const html = await page('/syncs')
    expect(html).toMatch(/aria-current="page"[^>]*>Synchronizacje</)
    expect(
      text(html.split('data-testid="sync-refresh"')[1]!.split('</button>')[0]!),
    ).toMatch(/>\s*Odśwież\s*$/)
  })

  // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): a row shows its time as HH:mm.
  it('shows a queued sync waiting, a running one with the ads found so far and a finished one with new and changed ads, each with its state label and tooltip (T1-AC02, AC04, AC05)', async () => {
    await run('queued', { minutesAgo: 1 })
    await run('running', { minutesAgo: 2, seen: 4, revisions: 4 })
    const finished = await run('complete', {
      minutesAgo: 3,
      trigger: 'scheduled',
      seen: 3,
      revisions: 3,
    })
    await seenNew(finished)
    await seenNew(finished)
    const html = await page('/syncs')
    const rows = html
      .split('data-testid="sync-row"')
      .slice(1)
      .map((row) => text(row.slice(row.indexOf('>') + 1)))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatch(/^\s*\d\d:\d\d Bayt Czeka na start W kolejce\b/)
    expect(rows[1]).toContain('Bayt Znaleziono 4 · trwa… W toku')
    expect(rows[2]).toContain('Bayt +2 nowe 1 zmienione Pełna')
    for (const row of rows) expect(row).not.toMatch(/ręcznie|harmonogram|PHP/)
    expect(html).toContain(
      'data-tip="Zlecona, czeka na wolne miejsce do pobierania."',
    )
    expect(html).toContain(
      'data-tip="Sprawdzono cały ustawiony zakres źródła. Pełna synchronizacja nie znaczy, że pobrano cały portal — tylko cały zakres."',
    )
    expect(html).toMatch(/data-testid="sync-day"[^>]*>\s*<h2[^>]*>Dziś</)
  })

  it('shows "—" for new and changed in the details of a queued or running sync (T1-AC04)', async () => {
    for (const status of ['queued', 'running']) {
      const id = await run(status, { seen: 5 })
      const drawer = text(
        (await page(`/syncs?sync=${id}`)).split(
          'data-testid="sync-details"',
        )[1]!,
      )
      expect(drawer, status).toMatch(
        /5 znalezionych ogłoszeń — nowych — pierwszy raz w tym źródle — zmienionych/,
      )
    }
  })

  it('says that no sync matches, with "Wyczyść filtry" only off the default (T1-AC09)', async () => {
    let html = await page('/syncs')
    expect(html).toContain('Brak synchronizacji dla wybranych filtrów')
    expect(html).not.toContain('Wyczyść filtry')
    await run('complete')
    html = await page('/syncs?state=failed')
    expect(html).toContain('Brak synchronizacji dla wybranych filtrów')
    expect(html).toContain('Wyczyść filtry')
  })

  // ASSUMPTION(oferty-pracy-nq3.6/ASM-1): the course shows dates with times as DD.MM.RRRR HH:mm.
  it('shows the details of a Niepełna sync: the way-of-starting icon with its tooltip, state, numbers, course without an attempt, the generic sentence and the stored error and diagnostics as text (T1-AC10)', async () => {
    const id = await run('partial', {
      trigger: 'scheduled',
      seen: 2,
      revisions: 2,
      error: 'Portal <b>rejected</b> requests',
      diagnostics: { http: 429 },
    })
    const html = await page(`/syncs?sync=${id}`)
    const drawer = html.split('data-testid="sync-details"')[1]!
    expect(drawer).toContain(
      'data-tip="Uruchomiona z harmonogramu dziennego" data-trigger="scheduled"',
    )
    expect(drawer).toContain('data-state="partial"')
    expect(text(drawer)).toContain(
      'Synchronizacja nie pobrała wszystkich ogłoszeń.',
    )
    expect(text(drawer)).toMatch(
      /2 znalezionych ogłoszeń 0 nowych — pierwszy raz w tym źródle 2 zmienionych/,
    )
    expect(text(drawer)).toMatch(
      /Przebieg Zlecona \d\d\.\d\d\.\d{4} \d\d:\d\d Start \S+ \S+ Koniec \S+ \S+ Czas trwania \S+ \S+ Pobrane porcje 2/,
    )
    expect(drawer).not.toMatch(/Próba/)
    expect(drawer).toContain('Szczegóły techniczne')
    expect(drawer).toContain('Portal &lt;b&gt;rejected&lt;/b&gt; requests')
    expect(drawer).not.toContain('<b>rejected</b>')
    expect(text(drawer)).toContain('"http": 429')
    expect(drawer).toContain('data-testid="sync-details-close"')

    const manual = await run('failed', { error: null, diagnostics: null })
    const failed = (await page(`/syncs?sync=${manual}`)).split(
      'data-testid="sync-details"',
    )[1]!
    expect(failed).toContain('data-tip="Uruchomiona ręcznie"')
    expect(text(failed)).toContain(
      'Synchronizacja nie pobrała wszystkich ogłoszeń.',
    )
    expect(failed).not.toContain('Szczegóły techniczne')

    const complete = await run('complete', { diagnostics: { pages: 1 } })
    const ok = (await page(`/syncs?sync=${complete}`)).split(
      'data-testid="sync-details"',
    )[1]!
    expect(ok).not.toContain('Synchronizacja nie pobrała')
    expect(ok).not.toContain('Szczegóły techniczne')
  })

  it('gives the same view for an address with filters, page, number per page and an open sync, and the list without details for a missing sync (T1-AC08)', async () => {
    const runs: string[] = []
    for (let i = 0; i < 12; i++)
      runs.push(
        await run('failed', { minutesAgo: i + 1, trigger: 'scheduled' }),
      )
    await run('complete', { trigger: 'manual' })
    const address =
      '/syncs?source=bayt&state=failed&trigger=scheduled&period=all&page=2&size=10&sync='
    const html = await page(address + runs[0])
    expect(html).toContain('Strona 2 z 2')
    expect(html.split('data-testid="sync-row"')).toHaveLength(3)
    expect(html).toContain(`data-sync="${runs[10]}"`)
    expect(html).toContain(`data-sync="${runs[11]}"`)
    expect(html).toContain('data-testid="sync-details"')
    expect(html).toMatch(/<option value="scheduled" selected/)
    expect(html).toMatch(/<option value="all" selected/)
    expect(html).toMatch(/<option value="10" selected/)
    expect(html).toContain('Wyczyść filtry')

    const missing = await page(address + randomUUID())
    expect(missing).not.toContain('data-testid="sync-details"')
    expect(missing.split('data-testid="sync-row"')).toHaveLength(3)
    const malformed = await page(address + 'nonsense')
    expect(malformed).not.toContain('data-testid="sync-details"')

    expect(
      (await fetch(`${base}/api/sources/syncs/${randomUUID()}`)).status,
    ).toBe(404)
    expect((await fetch(`${base}/api/sources/syncs/nonsense`)).status).toBe(404)
    const details = await fetch(`${base}/api/sources/syncs/${runs[0]}`)
    expect(details.headers.get('cache-control')).toBe('no-store')
    expect(await details.json()).toMatchObject({
      id: runs[0],
      status: 'failed',
    })
  })

  it('renders the shared paging and multi-choice filters on the page (lq3 T4-AC01, T4-AC02)', async () => {
    for (let i = 0; i < 12; i++) await run('failed', { minutesAgo: i + 1 })
    const html = await page('/syncs?state=failed,queued&page=2&size=10')
    const pager = html.split('aria-label="Strony synchronizacji"')[1]!
    expect(text(pager)).toMatch(/^Poprzednia\s*Strona 2 z 2\s*Następna/)
    for (const size of [10, 20, 50, 100])
      expect(pager).toContain(`<option value="${size}"`)
    expect(pager).toMatch(/<option value="10" selected/)
    expect(pager).toContain('data-testid="page-jump"')

    const source = html
      .split('data-testid="sync-filter-source"')[1]!
      .split('</details>')[0]!
    expect(text(source)).toMatch(/^Wszystkie/)
    expect(source).toMatch(/type="checkbox"[^>]*value="bayt"/)
    const state = html
      .split('data-testid="sync-filter-state"')[1]!
      .split('</details>')[0]!
    expect(text(state)).toMatch(/^Wybrano: 2/)
    expect(state.split('type="checkbox"')).toHaveLength(syncStates.length + 1)
  })

  it('shows the default of each unreadable value, 20 per page and the last page for an invalid address, without an error (T1-AC11)', async () => {
    for (let i = 0; i < 25; i++) await run('complete', { minutesAgo: i + 1 })
    const html = await page(
      '/syncs?source=nowhere&state=lost&trigger=sometimes&period=forever&size=30&page=999',
    )
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('Strona 2 z 2')
    expect(html.split('data-testid="sync-row"')).toHaveLength(6)
    expect(html).toMatch(/<option value="20" selected/)
    expect(html).toMatch(/<option value="7d" selected/)
    expect(html).not.toContain('Wyczyść filtry')
    const first = await page('/syncs?page=0')
    expect(first).toContain('Strona 1 z 2')
    const api = await (
      await fetch(`${base}/api/sources/syncs?size=30&page=999&period=forever`)
    ).json()
    expect(api).toMatchObject({ page: 2, pages: 2, size: 20, total: 25 })
  })

  describe('ads marked unavailable (T2)', () => {
    let solid: string
    beforeEach(async () => {
      solid = randomUUID()
      await pool.query(
        'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
        [solid, 'solid-jobs', randomUUID(), {}],
      )
    })
    const rowOf = (html: string, id: string) => {
      const row = html.split(`data-sync="${id}"`)[1]!
      return row.slice(0, row.indexOf('sync-state-cell'))
    }
    const drawerOf = async (id: string) =>
      (await page(`/syncs?sync=${id}`)).split('data-testid="sync-details"')[1]!
    const incomplete =
      'data-tip="Tylko pełna synchronizacja oznacza ogłoszenia jako niedostępne"'

    it('shows "2 niedostępne" in the row and 2 in the details of a complete sync that recorded 2 (T2-AC01)', async () => {
      const id = await run('complete', {
        scope: solid,
        seen: 3,
        markedUnavailable: 2,
      })
      expect(text(rowOf(await page('/syncs'), id))).toContain(
        '+0 nowe 0 zmienione 2 niedostępne',
      )
      expect(text(await drawerOf(id))).toContain(
        '2 oznaczonych jako niedostępne w źródle',
      )
    })

    it('shows "—" with the tooltip of T2-R03 for an incomplete and a failed sync (T2-AC03)', async () => {
      for (const status of ['partial', 'failed']) {
        const id = await run(status, { scope: solid })
        const row = rowOf(await page('/syncs'), id)
        expect(text(row), status).toContain('— niedostępne')
        expect(row, status).toContain(incomplete)
        const drawer = await drawerOf(id)
        expect(text(drawer), status).toContain(
          '— oznaczonych jako niedostępne w źródle',
        )
        expect(drawer, status).toContain(incomplete)
      }
    })

    it('shows "—" for a complete sync without a count, with the text used while none is recorded and then with the date of the first count (T2-AC04)', async () => {
      const before = await run('complete', { scope: solid, minutesAgo: 5 })
      let row = rowOf(await page('/syncs'), before)
      expect(text(row)).toContain('— niedostępne')
      expect(row).toContain('data-tip="Liczone od wdrożenia tej funkcji"')
      expect(await drawerOf(before)).toContain(
        'data-tip="Liczone od wdrożenia tej funkcji"',
      )

      await run('complete', { scope: solid, markedUnavailable: 0 })
      const { rows } = await pool.query<{ since: Date }>(
        'SELECT min(finished_at) AS since FROM source_sync_runs WHERE marked_unavailable IS NOT NULL',
      )
      const tip = `data-tip="Liczone od ${formatDate(rows[0]!.since)}"`
      row = rowOf(await page('/syncs'), before)
      expect(row).toContain(tip)
      expect(await drawerOf(before)).toContain(tip)
    })

    it('shows no count in the row and "nie dotyczy" in the details of a source that does not mark (T2-AC07)', async () => {
      await run('complete', { scope: solid, markedUnavailable: 1 })
      const id = await run('complete', { seen: 2, revisions: 2 })
      const row = text(rowOf(await page('/syncs'), id))
      expect(row).toContain('Bayt +0 nowe 2 zmienione')
      expect(row).not.toContain('niedostępne')
      expect(text(await drawerOf(id))).toContain(
        'nie dotyczy oznaczonych jako niedostępne w źródle',
      )
    })
  })

  describe('requesting syncs (T3)', () => {
    let solid: string
    beforeEach(async () => {
      solid = randomUUID()
      await pool.query(
        'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
        [solid, 'solid-jobs', randomUUID(), {}],
      )
    })
    const drawerOf = async (id: string) =>
      (await page(`/syncs?sync=${id}`)).split('data-testid="sync-details"')[1]!
    const post = (body: string, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/sources/syncs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: base,
          ...headers,
        },
        body,
      })

    it('offers "Wybierz źródła" and "Synchronizuj wszystkie" (T3-R01)', async () => {
      const html = await page('/syncs')
      for (const [id, label] of [
        ['sync-choose', 'Wybierz źródła'],
        ['sync-all', 'Synchronizuj wszystkie'],
      ])
        expect(
          text(html.split(`data-testid="${id}"`)[1]!.split('</button>')[0]!),
        ).toMatch(new RegExp(`>\\s*${label}\\s*$`))
    })

    it('offers "Uruchom ponownie" in the details of a finished sync of an enabled source only (T3-AC08)', async () => {
      for (const status of ['complete', 'partial', 'failed'])
        expect(
          text(await drawerOf(await run(status, { scope: solid }))),
          status,
        ).toContain('Uruchom ponownie')
      for (const status of ['queued', 'running'])
        expect(
          text(await drawerOf(await run(status, { scope: solid }))),
          status,
        ).not.toContain('Uruchom ponownie')
      // Bayt is disabled in configuration.
      expect(text(await drawerOf(await run('complete')))).not.toContain(
        'Uruchom ponownie',
      )
    })

    it('gives each source its outcome: a disabled and an unknown source are skipped (T3-AC05)', async () => {
      const response = await post(
        JSON.stringify({ sources: ['bayt', 'no-such-source'] }),
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
        outcomes: [
          { source: 'bayt', outcome: 'skipped' },
          { source: 'no-such-source', outcome: 'skipped' },
        ],
        counts: {
          requested: 0,
          alreadyRunning: 0,
          skipped: 2,
          notRequested: 0,
        },
      })
      expect(
        (await pool.query('SELECT count(*)::int AS n FROM source_sync_runs'))
          .rows[0].n,
      ).toBe(0)
    })

    it('answers 400 for a malformed body, an empty list and one longer than the catalogue, and refuses another origin', async () => {
      const tooMany = Array.from({ length: 16 }, (_, i) => `source-${i}`)
      for (const body of [
        'not json',
        JSON.stringify({ sources: 'bayt' }),
        JSON.stringify({ sources: [1] }),
        JSON.stringify({ sources: ['bayt'], extra: true }),
        JSON.stringify({ sources: [] }),
        JSON.stringify({ sources: tooMany }),
      ])
        expect((await post(body)).status, body).toBe(400)
      expect((await post('{}', { 'Content-Type': 'text/plain' })).status).toBe(
        415,
      )
      expect(
        (
          await post(JSON.stringify({ sources: ['bayt'] }), {
            Origin: 'http://elsewhere.example',
          })
        ).status,
      ).toBe(403)
    })
  })

  describe('source health in the summary strip (T4)', () => {
    /** The strip's HTML of the page at `path`. */
    const strip = async (path: string) =>
      (await page(path))
        .split('data-testid="sync-strip"')[1]!
        .split('</section>')[0]!

    it('shows 3 queued or running syncs, one of a disabled source, as a count that is not clickable, under any history filter (T4-AC01)', async () => {
      await run('queued')
      for (const status of ['queued', 'running']) {
        const other = randomUUID()
        await pool.query(
          'INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,$2,$3,$4)',
          [other, 'solid-jobs', randomUUID(), {}],
        )
        await run(status, { scope: other })
      }
      for (const path of [
        '/syncs',
        '/syncs?state=failed&period=today&page=2',
      ]) {
        const html = await strip(path)
        const counts = html.split('data-testid="sync-warning"')[0]!
        expect(text(counts), path).toContain('3 W kolejce lub w toku')
        expect(text(counts), path).toContain(
          '0 Ostatnia synchronizacja nieudana lub niepełna',
        )
        expect(text(counts), path).toContain('0 Nowe w 24 h')
        expect(counts, path).not.toMatch(/<a\b|<button\b|href=/)
      }
    })

    // ASSUMPTION(oferty-pracy-nq3.4/ASM-1): each source shows its reasons in brackets after its name.
    it('lists an enabled source without a complete sync by name with "nigdy", never the disabled one (T4-AC04)', async () => {
      await run('failed')
      const html = await strip('/syncs')
      expect(text(html)).toContain('Bez pełnej synchronizacji od 3 dni:')
      // Enabled sources without a complete sync, alphabetically: three
      // names, each a button, and the rest behind "i N innych".
      const names = [
        ...html.matchAll(
          /data-source="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/button>\s*<span[^>]*>\s*\(ostatnia pełna: nigdy\)/g,
        ),
      ].map((match) => match[2])
      expect(names).toHaveLength(3)
      expect(names).toEqual(
        [...names].sort((x, y) => x!.localeCompare(y!, 'pl')),
      )
      expect(html).toMatch(
        /data-testid="sync-warning-more"[^>]*>\s*i \d+ innych/,
      )
      const health = await (await fetch(`${base}/api/sources/health`)).json()
      const listed = health.warnings.map(
        (warning: { source: string }) => warning.source,
      )
      expect(listed).toContain('solid-jobs')
      expect(listed).not.toContain('bayt')
      expect(html).not.toContain('data-source="bayt"')
    })

    it('answers the health read as JSON, not cached', async () => {
      await run('queued')
      const response = await fetch(`${base}/api/sources/health`)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toMatchObject({ unfinished: 1 })
    })
  })
})
