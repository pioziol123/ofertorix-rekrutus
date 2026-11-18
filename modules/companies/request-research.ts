import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { transaction } from '../../lib/db.ts'
import { CompanyConflict, CompanyNotFound } from '../../lib/companies/store.ts'
import { researchCommand } from '../../lib/companies/research-model.ts'
import {
  checkResearchExecution,
  isRefusal,
  readResearchExecutions,
  requestResearchExecution,
} from './infrastructure/adapters/research-ai.ts'
import {
  companyResearchRows,
  insertResearch,
  linkResearchExecution,
  lockCompanyResearch,
  lockResearchCommand,
  readResearchTarget,
  saveResearchReceipt,
} from './infrastructure/persistence/research-records.ts'

/** Research cannot be requested now: its AI settings are not configured. */
export class ResearchConfigurationError extends Error {}

const inProgress = ['waiting_budget', 'queued', 'running', 'delivering']

/**
 * Requests basic research of a company. The same command gives the same
 * answer and creates nothing more; a changed command under the same
 * identifier is a conflict. A research of the company still in progress
 * is reused, and so is its latest published report unless the command asks
 * for a refresh. Otherwise a new research with the company's current
 * target is requested from AI in the same transaction, reserving the
 * budget or waiting for it.
 */
export async function requestResearch(companyId: string, value: unknown) {
  if (!z.uuid().safeParse(companyId).success) throw new CompanyNotFound()
  companyId = companyId.toLowerCase()
  const command = researchCommand.parse(value)
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ companyId, ...command }))
    .digest('hex')
  // Outside the transaction, as AI requires; a reused research needs none.
  const check = await checkResearchExecution()
  return transaction(async () => {
    const receipt = await lockResearchCommand(command.commandId)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new CompanyConflict()
      return receipt.result
    }
    // One research in progress per company: requests of a company are
    // decided one at a time, from the stage of its research in AI.
    // ASSUMPTION(oferty-pracy-0mq.22/ASM-1)
    await lockCompanyResearch(companyId)
    const company = await readResearchTarget(companyId)
    if (!company) throw new CompanyNotFound()
    const researches = await companyResearchRows(companyId)
    const executions = await readResearchExecutions(
      researches.map((r) => String(r.id)),
    )
    const active = researches.find((r) =>
      inProgress.includes(executions.get(String(r.id))?.state ?? ''),
    )
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
      if (!check) throw new ResearchConfigurationError()
      const id = randomUUID()
      await insertResearch({ id, companyId, target: company })
      try {
        const requested = await requestResearchExecution(id, company, check)
        await linkResearchExecution(id, requested.executionId)
      } catch (error) {
        if (isRefusal(error)) throw new ResearchConfigurationError()
        throw error
      }
      result = { id, reused: false }
    }
    await saveResearchReceipt(command.commandId, { fingerprint, result })
    return result
  })
}
