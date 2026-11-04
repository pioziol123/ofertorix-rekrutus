import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { emptyProfile, profileSchema, type ProfileData } from './model.ts'
export class ProfileConflict extends Error {}
export async function tx<T>(
  client: PoolClient,
  run: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const value = await run()
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
export async function readProfile(pool: Pool) {
  const [head, draft, versions] = await Promise.all([
    pool.query(
      'SELECT v.* FROM profile_head h JOIN profile_versions v ON v.id=h.active_version_id WHERE h.singleton',
    ),
    pool.query('SELECT * FROM profile_drafts WHERE singleton'),
    pool.query(
      'SELECT id,number,created_at FROM profile_versions ORDER BY number DESC',
    ),
  ])
  return {
    active: head.rows[0] ?? null,
    draft: draft.rows[0] ?? {
      revision: 0,
      base_version_id: head.rows[0]?.id ?? null,
      data: head.rows[0]?.data ?? emptyProfile(),
    },
    versions: versions.rows,
  }
}
async function validateSources(client: PoolClient, data: ProfileData) {
  const result = await client.query(
    'SELECT id FROM profile_imports WHERE id=ANY($1::uuid[])',
    [data.sources],
  )
  if (result.rowCount !== data.sources.length)
    throw new Error('Invalid import references')
  for (const fact of [...data.skills, ...data.experience]) {
    if (!fact.source) continue
    if (!data.sources.includes(fact.source.importId))
      throw new Error('Missing provenance import')
    const text = (
      await client.query(
        'SELECT text FROM profile_import_texts WHERE import_id=$1 AND revision=$2',
        [fact.source.importId, fact.source.textRevision],
      )
    ).rows[0]?.text
    if (!text || !text.includes(fact.source.evidence))
      throw new Error('Invalid provenance evidence')
  }
}
export async function saveDraft(
  pool: Pool,
  value: unknown,
  expectedRevision: number,
) {
  const data = profileSchema.parse(value),
    client = await pool.connect()
  try {
    return await tx(client, async () => {
      const head = await client.query(
        'SELECT * FROM profile_head WHERE singleton FOR UPDATE',
      )
      const current = await client.query(
        'SELECT revision FROM profile_drafts WHERE singleton',
      )
      if ((current.rows[0]?.revision ?? 0) !== expectedRevision)
        throw new ProfileConflict('Draft changed in another tab')
      await validateSources(client, data)
      return (
        await client.query(
          `INSERT INTO profile_drafts(singleton,revision,base_version_id,data) VALUES(true,$1,$2,$3)
   ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now() RETURNING *`,
          [expectedRevision + 1, head.rows[0].active_version_id, data],
        )
      ).rows[0]
    })
  } finally {
    client.release()
  }
}
export async function confirmProfile(
  pool: Pool,
  revision: number,
  activeId: string | null,
  commandId: string,
) {
  const client = await pool.connect()
  try {
    return await tx(client, async () => {
      const head = await client.query(
        'SELECT * FROM profile_head WHERE singleton FOR UPDATE',
      )
      const previous = await client.query(
        'SELECT * FROM profile_versions WHERE command_id=$1',
        [commandId],
      )
      if (previous.rows[0]) {
        if (
          previous.rows[0].draft_revision !== revision ||
          previous.rows[0].previous_version_id !== activeId
        )
          throw new ProfileConflict('Command already used with different input')
        return previous.rows[0]
      }
      const draft = (
        await client.query('SELECT * FROM profile_drafts WHERE singleton')
      ).rows[0]
      if (
        !draft ||
        draft.revision !== revision ||
        head.rows[0].active_version_id !== activeId ||
        draft.base_version_id !== activeId
      )
        throw new ProfileConflict('Profile changed; reload before confirming')
      const data = profileSchema.parse(draft.data)
      const version = (
        await client.query(
          `INSERT INTO profile_versions(id,number,data,command_id,draft_revision,previous_version_id)
   VALUES($1,(SELECT coalesce(max(number),0)+1 FROM profile_versions),$2,$3,$4,$5) RETURNING *`,
          [randomUUID(), data, commandId, revision, activeId],
        )
      ).rows[0]
      await client.query(
        'UPDATE profile_head SET active_version_id=$1 WHERE singleton',
        [version.id],
      )
      await client.query(
        'UPDATE profile_drafts SET base_version_id=$1,revision=revision+1,updated_at=now() WHERE singleton',
        [version.id],
      )
      return version
    })
  } finally {
    client.release()
  }
}
