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

/**
 * T11-AC03 of epic sq2 (task oferty-pracy-sq2.12): the AI assignments
 * panel's routes and pages, and the navigation of every page with its
 * counter, against the built web server on an isolated schema.
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

integration('AI assignments panel over HTTP (T11-AC03)', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const schema = `ai_panel_http_${suffix}`
  const queueSchema = `aiph_q_${suffix}`
  let admin: Pool, pool: Pool, child: ChildProcess, base: string

  const assignment = async (status: string, label: string) => {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO ai_assignments(id,settings_name,type,label,instruction,input,
        executor,executor_parameters,status,failure_reason,
        automatic_operation_limit,placed_at,deadline,finished_at)
       VALUES($1,'matching','single',$2,'I','In','openai','{"model":"m"}',$3,
        $4,3,now(),now()+interval '7 days',
        CASE WHEN $3 IN ('succeeded','failed') THEN now() END)`,
      [id, label, status, status === 'failed' ? 'rejected' : null],
    )
    return id
  }
  const page = async (path: string) => {
    const response = await fetch(`${base}${path}`)
    expect(response.status, path).toBe(200)
    return response.text()
  }
  /** The navigation's counter in a page's HTML, or null without one. */
  const counter = (html: string) =>
    /data-testid="ai-attention-count"[^>]*>(\d+)</.exec(html)?.[1] ?? null

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
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(address.port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error('Isolated Nitro exited before startup')
      try {
        if ((await fetch(`${base}/api/ai-assignments/needing-attention`)).ok)
          return
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
    await pool.query('TRUNCATE ai_assignments CASCADE')
  })

  it('links "Zlecenia AI" from the offers, companies and profile pages, without a counter when nothing needs attention', async () => {
    await assignment('in_progress', 'Oferta w toku')
    for (const path of ['/offers', '/companies', '/profile']) {
      const html = await page(path)
      expect(html, path).toMatch(/href="\/ai-assignments"[^>]*>Zlecenia AI/)
      expect(counter(html), path).toBeNull()
    }
    expect(
      await (
        await fetch(`${base}/api/ai-assignments/needing-attention`)
      ).json(),
    ).toEqual({ count: 0 })
  })

  it('shows 2 in the navigation with two assignments needing attention', async () => {
    await assignment('needs_attention', 'Pierwsze')
    await assignment('needs_attention', 'Drugie')
    await assignment('failed', 'Nieudane')
    for (const path of ['/offers', '/companies', '/profile', '/ai-assignments'])
      expect(counter(await page(path)), path).toBe('2')
    expect(
      await (
        await fetch(`${base}/api/ai-assignments/needing-attention`)
      ).json(),
    ).toEqual({ count: 2 })
  })

  it('shows the list and opens an assignment’s details', async () => {
    const waiting = await assignment('needs_attention', 'Oferta do sprawdzenia')
    const failed = await assignment('failed', 'Oferta odrzucona')
    const list = await (await fetch(`${base}/api/ai-assignments`)).json()
    expect(
      list.items.map((row: { assignmentId: string }) => row.assignmentId),
    ).toEqual([waiting, failed])
    expect(list.nextCursor).toBeNull()

    const html = await page('/ai-assignments')
    expect(html).toContain(`href="/ai-assignments/${waiting}"`)
    expect(html).toContain(`href="/ai-assignments/${failed}"`)
    for (const text of [
      'Oferta do sprawdzenia',
      'Wymaga uwagi',
      'Nieudane',
      'Odrzucone przez właściciela',
      'Pojedyncza odpowiedź',
      'Dopasowanie',
    ])
      expect(html).toContain(text)

    const details = await (
      await fetch(`${base}/api/ai-assignments/${failed}`)
    ).json()
    expect(details).toMatchObject({
      assignmentId: failed,
      status: 'failed',
      failureReason: 'rejected',
      operations: [],
    })
    const detailsPage = await page(`/ai-assignments/${failed}`)
    expect(detailsPage).toContain('Oferta odrzucona')
    expect(detailsPage).toContain('Odrzucone przez właściciela')
    expect(detailsPage).toContain('Koszt obciążający budżet')
  })

  it('answers 404 for an unknown assignment and an empty page for a foreign cursor', async () => {
    expect(
      (await fetch(`${base}/api/ai-assignments/${randomUUID()}`)).status,
    ).toBe(404)
    expect((await fetch(`${base}/api/ai-assignments/nonsense`)).status).toBe(
      404,
    )
    expect(
      await (await fetch(`${base}/api/ai-assignments?cursor=nonsense`)).json(),
    ).toEqual({ items: [], nextCursor: null })
  })
})
