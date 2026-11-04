import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { batchArchive, readBatchArchive } from '../lib/matching/archive.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('full batch artifacts in isolated PostgreSQL', () => {
  const schema = `matching_archive_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    await pool.query(
      'CREATE TABLE matching_requests(id uuid PRIMARY KEY,group_id uuid,request_payload jsonb)',
    )
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../migrations/1770000000012_matching_batch_archives.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE matching_batch_artifacts,matching_requests')
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  it('preserves exact content, deduplicates repeats and keeps changing metadata versions', async () => {
    const id = randomUUID()
    await pool.query(
      'INSERT INTO matching_requests(id,request_payload) VALUES($1,$2)',
      [id, { model: 'original' }],
    )
    const keep = batchArchive(pool, id),
      input = ' { "input": "żółć" }\n\n'
    await Promise.all([
      keep('input', 'request', input),
      keep('input', 'request', input),
    ])
    await keep('metadata', 'batch_test', '{"status":"in_progress"}')
    await keep('metadata', 'batch_test', '{"status":"completed"}')
    await keep('output', 'file_output', 'malformed output\n')
    await keep('error', 'file_error', 'raw error\n')
    const result = await readBatchArchive(pool, id)
    expect(result).toMatchObject({ operationId: id, reconstructedInput: null })
    expect(result!.artifacts).toHaveLength(5)
    expect(result!.artifacts.find((a) => a.kind === 'input')).toMatchObject({
      content: input,
      sha256: createHash('sha256').update(input).digest('hex'),
    })
    expect(
      result!.artifacts
        .filter((a) => a.kind === 'metadata')
        .map((a) => a.content)
        .sort(),
    ).toEqual(['{"status":"completed"}', '{"status":"in_progress"}'])
    expect(result!.artifacts.find((a) => a.kind === 'error')?.content).toBe(
      'raw error\n',
    )
  })
  it('resolves all members to the same complete group archive', async () => {
    const group = randomUUID(),
      a = randomUUID(),
      b = randomUUID()
    await pool.query(
      'INSERT INTO matching_requests(id,group_id,request_payload) VALUES($1,$3,$4),($2,$3,$4)',
      [a, b, group, { model: 'test' }],
    )
    await batchArchive(pool, group)('input', 'request', 'exact whole group\n')
    await batchArchive(pool, group)('output', 'file_output', 'all results\n')
    const first = await readBatchArchive(pool, a),
      second = await readBatchArchive(pool, b)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      operationId: group,
      reconstructedInput: null,
    })
    expect(first!.artifacts).toHaveLength(2)
    expect(await readBatchArchive(pool, randomUUID())).toBeNull()
  })
  it('clearly marks reconstructed old inputs and never invents missing output', async () => {
    const group = randomUUID(),
      a = randomUUID(),
      b = randomUUID(),
      single = randomUUID()
    const body = {
      model: 'test',
      instructions: 'safe saved payload',
      input: [],
    }
    await pool.query(
      'INSERT INTO matching_requests(id,group_id,request_payload) VALUES($1,$3,$4),($2,$3,$4)',
      [a, b, group, body],
    )
    await pool.query(
      'INSERT INTO matching_requests(id,request_payload) VALUES($1,$2)',
      [single, body],
    )
    const result = await readBatchArchive(pool, a)
    expect(result!.artifacts).toEqual([])
    expect(result!.reconstructedInput!.endsWith('\n')).toBe(true)
    expect(
      result!
        .reconstructedInput!.trim()
        .split('\n')
        .map((l) => JSON.parse(l)),
    ).toEqual(
      [a, b]
        .sort()
        .map((id) => ({
          custom_id: id,
          method: 'POST',
          url: '/v1/responses',
          body,
        })),
    )
    const one = await readBatchArchive(pool, single)
    expect(one!.operationId).toBe(single)
    expect(JSON.parse(one!.reconstructedInput!)).toEqual({
      custom_id: single,
      method: 'POST',
      url: '/v1/responses',
      body,
    })
    const missing = randomUUID()
    await pool.query('INSERT INTO matching_requests(id) VALUES($1)', [missing])
    expect(await readBatchArchive(pool, missing)).toMatchObject({
      artifacts: [],
      reconstructedInput: null,
    })
  })
})
