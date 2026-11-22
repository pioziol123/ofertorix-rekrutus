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
import { assignedResearchState } from './domain/research-view.ts'
import {
  readResearchExecutions,
  researchConfigured,
} from './infrastructure/adapters/research-ai.ts'
import {
  companyResearchRows,
  readResearchTarget,
} from './infrastructure/persistence/research-records.ts'

/**
 * The research of a company, newest first, for its page: each research
 * with its target, report or message and its state, and whether research
 * can be requested now. Research with an assignment shows its state from
 * Companies' own data and no amount (T9-R03).
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-2): the view shows no amount at all,
 * the most one research reserves included.
 * Research of the old way keeps the state and cost of its AI work read
 * from AI until task oferty-pracy-sq2.11.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-2): the states, costs and messages the
 * owner sees of research of the old way.
 */
export async function readCompanyResearch(companyId: string) {
  if (
    !z.uuid().safeParse(companyId).success ||
    !(await readResearchTarget(companyId))
  )
    throw new CompanyNotFound()
  const rows = await companyResearchRows(companyId)
  const executions = await readResearchExecutions(
    rows.filter((r) => !r.assignment_id).map((r) => String(r.id)),
  )
  return {
    configured: researchConfigured(),
    operations: rows.map((r) => {
      const common = {
        id: String(r.id),
        target: r.target as ResearchTarget,
        report: r.result as ResearchReport | null,
        createdAt: new Date(r.created_at).toISOString(),
        finishedAt: r.finished_at
          ? new Date(r.finished_at).toISOString()
          : null,
      }
      if (r.assignment_id)
        return {
          ...common,
          state: assignedResearchState({
            report: r.result !== null,
            message: r.error !== null,
          }),
          error: r.error as string | null,
          reserved: null,
          cost: null,
          costState: null,
        }
      const execution = executions.get(String(r.id))
      const costState = execution ? researchCostState(execution) : null
      return {
        ...common,
        state: execution ? researchViewState(execution) : 'failed',
        error:
          (r.error as string | null) ??
          (execution?.state === 'retried' ? interruptedMessage : null),
        reserved:
          costState === null ? null : (execution?.cost.reserved ?? null),
        cost: execution?.cost.actual ?? null,
        costState,
      }
    }),
  }
}
