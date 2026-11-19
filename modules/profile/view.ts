/**
 * Public entry of the Profile module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export {
  emptyExperience,
  emptyProfile,
  emptySkill,
  expectationKeys,
  type ProfileData,
  type Proposal,
} from './domain/profile-data.ts'
