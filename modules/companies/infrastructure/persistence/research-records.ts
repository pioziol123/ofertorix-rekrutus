import { db } from '../../../../lib/db.ts'
import type { ResearchReport } from '../../../../lib/companies/research-model.ts'

/**
 * Companies' records of research: the company it is about, the target
 * fixed at the request, the published report or the owner's message, and
 * the link to its AI execution. The stage and cost of the work live in AI.
 */

/** Locks a research for its outcome, until the transaction ends. */
export async function lockResearch(researchId: string) {
  const row = (
    await db().query(
      'SELECT id,result FROM company_research WHERE id=$1 FOR UPDATE',
      [researchId],
    )
  ).rows[0]
  return row
    ? { id: row.id as string, published: row.result !== null }
    : null
}

/** Saves the report Companies published, or the owner's message. */
export async function saveResearchOutcome(
  researchId: string,
  outcome: { report: ResearchReport | null; error: string | null },
) {
  await db().query(
    'UPDATE company_research SET result=$2,error=$3,finished_at=now() WHERE id=$1',
    [researchId, outcome.report, outcome.error],
  )
}

/** Saves a requested research with its target, linked to its AI work. */
export async function insertResearch(research: {
  id: string
  companyId: string
  target: unknown
}) {
  await db().query(
    "INSERT INTO company_research(id,company_id,target,configuration,state) VALUES($1,$2,$3,'{}','requested')",
    [research.id, research.companyId, research.target],
  )
}

export async function linkResearchExecution(
  researchId: string,
  executionId: string,
) {
  await db().query('UPDATE company_research SET execution_id=$2 WHERE id=$1', [
    researchId,
    executionId,
  ])
}

/** Every research of a company, newest first. */
export async function companyResearchRows(companyId: string) {
  return (
    await db().query(
      'SELECT * FROM company_research WHERE company_id=$1 ORDER BY created_at DESC,id DESC',
      [companyId],
    )
  ).rows
}
