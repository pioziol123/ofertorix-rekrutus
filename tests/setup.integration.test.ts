import { randomUUID } from 'node:crypto'
import { get } from 'node:http'
import { setTimeout } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPool } from '../lib/db.ts'
import { createBoss, smokeQueue } from '../lib/queue.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('running Compose services', () => {
  const checkIds: string[] = []
  let pool: ReturnType<typeof createPool>
  let boss: ReturnType<typeof createBoss>

  beforeAll(async () => {
    pool = createPool()
    boss = createBoss()
    await boss.start()
  })

  afterAll(async () => {
    try {
      if (pool && checkIds.length)
        await pool.query(
          'DELETE FROM system_checks WHERE id = ANY($1::uuid[])',
          [checkIds],
        )
    } finally {
      await boss?.stop()
      await pool?.end()
    }
  })

  it('serves a readiness response after checking PostgreSQL', async () => {
    const response = await new Promise<{
      status: number | undefined
      body: string
    }>((resolve, reject) => {
      // Route through Compose DNS while using the intended local browser host.
      const request = get(
        new URL(
          '/api/health/ready',
          process.env.WEB_BASE_URL || 'http://web:3000',
        ),
        { headers: { Host: 'localhost' } },
        (result) => {
          let body = ''
          result.setEncoding('utf8')
          result.on('data', (chunk: string) => {
            body += chunk
          })
          result.on('error', reject)
          result.on('end', () => resolve({ status: result.statusCode, body }))
        },
      )
      request.setTimeout(5000, () =>
        request.destroy(new Error('Readiness request timed out')),
      )
      request.on('error', reject)
    })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ready' })
  })

  it('persists queued work processed by a separate worker and handles duplicate delivery idempotently', async () => {
    const checkId = randomUUID()
    checkIds.push(checkId)
    // This test only produces jobs. The independently running worker must consume both.
    const jobIds = await Promise.all([
      boss.send(smokeQueue, { checkId }),
      boss.send(smokeQueue, { checkId }),
    ])
    expect(jobIds.every(Boolean)).toBe(true)
    expect(new Set(jobIds).size).toBe(2)

    const deadline = Date.now() + 30_000
    let states: (string | undefined)[] = []
    while (Date.now() < deadline) {
      const jobs = await Promise.all(
        jobIds.map((id) => boss.getJobById(smokeQueue, id!)),
      )
      states = jobs.map((job) => job?.state)
      if (states.every((state) => state === 'completed')) break
      await setTimeout(250)
    }
    expect(states).toEqual(['completed', 'completed'])
    const { rows } = await pool.query(
      'SELECT id FROM system_checks WHERE id = $1',
      [checkId],
    )
    expect(rows).toEqual([{ id: checkId }])
  }, 35_000)
})
