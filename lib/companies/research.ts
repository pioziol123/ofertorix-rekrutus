import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Pool } from 'pg'
import type { PgBoss } from 'pg-boss'
import type { AiConfiguration } from '../../modules/ai/index.ts'
import { reserve } from '../../modules/ai/index.ts'
import { db, queueDatabase, transaction } from '../db.ts'
import { requireQueued } from '../queue.ts'
import { CompanyConflict, CompanyNotFound } from './store.ts'
import { researchCommand, type ResearchReport } from './research-model.ts'
import {
  researchConfiguration,
  researchCeiling,
  searchFee,
  runResearch,
} from './research-provider.ts'
export const companyResearchQueue = 'company-research'
export class ResearchConfigurationError extends Error {}
const pending = ['waiting_budget', 'queued', 'running']
async function deliver(boss: PgBoss, id: string) {
  await requireQueued(
    boss.send(
      companyResearchQueue,
      { operationId: id },
      {
        db: queueDatabase,
        retryLimit: 0,
        expireInSeconds: 360,
      },
    ),
  )
}
async function fund(boss: PgBoss, id: string, configuration: AiConfiguration) {
  const client = db()
  const budget = await reserve(
    client,
    configuration,
    new Date(),
    searchFee(configuration),
  )
  if (!budget.enough) return
  const attemptId = randomUUID()
  await client.query(
    `INSERT INTO ai_attempts(id,import_id,text_revision,month,attempt,generation,operation_type,state,reserved_pln,configuration) VALUES($1,NULL,0,$2,1,$3,'research','queued',$4,$5)`,
    [attemptId, budget.month, id, budget.cost, configuration],
  )
  await client.query(
    "UPDATE company_research SET state='queued',attempt_id=$2 WHERE id=$1",
    [id, attemptId],
  )
  await deliver(boss, id)
}
export async function requestResearch(
  boss: PgBoss,
  companyId: string,
  value: unknown,
) {
  if (!z.uuid().safeParse(companyId).success) throw new CompanyNotFound()
  companyId = companyId.toLowerCase()
  const command = researchCommand.parse(value)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ companyId, ...command }))
    .digest('hex')
  return transaction(async () => {
    const client = db()
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `research-command-${command.commandId}`,
    ])
    const receipt = (
      await client.query(
        'SELECT * FROM company_research_commands WHERE id=$1',
        [command.commandId],
      )
    ).rows[0]
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new CompanyConflict()
      return receipt.result as { id: string; reused: boolean }
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `company-research-${companyId}`,
    ])
    const company = (
      await client.query(
        'SELECT name,kind,website,description FROM companies WHERE id=$1',
        [companyId],
      )
    ).rows[0]
    if (!company) throw new CompanyNotFound()
    const active = (
      await client.query(
        'SELECT id FROM company_research WHERE company_id=$1 AND state=ANY($2::text[])',
        [companyId, pending],
      )
    ).rows[0]
    const complete =
      !command.refresh &&
      (
        await client.query(
          "SELECT id FROM company_research WHERE company_id=$1 AND state='completed' ORDER BY finished_at DESC,id DESC LIMIT 1",
          [companyId],
        )
      ).rows[0]
    const previous = active || complete
    let result: { id: string; reused: boolean }
    if (previous) result = { id: previous.id, reused: true }
    else {
      const configuration = researchConfiguration()
      if (!configuration) throw new ResearchConfigurationError()
      const id = randomUUID()
      await client.query(
        "INSERT INTO company_research(id,company_id,target,configuration,state) VALUES($1,$2,$3,$4,'waiting_budget')",
        [id, companyId, company, configuration],
      )
      await fund(boss, id, configuration)
      result = { id, reused: false }
    }
    await client.query(
      'INSERT INTO company_research_commands(id,fingerprint,result) VALUES($1,$2,$3)',
      [command.commandId, fingerprint, result],
    )
    return result
  })
}
export async function executeCompanyResearch(
  pool: Pool,
  _boss: PgBoss,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  // ASSUMPTION(oferty-pracy-0mq.18/ASM-1): the session lock stays on its own
  // connection, so recovery can still tell running research from research
  // interrupted by a stopped worker; the writes go through the shared
  // transactional operation on other pooled connections.
  const client = await pool.connect()
  const lockName = `research-operation-${id}`
  try {
    const lock = (
      await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [lockName],
      )
    ).rows[0].locked
    if (!lock) return
    try {
      const row = await transaction(async () => {
        const r = (
          await db().query(
            "UPDATE company_research SET state='running' WHERE id=$1 AND state='queued' RETURNING *",
            [id],
          )
        ).rows[0]
        if (r)
          await db().query(
            "UPDATE ai_attempts SET state='running' WHERE id=$1",
            [r.attempt_id],
          )
        return r
      })
      if (!row) return
      const result = await runResearch(row.target, row.configuration, fetcher)
      await transaction(async () => {
        await db().query(
          'UPDATE company_research SET state=$2,result=$3,error=$4,finished_at=now() WHERE id=$1',
          [
            id,
            result.report
              ? 'completed'
              : result.cost === null
                ? 'unknown'
                : 'failed',
            result.report,
            result.error,
          ],
        )
        await db().query(
          'UPDATE ai_attempts SET state=$2,actual_pln=$3,usage=$4,response_id=$5,error=$6,finished_at=now() WHERE id=$1',
          [
            row.attempt_id,
            result.cost === null ? 'unknown' : 'settled',
            result.cost,
            result.usage,
            result.responseIds.join(','),
            result.error,
          ],
        )
      })
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName])
    }
  } finally {
    client.release()
  }
}
export async function recoverCompanyResearch(pool: Pool, boss: PgBoss) {
  const rows = (
    await pool.query(
      'SELECT id FROM company_research WHERE state=ANY($1::text[]) ORDER BY created_at',
      [pending],
    )
  ).rows
  for (const row of rows) {
    // ASSUMPTION(oferty-pracy-0mq.18/ASM-1): running research whose session
    // lock is free was interrupted; see executeCompanyResearch.
    const client = await pool.connect(),
      lockName = `research-operation-${row.id}`
    try {
      if (
        !(
          await client.query(
            'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
            [lockName],
          )
        ).rows[0].locked
      )
        continue
      try {
        await transaction(async () => {
          const current = (
            await db().query(
              'SELECT * FROM company_research WHERE id=$1 FOR UPDATE',
              [row.id],
            )
          ).rows[0]
          if (current.state === 'running') {
            const error =
              'Przerwano research. Koszt pozostaje zarezerwowany; ponowienie wymaga nowego żądania.'
            await db().query(
              "UPDATE company_research SET state='unknown',error=$2,finished_at=now() WHERE id=$1",
              [row.id, error],
            )
            await db().query(
              "UPDATE ai_attempts SET state='unknown',error=$2,finished_at=now() WHERE id=$1",
              [current.attempt_id, error],
            )
          } else if (current.state === 'waiting_budget')
            await fund(boss, row.id, current.configuration)
          else if (current.state === 'queued') await deliver(boss, row.id)
        })
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          lockName,
        ])
      }
    } finally {
      client.release()
    }
  }
}
export async function readCompanyResearch(pool: Pool, id: string) {
  if (
    !z.uuid().safeParse(id).success ||
    !(await pool.query('SELECT id FROM companies WHERE id=$1', [id])).rowCount
  )
    throw new CompanyNotFound()
  const rows = (
    await pool.query(
      'SELECT r.*,a.reserved_pln,a.actual_pln,a.state AS cost_state FROM company_research r LEFT JOIN ai_attempts a ON a.id=r.attempt_id WHERE company_id=$1 ORDER BY r.created_at DESC,r.id DESC',
      [id],
    )
  ).rows
  const configuration = researchConfiguration()
  return {
    configured: !!configuration,
    ceiling: configuration ? researchCeiling(configuration) : null,
    operations: rows.map((r) => ({
      id: String(r.id),
      state: String(r.state),
      target: r.target as {
        name: string
        kind: string
        website: string | null
        description: string
      },
      report: r.result as ResearchReport | null,
      error: r.error as string | null,
      createdAt: new Date(r.created_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      reserved: r.reserved_pln as string | null,
      cost: r.actual_pln as string | null,
      costState: r.cost_state as string | null,
    })),
  }
}
