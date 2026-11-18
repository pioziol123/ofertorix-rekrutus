/**
 * Environment failures and their retries within one attempt.
 * Contract: docs/agents/implementation-workflow.md (section "Environment retries");
 * solution design of oferty-pracy-5yd, decision D4.
 *
 * An error is an environment failure by where it comes from, not by its text: every
 * operation of a sandbox (opening it, a command in it, an agent's turn, closing it) is
 * wrapped here, and only what such an operation throws becomes an EnvironmentFailure.
 * Errors of the task database, of git on the host and the outcomes of checks never pass
 * through these wrappers.
 */
import type { FreshSandbox, Sandboxes, WarmSandbox } from './ports.ts'

/** Environment retries per attempt, both kinds of sandbox together (ENV-R04). */
export const MAX_ENVIRONMENT_RETRIES = 2

export type SandboxKind = 'warm' | 'fresh'

const PLACE: Record<SandboxKind, string> = {
  warm: "the implementing agent's sandbox",
  fresh: 'the fresh sandbox of the gate and the review',
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

/** An error thrown by an operation of a sandbox. */
export class EnvironmentFailure extends Error {
  readonly kind: SandboxKind
  readonly operation: string
  readonly original: unknown

  constructor(kind: SandboxKind, operation: string, original: unknown) {
    const what = operation === 'opening' || operation === 'closing' ? `${operation} ${PLACE[kind]}` : `${operation} in ${PLACE[kind]}`
    super(`${what} failed: ${describe(original)}`)
    this.name = 'EnvironmentFailure'
    this.kind = kind
    this.operation = operation
    this.original = original
  }
}

/** The attempt has had its last environment failure: the task goes back with every failure quoted (ENV-R05). */
export class EnvironmentExhausted extends Error {
  readonly failures: string[]

  constructor(failures: string[]) {
    super(environmentReason(failures))
    this.name = 'EnvironmentExhausted'
    this.failures = failures
  }
}

/** The reason of a return after the environment failed once more than the retries allow. */
export function environmentReason(failures: string[]): string {
  const quoted = failures.map((f, i) => `${i + 1}. ${f.trim().split('\n').slice(0, 20).join('\n   ')}`).join('\n')
  return `The cause is the environment, not the task: the sandboxes failed ${failures.length} times in this attempt, and the runner retries at most ${MAX_ENVIRONMENT_RETRIES} times. Hand the task off again when the environment works. Every environment failure of the attempt:\n${quoted}`
}

async function guarded<T>(kind: SandboxKind, operation: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw error instanceof EnvironmentFailure ? error : new EnvironmentFailure(kind, operation, error)
  }
}

const commandName = (command: string) => `the command \`${command.length > 80 ? `${command.slice(0, 77)}...` : command}\``

function guardWarm(sandbox: WarmSandbox): WarmSandbox {
  return {
    worktreePath: sandbox.worktreePath,
    exec: (command) => guarded('warm', commandName(command), () => sandbox.exec(command)),
    start: (prompt) => guarded('warm', "the agent's turn", () => sandbox.start(prompt)),
    resume: (prompt) => guarded('warm', "the agent's turn", () => sandbox.resume(prompt)),
    close: () => guarded('warm', 'closing', () => sandbox.close()),
  }
}

function guardFresh(sandbox: FreshSandbox): FreshSandbox {
  return {
    worktreePath: sandbox.worktreePath,
    exec: (command) => guarded('fresh', commandName(command), () => sandbox.exec(command)),
    review: (prompt) => guarded('fresh', "the reviewer's turn", () => sandbox.review(prompt)),
    close: () => guarded('fresh', 'closing', () => sandbox.close()),
  }
}

/** Sandboxes whose every operation throws an EnvironmentFailure when it fails. */
export function guardedSandboxes(sandboxes: Sandboxes): Sandboxes {
  return {
    warm: async (branch) => guardWarm(await guarded('warm', 'opening', () => sandboxes.warm(branch))),
    fresh: async (branch) => guardFresh(await guarded('fresh', 'opening', () => sandboxes.fresh(branch))),
  }
}

/** Closes a sandbox whose failure is already counted, ignoring a further error (D4). */
export async function closeQuietly(sandbox: { close(): Promise<void> } | null, log: (message: string) => void): Promise<void> {
  if (!sandbox) return
  try {
    await sandbox.close()
  } catch (error) {
    log(`closing a sandbox failed, ignored: ${describe(error).split('\n')[0]}`)
  }
}
