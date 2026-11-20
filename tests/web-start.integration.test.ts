import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

async function freePort(): Promise<number> {
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  await new Promise((resolve) => probe.close(resolve))
  return address.port
}

/** Starts the built web server with `env`; returns its base and output. */
async function startServer(env: Record<string, string>) {
  const port = await freePort()
  let output = ''
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const exited = once(child, 'exit').then(([code]) => code as number | null)
  const base = `http://127.0.0.1:${port}`
  return {
    base,
    output: () => output,
    exited,
    async ready(): Promise<number> {
      for (let i = 0; i < 150; i++) {
        if (child.exitCode !== null) throw new Error(`Server exited: ${output}`)
        try {
          return (await fetch(`${base}/api/health/ready`)).status
        } catch {
          await sleep(100)
        }
      }
      throw new Error('Server did not answer')
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await exited
      }
    },
  }
}

integration('web application start and readiness (B1-AC03, B1-AC15)', () => {
  const schema = `web_start_${randomUUID().replaceAll('-', '').slice(0, 16)}`
  let admin: Pool
  const servers: Awaited<ReturnType<typeof startServer>>[] = []
  const start = async (env: Record<string, string>) => {
    const server = await startServer(env)
    servers.push(server)
    return server
  }
  const inSchema = () => {
    const url = new URL(process.env.DATABASE_URL!)
    url.searchParams.set('options', `-c search_path=${schema}`)
    return url.toString()
  }

  beforeAll(async () => {
    await access('.output/server/index.mjs')
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
  })

  afterAll(async () => {
    for (const server of servers) await server.stop()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.end()
  })

  it('stops at start on an invalid queue configuration, naming the queue and the field', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'queues-')), 'queues.json')
    await writeFile(file, JSON.stringify({ 'some-queue': { attempts: -2 } }))
    const server = await start({ QUEUE_CONFIGURATION: file })
    expect(await server.exited).not.toBe(0)
    expect(server.output()).toContain('queue "some-queue", field "attempts"')
  }, 30_000)

  it('is ready with the database answering and the newest migration applied', async () => {
    const server = await start({})
    expect(await server.ready()).toBe(200)
  }, 30_000)

  it('is not ready while the newest migration is not applied', async () => {
    await admin.query(
      `CREATE TABLE ${schema}.pgmigrations (id serial, name text, run_on timestamptz)`,
    )
    await admin.query(
      `INSERT INTO ${schema}.pgmigrations (name, run_on) VALUES ('1770000000000_setup', now())`,
    )
    const server = await start({ DATABASE_URL: inSchema() })
    expect(await server.ready()).toBe(503)
  }, 30_000)

  it('is not ready without the database', async () => {
    const server = await start({
      DATABASE_URL: `postgresql://oferty@127.0.0.1:${await freePort()}/oferty`,
    })
    expect(await server.ready()).toBe(503)
  }, 30_000)
})
