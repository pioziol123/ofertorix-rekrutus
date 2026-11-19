import { z } from 'zod'
import { CompanyNotFound } from './errors.ts'
import type {
  ResearchReport,
  ResearchTarget,
} from './domain/research-report.ts'
import {
  interruptedMessage,
  researchCostState,
  researchViewState,
} from './domain/research-outcome.ts'
import {
  readResearchExecutions,
  researchReservation,
} from './infrastructure/adapters/research-ai.ts'
import {
  companyResearchRows,
  readResearchTarget,
} from './infrastructure/persistence/research-records.ts'

/**
 * The research of a company, newest first, for its page: each research
 * with its target, report or message, and the state and cost of its AI
 * work read from AI; whether research can be requested now and the most
 * one reserves. ASSUMPTION(oferty-pracy-0mq.22/ASM-2): the states, costs
 * and messages the owner sees.
 */
export async function readCompanyResearch(companyId: string) {
  if (
    !z.uuid().safeParse(companyId).success ||
    !(await readResearchTarget(companyId))
  )
    throw new CompanyNotFound()
  const rows = await companyResearchRows(companyId)
  const executions = await readResearchExecutions(rows.map((r) => r.id))
  const ceiling = researchReservation()
  return {
    configured: ceiling !== null,
    ceiling,
    operations: rows.map((r) => {
      const execution = executions.get(String(r.id))
      const state = execution ? researchViewState(execution) : 'failed'
      const costState = execution ? researchCostState(execution) : null
      return {
        id: String(r.id),
        state,
        target: r.target as ResearchTarget,
        report: r.result as ResearchReport | null,
        error:
          (r.error as string | null) ??
          (execution?.state === 'retried' ? interruptedMessage : null),
        createdAt: new Date(r.created_at).toISOString(),
        finishedAt: r.finished_at
          ? new Date(r.finished_at).toISOString()
          : null,
        reserved:
          costState === null ? null : (execution?.cost.reserved ?? null),
        cost: execution?.cost.actual ?? null,
        costState,
      }
    }),
  }
}
