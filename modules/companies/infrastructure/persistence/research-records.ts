import { db } from '../../../../lib/db.ts'
import type {
  ResearchReport,
  ResearchTarget,
} from '../../domain/research-report.ts'

/**
 * Companies' records of research: the company it is about, the target
 * fixed at the request, the published report or the owner's message, and
 * the identifier of its AI assignment, or, for research of the old way, the
 * link to its AI execution.
 */

/** Locks a research for its outcome, until the transaction ends. */
export async function lockResearch(researchId: string) {
  const row = (
    await db().query(
      'SELECT id,result FROM company_research WHERE id=$1 FOR UPDATE',
      [researchId],
    )
  ).rows[0]
  return row ? { id: row.id as string, published: row.result !== null } : null
}

/**
 * Locks the research of an assignment for its end, until the transaction
 * ends; null when no research keeps the assignment. A research has ended
 * once Companies saved its outcome.
 */
export async function lockAssignmentResearch(assignmentId: string) {
  const row = (
    await db().query(
      'SELECT id,finished_at FROM company_research WHERE assignment_id=$1 FOR UPDATE',
      [assignmentId],
    )
  ).rows[0]
  return row ? { id: row.id as string, ended: row.finished_at !== null } : null
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

/**
 * Saves a requested research with its target and the identifier of the
 * assignment placed for it (T9-R01); its state keeps only Companies'
 * meaning, and its configuration, a read-only history of the price list
 * research had before AI kept its settings, is empty.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-1)
 */
export async function insertResearch(research: {
  id: string
  companyId: string
  target: unknown
  assignmentId: string
}) {
  await db().query(
    "INSERT INTO company_research(id,company_id,target,configuration,state,assignment_id) VALUES($1,$2,$3,'{}','requested',$4)",
    [research.id, research.companyId, research.target, research.assignmentId],
  )
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

/** The answer a research command got, or null for a new command. */
export type ResearchReceipt = {
  fingerprint: string
  result: { id: string; reused: boolean }
}

/**
 * Takes the turn of a research command until the transaction ends, and
 * reads the answer it got if it was sent before; null for a new command.
 */
export async function lockResearchCommand(
  commandId: string,
): Promise<ResearchReceipt | null> {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `research-command-${commandId}`,
  ])
  const row = (
    await db().query(
      'SELECT fingerprint,result FROM company_research_commands WHERE id=$1',
      [commandId],
    )
  ).rows[0]
  return row
    ? {
        fingerprint: row.fingerprint as string,
        result: row.result as ResearchReceipt['result'],
      }
    : null
}

/** Saves the answer a research command got. */
export async function saveResearchReceipt(
  commandId: string,
  receipt: ResearchReceipt,
) {
  await db().query(
    'INSERT INTO company_research_commands(id,fingerprint,result) VALUES($1,$2,$3)',
    [commandId, receipt.fingerprint, receipt.result],
  )
}

/**
 * Takes the research turn of a company until the transaction ends, so its
 * requests are decided one at a time. ASSUMPTION(oferty-pracy-0mq.22/ASM-1)
 */
export async function lockCompanyResearch(companyId: string) {
  await db().query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    `company-research-${companyId}`,
  ])
}

/** What research of a company is about now; null for an unknown company. */
export async function readResearchTarget(
  companyId: string,
): Promise<ResearchTarget | null> {
  const row = (
    await db().query(
      'SELECT name,kind,website,description FROM companies WHERE id=$1',
      [companyId],
    )
  ).rows[0]
  return row ? (row as ResearchTarget) : null
}
