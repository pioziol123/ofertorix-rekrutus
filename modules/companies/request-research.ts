import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { AssignmentError } from '../ai/index.ts'
import { transaction } from '../../lib/db.ts'
import { CompanyConflict, CompanyNotFound } from './errors.ts'
import { researchCommand } from './domain/research-report.ts'
import {
  placeResearchAssignment,
  researchConfigured,
} from './infrastructure/adapters/research-ai.ts'
import {
  companyResearchRows,
  insertResearch,
  lockCompanyResearch,
  lockResearchCommand,
  readResearchTarget,
  saveResearchReceipt,
} from './infrastructure/persistence/research-records.ts'

/** Research cannot be requested now: its AI settings are not configured. */
export class ResearchConfigurationError extends Error {}

/**
 * Whether a research is still in progress, from Companies' own data alone:
 * until an outcome is saved (T9-R04, T9-AC05).
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-1): also for research of the old way,
 * which has no assignment; one whose old work had not ended at the
 * deployment of assignments is ended by the migration step (T10-R02).
 */
const inProgress = (research: Record<string, unknown>) =>
  research.finished_at === null

/**
 * Requests basic research of a company. The same command gives the same
 * answer and creates nothing more; a changed command under the same
 * identifier is a conflict. A research of the company still in progress
 * is reused, and so is its latest published report unless the command asks
 * for a refresh. Otherwise a new research with the company's current
 * target is saved with the agent assignment placed for it, in one
 * transaction (T9-R01): a refused assignment leaves neither.
 */
export async function requestResearch(companyId: string, value: unknown) {
  if (!z.uuid().safeParse(companyId).success) throw new CompanyNotFound()
  companyId = companyId.toLowerCase()
  const command = researchCommand.parse(value)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ companyId, ...command }))
    .digest('hex')
  // No provider is called; a reused research needs no configuration.
  const configured = researchConfigured()
  return transaction(async () => {
    const receipt = await lockResearchCommand(command.commandId)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new CompanyConflict()
      return receipt.result
    }
    // One research in progress per company (T9-R04): requests of a company
    // are decided one at a time, from Companies' own records of research.
    // ASSUMPTION(oferty-pracy-0mq.22/ASM-1)
    await lockCompanyResearch(companyId)
    const company = await readResearchTarget(companyId)
    if (!company) throw new CompanyNotFound()
    const researches = await companyResearchRows(companyId)
    const active = researches.find(inProgress)
    const complete = command.refresh
      ? undefined
      : researches
          .filter((r) => r.result !== null)
          .sort(
            (a, b) =>
              new Date(b.finished_at).getTime() -
                new Date(a.finished_at).getTime() ||
              String(b.id).localeCompare(String(a.id)),
          )[0]
    const previous = active ?? complete
    let result: { id: string; reused: boolean }
    if (previous) result = { id: String(previous.id), reused: true }
    else {
      if (!configured) throw new ResearchConfigurationError()
      const id = randomUUID()
      let assignmentId: string
      try {
        assignmentId = await placeResearchAssignment(company)
      } catch (error) {
        if (error instanceof AssignmentError)
          throw new ResearchConfigurationError()
        throw error
      }
      await insertResearch({ id, companyId, target: company, assignmentId })
      result = { id, reused: false }
    }
    await saveResearchReceipt(command.commandId, { fingerprint, result })
    return result
  })
}
