import { randomUUID, createHash } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../lib/db.ts'
import { readBatchArchive } from '../lib/matching/archive.ts'
import { archiveArtifact } from '../modules/ai/infrastructure/persistence/batch-archive.ts'
import { emptyProfile } from '../modules/profile/view.ts'
import { migrate } from './matching-ai.fixtures.ts'

/**
 * The batch archive passed to AI ownership (0mq.21): the batch adapter
 * keeps the artefacts under the batch's group, and the archive view of a
 * request reads them through the AI read of its execution.
 */
const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip
integration('full batch artifacts in isolated PostgreSQL', () => {
  const schema = `matching_archive_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool, pool: Pool, ad: string, revision: string, profile: string
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    await migrate(pool)
    setPool(pool)
  })
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE matching_batch_artifacts,matching_requests,matching_groups,ai_executions,ai_attempts,profile_head,profile_versions,source_ads,source_scopes CASCADE',
    )
    ad = randomUUID()
    revision = randomUUID()
    profile = randomUUID()
    const scope = randomUUID()
    await pool.query(
      "INSERT INTO source_scopes(id,source,fingerprint,parameters) VALUES($1,'solid',$2,'{}')",
      [scope, randomUUID()],
    )
    await pool.query(
      "INSERT INTO source_ads(id,source,external_id,last_seen_scope_id) VALUES($1,'solid',$2,$3)",
      [ad, randomUUID(), scope],
    )
    await pool.query(
      "INSERT INTO source_ad_revisions(id,source_ad_id,content_hash,payload) VALUES($1,$2,'test','{}')",
      [revision, ad],
    )
    await pool.query(
      'INSERT INTO profile_versions(id,number,data,command_id,draft_revision) VALUES($1,1,$2,$3,1)',
      [profile, emptyProfile(), randomUUID()],
    )
  })
  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })
  /** A request with an execution sent in the batch of the given group. */
  async function request(
    id: string,
    options: {
      group?: string | null
      oldGroup?: string
      payload?: unknown
      excluded?: boolean
    } = {},
  ) {
    await pool.query(
      `INSERT INTO matching_requests(id,ad_id,ad_revision_id,profile_version_id,input,configuration,state,group_id,request_payload)
       VALUES($1,$2,$3,$4,'{}','{}',$5,$6,$7)`,
      [
        id,
        ad,
        revision,
        profile,
        options.excluded ? 'excluded' : 'requested',
        options.oldGroup ?? null,
        options.payload ?? null,
      ],
    )
    if (options.excluded) return
    const execution = randomUUID()
    await pool.query(
      `INSERT INTO ai_executions(id,settings_key,operation_id,configuration,publication_token,state,mode,group_id)
       VALUES($1,'matching',$2,'{}',$3,'completed',$4,$5)`,
      [
        execution,
        id,
        randomUUID(),
        options.group === null ? 'single' : 'batch',
        options.group === null ? null : (options.group ?? id),
      ],
    )
    await pool.query(
      `INSERT INTO ai_attempts(id,import_id,text_revision,attempt,generation,operation_type,state,reserved_pln,actual_pln,configuration,execution_id)
       VALUES($1,NULL,0,1,$2,'execution','settled',0,0,'{}',$1)`,
      [execution, randomUUID()],
    )
  }
  const keep =
    (archiveId: string) => (kind: string, key: string, content: string) =>
      archiveArtifact(
        archiveId,
        kind as 'input' | 'output' | 'error' | 'metadata',
        key,
        content,
      )

  it('preserves exact content, deduplicates repeats and keeps changing metadata versions', async () => {
    const id = randomUUID()
    await request(id, { payload: { model: 'original' } })
    const archive = keep(id),
      input = ' { "input": "żółć" }\n\n'
    await Promise.all([
      archive('input', 'request', input),
      archive('input', 'request', input),
    ])
    await archive('metadata', 'batch_test', '{"status":"in_progress"}')
    await archive('metadata', 'batch_test', '{"status":"completed"}')
    await archive('output', 'file_output', 'malformed output\n')
    await archive('error', 'file_error', 'raw error\n')
    const result = await readBatchArchive(id)
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

  it('resolves all items of a batch to the same complete group archive', async () => {
    const group = randomUUID(),
      a = randomUUID(),
      b = randomUUID()
    await request(a, { group })
    await request(b, { group })
    await keep(group)('input', 'request', 'exact whole group\n')
    await keep(group)('output', 'file_output', 'all results\n')
    const first = await readBatchArchive(a),
      second = await readBatchArchive(b)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      operationId: group,
      reconstructedInput: null,
    })
    expect(first!.artifacts).toHaveLength(2)
    expect(await readBatchArchive(randomUUID())).toBeNull()
  })

  it('clearly marks reconstructed old inputs and never invents missing output (0mq.21 ASM-8)', async () => {
    const group = randomUUID(),
      a = randomUUID(),
      b = randomUUID(),
      single = randomUUID()
    const body = {
      model: 'test',
      instructions: 'safe saved payload',
      input: [],
    }
    // Requests sent before the archive kept inputs, in an old group and
    // as a single batch, linked to their back-filled executions.
    await pool.query(
      "INSERT INTO matching_groups(id,command_id,ad_ids,state,configuration) VALUES($1,$2,$3,'completed','{}')",
      [group, randomUUID(), [ad]],
    )
    await request(a, { group, oldGroup: group, payload: body })
    await request(b, { group, oldGroup: group, payload: body })
    await request(single, { payload: body })
    const result = await readBatchArchive(a)
    expect(result!.artifacts).toEqual([])
    expect(result!.reconstructedInput!.endsWith('\n')).toBe(true)
    expect(
      result!
        .reconstructedInput!.trim()
        .split('\n')
        .map((l) => JSON.parse(l)),
    ).toEqual(
      [a, b].sort().map((id) => ({
        custom_id: id,
        method: 'POST',
        url: '/v1/responses',
        body,
      })),
    )
    const one = await readBatchArchive(single)
    expect(one!.operationId).toBe(single)
    // Byte for byte the line the former batch path rebuilt from the saved
    // payload, in the key order PostgreSQL returns it.
    const saved = (
      await pool.query(
        'SELECT request_payload FROM matching_requests WHERE id=$1',
        [single],
      )
    ).rows[0].request_payload
    expect(one!.reconstructedInput).toBe(
      JSON.stringify({
        custom_id: single,
        method: 'POST',
        url: '/v1/responses',
        body: saved,
      }) + '\n',
    )
    expect(JSON.parse(one!.reconstructedInput!)).toEqual({
      custom_id: single,
      method: 'POST',
      url: '/v1/responses',
      body,
    })
    // A single execution that kept no artefacts and an excluded request
    // have an empty archive.
    const direct = randomUUID(),
      excluded = randomUUID()
    await request(direct, { group: null })
    await request(excluded, { excluded: true })
    for (const id of [direct, excluded])
      expect(await readBatchArchive(id)).toMatchObject({
        artifacts: [],
        reconstructedInput: null,
      })
  })
})
