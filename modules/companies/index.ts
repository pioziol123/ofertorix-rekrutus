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

// Composition: the receiver of the assignments of research, which the
// shared registration of receivers registers, and the receiver of research
// outcomes of the old way, which the AI module plugin registers until task
// oferty-pracy-sq2.11.
export {
  researchAssignmentReceiver,
  researchReceiver,
  researchSettingsKey,
} from './infrastructure/adapters/research-ai.ts'
