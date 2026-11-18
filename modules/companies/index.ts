/**
 * Public operations of the Companies module (information about companies
 * and their roles in recruitments). The module is still moving here from
 * lib/companies (task oferty-pracy-0mq.12); this entry point holds what
 * other parts already use from the new place: company research, which
 * task oferty-pracy-0mq.22 moved to the AI contract.
 */
export {
  requestResearch,
  ResearchConfigurationError,
} from './request-research.ts'
export { readCompanyResearch } from './read-research.ts'

// Composition: where the worker registers the receiver of research
// outcomes.
export {
  researchReceiver,
  researchSettingsKey,
} from './infrastructure/adapters/research-ai.ts'
