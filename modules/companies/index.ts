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
// shared registration of receivers registers, and the end of research of
// the old way, which the migration step calls at the deployment of
// assignments (T10-R02).
export {
  researchAssignmentReceiver,
  researchSettingsKey,
} from './infrastructure/adapters/research-ai.ts'
export { failResearchOfOldWay } from './fail-research-of-old-way.ts'
