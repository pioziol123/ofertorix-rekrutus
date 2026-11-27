import { pageCount, type PageSize } from '../../lib/paging.ts'
import {
  choiceStages,
  readApplicationsQuery,
  type StageChoice,
} from './domain/stage-choices.ts'
import type { Stage } from './domain/stages.ts'
import {
  countApplications,
  findApplicationsPage,
} from './infrastructure/persistence/applications.ts'

/** One page of Moja lista, with the query as the read normalised it. */
export type ApplicationsPage = {
  items: { offerId: string; stage: Stage; stageChangedAt: Date }[]
  total: number
  page: number
  pages: number
  size: PageSize
  stage: StageChoice
}

/**
 * One page of the applications in the stages of a choice (T2-R03–R06),
 * from the most recent stage moment, with the ID breaking ties. Takes the
 * page's address as it came: values it cannot read give their defaults,
 * and a page beyond the last gives the last. Reads committed state.
 */
export async function readApplicationsPage(
  address: Record<string, unknown>,
): Promise<ApplicationsPage> {
  const query = readApplicationsQuery(address)
  const inStages = choiceStages(query.stage)
  const total = await countApplications(inStages)
  const pages = pageCount(total, query.size)
  const page = Math.min(query.page, pages)
  const items = await findApplicationsPage(inStages, {
    limit: query.size,
    offset: (page - 1) * query.size,
  })
  return { items, total, page, pages, size: query.size, stage: query.stage }
}
