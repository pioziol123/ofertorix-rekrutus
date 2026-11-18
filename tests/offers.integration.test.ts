import { get } from 'node:http'
import { describe, expect, it } from 'vitest'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

function http(
  path: string,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = get(
      new URL(path, process.env.WEB_BASE_URL ?? 'http://web:3000'),
      { headers: { Host: 'localhost' } },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          body += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode, body }))
        response.on('error', reject)
      },
    )
    request.setTimeout(10000, () => request.destroy(new Error('HTTP timeout')))
    request.on('error', reject)
  })
}
integration('local offers HTTP without login', () => {
  it('serves a paginated list and detail without a session cookie', async () => {
    const response = await http('/api/offers')
    expect(response.status).toBe(200)
    const data = JSON.parse(response.body)
    expect(data.pageSize).toBe(20)
    expect(data.items.length).toBeLessThanOrEqual(20)
    expect(data.total).toBeGreaterThanOrEqual(data.items.length)
    if (data.items[0]) {
      const detail = await http(`/api/offers/${data.items[0].id}`)
      expect(detail.status).toBe(200)
      expect(JSON.parse(detail.body).id).toBe(data.items[0].id)
    }
    const invalid = await http('/api/offers?minSalary=25000')
    expect(invalid.status).toBe(400)
    expect((await http('/api/offers/not-a-uuid')).status).toBe(404)
  })
  it('renders the list on direct navigation without login', async () => {
    const response = await http('/offers')
    expect(response.status).toBe(200)
    expect(response.body).toContain('Wszystkie oferty')
    expect(response.body).not.toContain('Hasło właściciela')
  }, 15000)
  // A16-AC08: the source and run state keep the form the page reads.
  it('serves the source catalogue and the sync state in their existing form', async () => {
    const jobspy = JSON.parse((await http('/api/sources/jobspy')).body)
    expect(Object.keys(jobspy)).toEqual([
      'enabled',
      'scheduled',
      'run',
      'sources',
    ])
    expect(Object.keys(jobspy.sources[0])).toEqual([
      'source',
      'name',
      'prefix',
      'hosts',
      'scope',
      'restriction',
      'reason',
      'connected',
      'enabled',
      'scheduled',
      'run',
    ])
    const polish = JSON.parse((await http('/api/sources/polish')).body)
    expect(Object.keys(polish)).toEqual(['scheduled', 'sources'])
    expect(Object.keys(polish.sources[0])).toEqual([
      'source',
      'name',
      'host',
      'connected',
      'enabled',
      'scheduled',
      'run',
    ])
    const offers = JSON.parse((await http('/api/offers')).body)
    expect(offers).toMatchObject({ jobspy, polish })
    expect(Object.keys(offers.sync)).toEqual(['run', 'lastComplete'])
  })
})
