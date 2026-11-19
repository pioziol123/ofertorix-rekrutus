/**
 * Public entry of the Sources module for views. Views run in the browser, so
 * this entry reaches no server code: no database, queue or Node built-ins.
 * Server code uses `index.ts`.
 */
export type { PolishSource } from './domain/polish-catalog.ts'
export {
  remoteEligibilityLabel,
  type RemoteEligibility,
} from './domain/remote-eligibility.ts'
