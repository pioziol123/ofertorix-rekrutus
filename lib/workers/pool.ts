import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { ProcessMessage, RunMessage } from './messages.ts'

/** How a job's run in a pool process ended, as the process saw it. */
export type RunOutcome =
  | { kind: 'done' }
  | { kind: 'failed'; message: string }
  | { kind: 'exited'; message: string }

/** A pool process failed while running the module plugins. */
export class PoolStartError extends Error {
  constructor(
    message: string,
    readonly module?: string,
  ) {
    super(message)
    this.name = 'PoolStartError'
  }
}

const entry = fileURLToPath(new URL('./pool-process.ts', import.meta.url))

/** One process of the worker's pool, carrying out one job at a time. */
export class PoolProcess {
  /** When the process last reported, by the worker's clock. */
  lastReport = Date.now()
  readonly #child: ChildProcess
  #exited = false
  #outcome?: (outcome: RunOutcome) => void

  private constructor(child: ChildProcess) {
    this.#child = child
    child.on('message', (message: ProcessMessage) => {
      if (message.type === 'alive') this.lastReport = Date.now()
      else if (message.type === 'done') this.#settle({ kind: 'done' })
      else if (message.type === 'failed')
        this.#settle({ kind: 'failed', message: message.message })
    })
    child.on('exit', (code, signal) => {
      this.#exited = true
      this.#settle({
        kind: 'exited',
        message: `The pool process exited (${signal ?? `code ${code}`})`,
      })
    })
  }

  /** Starts a process and waits until its module plugins ran. */
  static start(plugins: string): Promise<PoolProcess> {
    const child = fork(entry, [plugins], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    return new Promise((resolve, reject) => {
      const onMessage = (message: ProcessMessage) => {
        if (message.type === 'ready') {
          cleanup()
          resolve(new PoolProcess(child))
        } else if (message.type === 'plugin-failed') {
          cleanup()
          reject(new PoolStartError(message.message, message.module))
        }
      }
      const onExit = (code: number | null, signal: string | null) => {
        cleanup()
        reject(
          new PoolStartError(
            `A pool process exited before it was ready (${signal ?? `code ${code}`})`,
          ),
        )
      }
      const cleanup = () => {
        child.off('message', onMessage)
        child.off('exit', onExit)
      }
      child.on('message', onMessage)
      child.on('exit', onExit)
    })
  }

  get exited(): boolean {
    return this.#exited
  }

  /** Passes a job to the process; resolves when the process ends it. */
  run(message: RunMessage): Promise<RunOutcome> {
    this.lastReport = Date.now()
    return new Promise((resolve) => {
      this.#outcome = resolve
      if (this.#exited)
        this.#settle({ kind: 'exited', message: 'The pool process exited' })
      else this.#child.send(message)
    })
  }

  /** Ends the process at once, whatever it is doing. */
  end(): void {
    if (!this.#exited) this.#child.kill('SIGKILL')
  }

  #settle(outcome: RunOutcome) {
    const resolve = this.#outcome
    this.#outcome = undefined
    resolve?.(outcome)
  }
}
