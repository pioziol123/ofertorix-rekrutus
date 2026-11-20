/** Messages between the worker and a process of its pool. */

/** Worker → process: carry out one job. */
export type RunMessage = {
  type: 'run'
  definition: string
  failureCopy: boolean
  data: object
}

/** Process → worker. */
export type ProcessMessage =
  /** The module plugins ran; the process takes jobs. */
  | { type: 'ready' }
  /** A module plugin failed; the process exits. */
  | { type: 'plugin-failed'; module?: string; message: string }
  /** The job still runs; sent every `reportIntervalMs`. */
  | { type: 'alive' }
  | { type: 'done' }
  | { type: 'failed'; message: string }

/** How often a process reports while a job runs (B1-D08). */
export const reportIntervalMs = 5_000
