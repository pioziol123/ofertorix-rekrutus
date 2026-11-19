/**
 * Public operations of the Companies module (information about companies
 * and their roles in recruitments). Routes, the worker and other modules use
 * only these; views use `view.ts`.
 */
export { createCompany, changeCompanyLink } from './company-commands.ts'
export { listCompanies, offerCompanies, readCompany } from './read-companies.ts'
export { CompanyConflict, CompanyNotFound } from './errors.ts'
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
