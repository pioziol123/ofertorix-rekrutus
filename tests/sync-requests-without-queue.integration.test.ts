import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// A16-R06: with the database and the queue unreachable, requesting a
// disabled source still answers as before 0mq.16, because the entry points
// check the source before they connect the queue.
const unreachable = 'postgresql://nobody@127.0.0.1:1/none'

async function freePort(): Promise<number> {
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  await new Promise<void>((resolve, reject) =>
    probe.close((e) => (e ? reject(e) : resolve())),
  )
  return address.port
}

integration('sync requests while the queue is unavailable', () => {
  let child: ChildProcess
  let base: string

  beforeAll(async () => {
    await access('.output/server/index.mjs')
    const port = await freePort()
    base = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['.output/server/index.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: unreachable,
        POLISH_SOURCES: 'theprotocol',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: String(port),
      },
      stdio: 'ignore',
    })
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Nitro exited at startup')
      try {
        if ((await fetch(`${base}/api/health/live`)).ok) return
      } catch {
        // The server may still be starting.
      }
      await delay(100)
    }
    throw new Error('Nitro startup timed out')
  }, 30_000)

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), delay(2000)])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  })

  const request = (body: unknown) =>
    fetch(`${base}/api/sources/polish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify(body),
    })

  it('answers 409 for a disabled Polish portal and 503 for an enabled one', async () => {
    const disabled = await request({ source: 'bulldogjob' })
    expect(disabled.status).toBe(409)
    expect(disabled.statusText).toBe('Source disabled')
    const enabled = await request({ source: 'theprotocol' })
    expect(enabled.status).toBe(503)
    expect(enabled.statusText).toBe('Could not queue source import')
  }, 30_000)

  it('prints that a JobSpy portal is disabled', async () => {
    const result = await promisify(execFile)(
      'node_modules/.bin/tsx',
      ['scripts/jobspy-sync.ts', '--source', 'bayt'],
      {
        env: { ...process.env, DATABASE_URL: unreachable, JOBSPY_SOURCES: '' },
        timeout: 60_000,
      },
    ).then(
      () => ({ code: 0, stderr: '' }),
      (error: { code?: number; stderr?: string }) => ({
        code: error.code,
        stderr: error.stderr ?? '',
      }),
    )
    expect(result).toEqual({ code: 1, stderr: 'JobSpy source is disabled\n' })
  }, 60_000)
})
