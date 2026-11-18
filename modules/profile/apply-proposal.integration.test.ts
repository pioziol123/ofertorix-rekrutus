import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, setPool } from '../../lib/db.ts'
import {
  applyProposal,
  ProfileConflict,
  ProposalNotFound,
  readProfile,
  readVersionRecord,
  confirmProfile,
  saveDraft,
} from './index.ts'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

integration('profile operations for the routes in isolated PostgreSQL', () => {
  const schema = `profile_apply_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool

  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.DATABASE_URL })
    await admin.query(`CREATE SCHEMA ${schema}`)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    })
    const sql: string[] = []
    createRequire(import.meta.url)(
      '../../migrations/1770000000004_profiles.cjs',
    ).up({ sql: (s: string) => sql.push(s) })
    await pool.query(sql.join('\n'))
    setPool(pool)
  }, 30_000)

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE profile_import_texts,profile_imports,profile_drafts,profile_head,profile_versions CASCADE',
    )
    await pool.query('INSERT INTO profile_head(singleton) VALUES(true)')
  })

  afterAll(async () => {
    await closePool()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.end()
    }
  })

  const text = 'PHP backend\nSenior Developer at Acme'
  const proposal = {
    summary: 'Backend developer',
    skills: [{ name: 'PHP', description: 'Backend', evidence: 'PHP backend' }],
    experience: [
      {
        role: 'Senior Developer',
        company: 'Acme',
        start: null,
        end: null,
        ongoing: false,
        description: '',
        technologies: ['PHP'],
        evidence: 'Senior Developer at Acme',
      },
    ],
  }

  /** An import whose preparation for text revision 2 ended with a proposal. */
  async function importWithProposal(revision = 2) {
    const id = randomUUID()
    await pool.query(
      `INSERT INTO profile_imports(id,kind,status,source_text,sha256,professional_text,text_revision,proposal)
       VALUES($1,'text','proposal',$2,'hash',$2,$3,$4)`,
      [id, text, revision, proposal],
    )
    for (let r = 1; r <= revision; r++)
      await pool.query(
        'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,$2,$3)',
        [id, r, r === revision ? text : 'older text'],
      )
    return id
  }

  const choice = (importId: string, expectedRevision = 0) => ({
    importId,
    expectedRevision,
    skills: [0],
    experience: [0],
    summary: true,
  })

  async function draftRows() {
    return (await pool.query('SELECT * FROM profile_drafts')).rows
  }

  it('A11-AC01: saves the chosen items as the next draft revision and returns the stored draft', async () => {
    const importId = await importWithProposal()
    const draft = await applyProposal(choice(importId))
    expect(draft).toMatchObject({ singleton: true, revision: 1 })
    expect(Object.keys(draft).sort()).toEqual(
      ['base_version_id', 'data', 'revision', 'singleton', 'updated_at'].sort(),
    )
    const data = draft.data as {
      summary: string
      sources: string[]
      skills: { name: string; source: unknown }[]
      experience: { role: string }[]
    }
    expect(data.summary).toBe('Backend developer')
    expect(data.sources).toEqual([importId])
    expect(data.skills[0]).toMatchObject({ name: 'PHP' })
    expect(data.experience[0]).toMatchObject({ role: 'Senior Developer' })
    expect((await readProfile()).draft.revision).toBe(1)
    expect((await readProfile()).active).toBeNull()
  })

  it('ASSUMPTION(oferty-pracy-0mq.11/ASM-1): ties the applied facts to the text revision the proposal was prepared for', async () => {
    const importId = await importWithProposal(2)
    const draft = await applyProposal(choice(importId))
    const data = draft.data as {
      skills: { source: { textRevision: number; evidence: string } }[]
    }
    expect(data.skills[0]!.source).toEqual({
      importId,
      textRevision: 2,
      evidence: 'PHP backend',
    })
    // A new text revision clears the proposal: nothing is left to apply.
    await pool.query(
      "UPDATE profile_imports SET text_revision=3,proposal=NULL,status='ready' WHERE id=$1",
      [importId],
    )
    await expect(applyProposal(choice(importId, 1))).rejects.toBeInstanceOf(
      ProposalNotFound,
    )
  })

  it('A11-AC01: a changed draft is a conflict without a write', async () => {
    const importId = await importWithProposal()
    await saveDraft((await readProfile()).draft.data, 0)
    await expect(applyProposal(choice(importId, 0))).rejects.toBeInstanceOf(
      ProfileConflict,
    )
    expect((await draftRows())[0].revision).toBe(1)
    expect((await draftRows())[0].data.skills).toEqual([])
  })

  it('A11-AC01: a missing proposal comes before a draft conflict, and an invalid choice writes nothing', async () => {
    await expect(applyProposal(choice(randomUUID(), 5))).rejects.toBeInstanceOf(
      ProposalNotFound,
    )
    const importId = await importWithProposal()
    await expect(
      applyProposal({ ...choice(importId), skills: [3] }),
    ).rejects.toThrow('Invalid selected skill')
    await expect(
      applyProposal({ ...choice(importId), skillTargets: { 0: randomUUID() } }),
    ).rejects.toThrow('Missing target skill')
    expect(await draftRows()).toEqual([])
  })

  it('A11-AC01: replaces the draft item the owner points at', async () => {
    const importId = await importWithProposal()
    const first = await applyProposal(choice(importId))
    const target = (first.data as { skills: { id: string }[] }).skills[0]!.id
    const second = await applyProposal({
      ...choice(importId, 1),
      experience: [],
      summary: false,
      skillTargets: { 0: target },
    })
    const skills = (second.data as { skills: { id: string }[] }).skills
    expect(skills).toHaveLength(1)
    expect(skills[0]!.id).toBe(target)
  })

  it('ASSUMPTION(oferty-pracy-0mq.11/ASM-3): reads the profile and a confirmed version with every stored field', async () => {
    const draft = await saveDraft((await readProfile()).draft.data, 0)
    const commandId = randomUUID()
    const version = await confirmProfile(draft.revision, null, commandId)
    const read = await readVersionRecord(version.id)
    expect(read).toEqual(version)
    expect(read).toMatchObject({
      number: 1,
      command_id: commandId,
      draft_revision: 1,
      previous_version_id: null,
    })
    expect(await readVersionRecord(randomUUID())).toBeNull()
    const profile = await readProfile()
    expect(profile.active).toEqual(version)
    expect(profile.versions).toEqual([
      { id: version.id, number: 1, created_at: version.created_at },
    ])
    expect(Object.keys(profile.draft).sort()).toEqual(
      ['base_version_id', 'data', 'revision', 'singleton', 'updated_at'].sort(),
    )
  })
})
