import { setTimeout as sleep } from 'node:timers/promises'
import { db } from '../db.ts'
import {
  onQueueError,
  openJobSource,
  readQueueConfiguration,
  stopQueues,
  type FailureReason,
  type JobSource,
  type TakenJob,
} from '../queues/index.ts'
import { PoolProcess, PoolStartError, type RunOutcome } from './pool.ts'
import { loadRegistry, ModulePluginError } from './registry.ts'

/** Liveness numbers (B1-D08, B1-R13, B1-R14). */
export const workerTimings = {
  /** A process that has not reported for this long is ended. */
  silenceMs: 15_000,
  /** The job heartbeat goes to the queue this often. */
  confirmIntervalMs: 10_000,
  /** A process whose attempt the queue has not confirmed for this long is ended. */
  unconfirmedMs: 25_000,
  /** How long a stop waits for running jobs. */
  stopGraceMs: 30_000,
  /** The worker's liveness record is written this often. */
  livenessIntervalMs: 10_000,
  /** Pause between fetches when no queue has a job. */
  idlePollMs: 1_000,
  /** How often the rules for ending a process are checked. */
  superviseIntervalMs: 500,
} as const

export const defaultPoolSize = 2

/**
 * The queues of the modules not yet moved to the libraries, carried out by
 * the existing worker path (B1-R17); the worker leaves them out (B1-D16).
 * Transitional (B1-D14): each module's task removes its queue from here.
 */
export const existingPathQueues = ['source-sync', 'ai-execution'] as const

export type WorkerOptions = {
  /** Path or URL of the plugins index that registers every module. */
  plugins: string
  /** `WORKER_POOL_SIZE` when not given, 2 when that is not set. */
  poolSize?: number
  /** Wraps the queue library's job source; tests use it to stub the queue. */
  jobSource?: (source: JobSource) => JobSource
}

export type Worker = {
  /** Stops taking jobs, waits for running ones, then ends the rest. */
  stop(): Promise<void>
}

/** The pool size from `WORKER_POOL_SIZE`; 2 when it is not set (B1-R07). */
export function poolSizeFromEnvironment(): number {
  const value = process.env.WORKER_POOL_SIZE
  if (value === undefined || value === '') return defaultPoolSize
  const size = Number(value)
  if (!Number.isInteger(size) || size < 1)
    throw new Error(`WORKER_POOL_SIZE must be an integer ≥ 1, not "${value}"`)
  return size
}

/** Ends the worker process with a message (B1-R14). */
export function fatal(message: string): never {
  console.error(`Worker failed: ${message}`)
  process.exit(1)
}

/**
 * Starts the worker loop: runs the module plugins, starts the pool, writes
 * the liveness record and takes jobs while a pool process is free. Any
 * failure to start ends the process with a message.
 */
export async function startWorker(options: WorkerOptions): Promise<Worker> {
  let poolSize = options.poolSize
  try {
    readQueueConfiguration()
    poolSize ??= poolSizeFromEnvironment()
  } catch (error) {
    fatal((error as Error).message)
  }
  const registry = await loadRegistry(options.plugins).catch((error: unknown) =>
    fatal(
      error instanceof ModulePluginError
        ? error.message
        : `the plugins index failed: ${(error as Error).message}`,
    ),
  )
  onQueueError((error) =>
    fatal(`the queue reported an error: ${error.message}`),
  )
  // Every queue in the database except those of the existing path, so a
  // job without a handler is taken, cancelled and logged (B1-D16, B1-R12).
  const opened = await openJobSource({ excluding: existingPathQueues }).catch(
    (error: Error) => fatal(`the queues could not be read: ${error.message}`),
  )
  const source = options.jobSource?.(opened) ?? opened

  const startProcess = () =>
    PoolProcess.start(options.plugins).catch((error: unknown) =>
      fatal(
        error instanceof PoolStartError && error.module
          ? error.message
          : `a pool process could not start: ${(error as Error).message}`,
      ),
    )
  const processes = await Promise.all(
    Array.from({ length: poolSize }, startProcess),
  )

  let stopping = false
  let wake: () => void = () => {}
  const running = new Map<PoolProcess, Run>()
  const reserved = new Set<PoolProcess>()
  const dispatches = new Set<Promise<void>>()

  const writeLiveness = () =>
    db()
      .query(
        `INSERT INTO service_heartbeats (service) VALUES ('worker')
         ON CONFLICT (service) DO UPDATE SET last_seen = now()`,
      )
      .then(
        () => {},
        (error: Error) =>
          fatal(`the liveness record cannot be written: ${error.message}`),
      )
  // The loop writes the record itself, so a loop that hangs stops renewing
  // it and the container restarts the worker (B1-D13). Every wait in the
  // loop is bounded, so an idle or full loop still writes it on time.
  let livenessWritten = Date.now()
  await writeLiveness()
  const renewLiveness = async () => {
    if (Date.now() - livenessWritten < workerTimings.livenessIntervalMs) return
    livenessWritten = Date.now()
    await writeLiveness()
  }
  const pause = () =>
    Promise.race([
      sleep(workerTimings.idlePollMs),
      new Promise<void>((resolve) => {
        wake = resolve
      }),
    ])

  const dispatch = async (job: TakenJob, member: PoolProcess) => {
    const registration = registry.get(job.definition)
    // A job without a registered handler is cancelled, not retried (B1-R12).
    if (!registration) {
      console.error(
        `No handler is registered for job "${job.definition}"; job ${job.id} is cancelled`,
      )
      await settle(() => source.cancel(job))
      return
    }
    if (job.failureCopy && !registration.failureHandler) {
      await settle(() => source.complete(job))
      return
    }
    const run = new Run(job, member, source)
    running.set(member, run)
    const ending = await run.outcome
    running.delete(member)
    if (ending.kind === 'done') await settle(() => source.complete(job))
    else {
      console.error(
        `${job.failureCopy ? 'Failure handler' : 'Attempt'} of job "${job.definition}" ${job.id} failed (${ending.reason}): ${ending.message}`,
      )
      await settle(() =>
        source.fail(job, { reason: ending.reason, message: ending.message }),
      )
    }
    // A handler's error leaves the process to take the next job; a process
    // that was ended or exited is replaced.
    if (ending.kind === 'failed' && ending.reason !== 'error') member.end()
    if (
      member.exited ||
      (ending.kind === 'failed' && ending.reason !== 'error')
    )
      await replace(member)
  }

  const replace = async (member: PoolProcess) => {
    member.end()
    const index = processes.indexOf(member)
    if (index < 0) return
    if (stopping) processes.splice(index, 1)
    else processes[index] = await startProcess()
  }

  const loop = async () => {
    while (!stopping) {
      await renewLiveness()
      const free = processes.find((member) => !reserved.has(member))
      if (!free) {
        await pause()
        continue
      }
      if (free.exited) {
        await replace(free)
        continue
      }
      let job: TakenJob | null
      try {
        job = await source.next()
      } catch (error) {
        fatal(`the queue reported an error: ${(error as Error).message}`)
      }
      if (!job) {
        await pause()
        continue
      }
      // A job taken just as the stop signal came is carried out like the
      // others: the loop ends after it, and the stop waits for it (B1-R13).
      reserved.add(free)
      const pending = dispatch(job, free).finally(() => {
        reserved.delete(free)
        dispatches.delete(pending)
        wake()
      })
      dispatches.add(pending)
    }
  }
  const looping = loop()
  console.info(`Worker ready: ${poolSize} pool processes`)

  return {
    async stop() {
      if (stopping) return
      stopping = true
      wake()
      await looping
      const all = Promise.all([...dispatches])
      const grace = sleep(workerTimings.stopGraceMs).then(() => 'timeout')
      if ((await Promise.race([all, grace])) === 'timeout')
        for (const run of running.values()) run.end(shutdownReason)
      await Promise.all([...dispatches])
      for (const member of processes) member.end()
      await stopQueues()
    },
  }
}

const shutdownReason: FailureReason = {
  reason: 'shutdown',
  message: 'The worker stopped before the job ended',
}

/** A settle that fails is logged; the queue's supervision takes over. */
async function settle(action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    console.error(`Could not record a job's end: ${(error as Error).message}`)
  }
}

type Ending = { kind: 'done' } | (FailureReason & { kind: 'failed' })

/**
 * One attempt carried out in a pool process, under the rules for ending the
 * process (B1-R09): silence, the time limit, a job taken over, or a heartbeat
 * the queue has not confirmed.
 */
class Run {
  readonly outcome: Promise<Ending>
  #end!: (ending: Ending) => void
  #ended = false
  readonly #started = Date.now()
  #confirmed = Date.now()
  #confirming = false
  readonly #timers: NodeJS.Timeout[] = []

  constructor(
    readonly job: TakenJob,
    readonly member: PoolProcess,
    readonly source: JobSource,
  ) {
    this.outcome = new Promise((resolve) => {
      this.#end = resolve
    })
    void member
      .run({
        type: 'run',
        definition: job.definition,
        failureCopy: job.failureCopy,
        data: job.data,
      })
      .then((outcome) => this.#finish(fromOutcome(outcome)))
    this.#timers.push(
      setInterval(() => this.#supervise(), workerTimings.superviseIntervalMs),
      setInterval(() => void this.#confirm(), workerTimings.confirmIntervalMs),
    )
  }

  /** Ends the process and fails the attempt with the reason. */
  end(reason: FailureReason) {
    if (this.#ended) return
    this.member.end()
    this.#finish({ kind: 'failed', ...reason })
  }

  #supervise() {
    const now = Date.now()
    if (now - this.member.lastReport > workerTimings.silenceMs)
      this.end({
        reason: 'silent',
        message: `The process did not report for ${workerTimings.silenceMs / 1000} s`,
      })
    else if (now - this.#started > this.job.timeLimitSeconds * 1000)
      this.end({
        reason: 'time-limit',
        message: `The attempt passed its time limit of ${this.job.timeLimitSeconds} s`,
      })
    else if (now - this.#confirmed > workerTimings.unconfirmedMs)
      this.end({
        reason: 'unconfirmed',
        message: `The queue did not confirm the attempt for ${workerTimings.unconfirmedMs / 1000} s`,
      })
  }

  async #confirm() {
    if (this.#confirming || this.#ended) return
    this.#confirming = true
    try {
      if (await this.source.confirm(this.job)) this.#confirmed = Date.now()
      // ASSUMPTION(oferty-pracy-2ba.1/ASM-3): the attempt that lost its job
      // cannot record its reason with the job (the fenced fail leaves the
      // newer attempt alone); the worker's log carries it.
      else
        this.end({
          reason: 'taken-over',
          message: 'The job no longer belongs to this attempt',
        })
    } catch (error) {
      console.error(
        `Job heartbeat of "${this.job.definition}" failed: ${(error as Error).message}`,
      )
    } finally {
      this.#confirming = false
    }
  }

  #finish(ending: Ending) {
    if (this.#ended) return
    this.#ended = true
    for (const timer of this.#timers) clearInterval(timer)
    this.#end(ending)
  }
}

// ASSUMPTION(oferty-pracy-2ba.1/ASM-4): a process that exits by itself
// fails its attempt with the reason `exited` and is replaced.
function fromOutcome(outcome: RunOutcome): Ending {
  if (outcome.kind === 'done') return outcome
  return {
    kind: 'failed',
    reason: outcome.kind === 'failed' ? 'error' : 'exited',
    message: outcome.message,
  }
}
