import {
  defaultPageSize,
  readPage,
  readPageSize,
  type PageSize,
} from '../../../lib/paging.ts'
import { stageLabels, stages, type Stage } from './stages.ts'

/**
 * The stage switch of Moja lista and the page's address (T2-R03, T2-R06):
 * which stages each choice lists, and how the address is read and built.
 * Pure, so the server's read and the page share it.
 */

/** The choices of the stage switch, in the order the page offers them. */
export const stageChoices = [
  'active',
  'all',
  'to_consider',
  'cv_sent',
  'rejected',
] as const
export type StageChoice = (typeof stageChoices)[number]
export const defaultStageChoice: StageChoice = 'active'

/** The labels of the stage switch (T2-R03); single stages use A-R02. */
export const stageChoiceLabels: Record<StageChoice, string> = {
  active: 'Aktywne',
  all: 'Wszystkie',
  to_consider: stageLabels.to_consider,
  cv_sent: stageLabels.cv_sent,
  rejected: stageLabels.rejected,
}

/**
 * The stages a choice lists (T2-R03): "Aktywne" is "Do rozważenia" and
 * "CV wysłane", "Wszystkie" every stage but "Zdjęta z listy", which no
 * choice lists.
 */
export function choiceStages(choice: StageChoice): Stage[] {
  if (choice === 'active') return ['to_consider', 'cv_sent']
  if (choice === 'all') return stages.filter((stage) => stage !== 'removed')
  return [choice]
}

/** What the address of Moja lista holds besides the open application. */
export type ApplicationsQuery = {
  stage: StageChoice
  page: number
  size: PageSize
}

/** The single text value of an address key, or null. */
const single = (raw: unknown): string | null =>
  typeof raw === 'string' ? raw : null

/**
 * Reads the query from the page's address (T2-R06): an unknown stage choice
 * or number per page gives its default, an unreadable page or one below 1
 * gives 1. The page beyond the last is left to the read, which knows the
 * total.
 */
export function readApplicationsQuery(
  address: Record<string, unknown>,
): ApplicationsQuery {
  const stage = single(address.stage)
  return {
    stage: (stageChoices as readonly (string | null)[]).includes(stage)
      ? (stage as StageChoice)
      : defaultStageChoice,
    page: readPage(single(address.page)),
    size: readPageSize(single(address.size)),
  }
}

/**
 * The page's address for the query and the open application (T2-R06):
 * keys equal to their default are left out.
 */
export function applicationsAddress(
  query: ApplicationsQuery,
  offer: string | null = null,
): Record<string, string> {
  const address: Record<string, string> = {}
  if (query.stage !== defaultStageChoice) address.stage = query.stage
  if (query.page > 1) address.page = String(query.page)
  if (query.size !== defaultPageSize) address.size = String(query.size)
  if (offer) address.offer = offer
  return address
}

/** The query after the stage choice changed: back to page 1 (T2-R03). */
export const changeStageChoice = (
  query: ApplicationsQuery,
  stage: StageChoice,
): ApplicationsQuery =>
  stage === query.stage ? query : { ...query, stage, page: 1 }
