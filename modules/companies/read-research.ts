import { z } from 'zod'
import { CompanyNotFound } from './errors.ts'
import type {
  ResearchReport,
  ResearchTarget,
} from './domain/research-report.ts'
import { failedAssignmentMessage } from './domain/research-outcome.ts'
import { researchState, shownResearch } from './domain/research-view.ts'
import { researchConfigured } from './infrastructure/adapters/research-ai.ts'
import {
  companyResearchRows,
  readResearchTarget,
} from './infrastructure/persistence/research-records.ts'

/**
 * The research of a company, newest first, for its page: each research
 * with its target, report or message and its state from Companies' own
 * data, with no amount (T9-R03), and whether research can be requested
 * now. Research made before the deployment of assignments shows only what
 * Companies stored itself (T10-R08).
 * ASSUMPTION(oferty-pracy-sq2.10/ASM-2): the view shows no amount at all,
 * the most one research reserves included.
 */
export async function readCompanyResearch(companyId: string) {
  if (
    !z.uuid().safeParse(companyId).success ||
    !(await readResearchTarget(companyId))
  )
    throw new CompanyNotFound()
  const rows = await companyResearchRows(companyId)
  return {
    configured: researchConfigured(),
    operations: rows
      .filter((r) =>
        shownResearch(
          {
            assignment: r.assignment_id !== null,
            report: r.result !== null,
            message: r.error as string | null,
          },
          failedAssignmentMessage,
        ),
      )
      .map((r) => ({
        id: String(r.id),
        target: r.target as ResearchTarget,
        report: r.result as ResearchReport | null,
        state: researchState({
          report: r.result !== null,
          message: r.error !== null,
        }),
        error: r.error as string | null,
        createdAt: new Date(r.created_at).toISOString(),
        finishedAt: r.finished_at
          ? new Date(r.finished_at).toISOString()
          : null,
      })),
  }
}
