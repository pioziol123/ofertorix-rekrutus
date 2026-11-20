import { get } from 'node:http'
import { describe, expect, it } from 'vitest'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('running Compose services', () => {
  it('serves a readiness response after checking PostgreSQL and the newest migration (B1-AC15)', async () => {
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
})
