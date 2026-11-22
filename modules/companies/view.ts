/**
 * Public entry of the Companies module for views. Views run in the browser,
 * so this entry reaches no server code: no database, queue or Node
 * built-ins. Server code uses `index.ts`.
 */
export {
  companyKindLabels,
  companyRoleLabels,
  companyRoles,
  type CompanyRole,
} from './domain/company.ts'
export {
  hasSourcedFindings,
  researchKindLabels,
  researchScopeLabels,
  researchTopicLabels,
  researchTopics,
} from './domain/research-report.ts'
export {
  researchActiveStates,
  researchStateLabels,
  type ResearchViewState,
} from './domain/research-view.ts'
