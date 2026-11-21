/**
 * The periodic process's pass (B6-R09): its steps run one after another,
 * and a step's error is logged with the step's name without stopping the
 * pass. The next pass starts a fixed time after the previous one ended, so
 * passes never overlap. Design: docs/specs/2ba-praca-w-tle/
 * solution-design.md#b6, Contract: periodic process.
 */

/** One step of a pass: a public operation of a module, by name. */
export type PeriodicStep = {
  name: string
  run: () => Promise<unknown>
}

/** Where a step's error goes; the process's error log by default. */
export type StepErrorLog = (message: string) => void

/** Runs every step once, in order; an error of one does not stop the rest. */
export async function runPass(
  steps: readonly PeriodicStep[],
  log: StepErrorLog = console.error,
): Promise<void> {
  for (const step of steps) {
    try {
      await step.run()
    } catch (error) {
      log(
        `Periodic step "${step.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export type PeriodicProcess = {
  /** Schedules no new pass and waits for the running one to end. */
  stop(): Promise<void>
}

/**
 * Runs a pass now and each next pass \`intervalMs\` after the previous one
 * ended, with \`setTimeout\`.
 */
export function startPasses(
  steps: readonly PeriodicStep[],
  options: { intervalMs?: number; log?: StepErrorLog } = {},
): PeriodicProcess {
  const intervalMs = options.intervalMs ?? 60_000
  let stopping = false
  let timer: NodeJS.Timeout | undefined
  let running: Promise<void> = Promise.resolve()
  const pass = () => {
    timer = undefined
    running = runPass(steps, options.log).then(() => {
      if (!stopping) timer = setTimeout(pass, intervalMs)
    })
  }
  pass()
  return {
    async stop() {
      stopping = true
      if (timer) clearTimeout(timer)
      await running
    },
  }
}

/**
 * What the process does with an error the queue reports: while the process
 * starts, the error ends it (`fatal`); once it has started, the error is
 * logged and the passes go on, so a short outage of the database costs only
 * the steps that fail meanwhile. Contract: periodic process ('An error
 * starting the process … ends it with exit code 1'; 'A step's error is
 * logged … and does not stop the pass or the process').
 */
export function queueErrorHandling(
  fatal: (message: string) => void,
  log: StepErrorLog = console.error,
) {
  let started = false
  return {
    listener(error: Error) {
      if (started) log(`Queue unavailable: ${error.message}`)
      else fatal(`the queue reported an error: ${error.message}`)
    },
    /** The process has started; later errors are logged. */
    started() {
      started = true
    },
  }
}
