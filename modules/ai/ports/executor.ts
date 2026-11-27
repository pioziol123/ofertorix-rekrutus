import type { JobDefinition } from '../../../lib/queues/index.ts'
import type { AgentMaterial } from '../domain/agent-material.ts'
import type { AgentTool } from '../domain/agent-tools.ts'
import type { AssignmentContent, AssignmentType } from '../domain/assignment.ts'
import type { ExecutorCause } from '../domain/operation.ts'
import type { PriceList } from '../domain/price-list.ts'
import type { ExecutorUsage } from '../domain/usage.ts'

/**
 * The executor contract (solution design of epic sq2, "Contract:
 * executor"): what an executor offers, read without calling a provider,
 * and carrying out one operation. Assignment handling uses every executor
 * through it alone; an executor knows no assignment, budget, retry or
 * requesting module (T2-R02).
 */

/**
 * The parameters an assignment carries for its executor, as the settings of
 * a requesting module give them. Assignment handling compares them with the
 * executor's offers and stores them; only the executor reads their fields.
 */
export type ExecutorParameters = Readonly<Record<string, string | null>>

/**
 * One set of parameters an assignment of the type may carry, with the price
 * list that applies to it. A price list that is null means a potential and
 * an actual cost of zero.
 */
export type ServiceOffer = {
  parameters: ExecutorParameters
  priceList: PriceList | null
}

/** What an executor offers for one assignment type. */
export type ServiceDeclaration = {
  /** Every parameter set an assignment of the type may carry. */
  offers: readonly ServiceOffer[]
  /** The tools of the shared list an agent assignment may ask for. */
  tools: readonly AgentTool[]
  /**
   * The longest an operation of the type runs: the executor ends its own
   * work then and reports an ordinary failure (T2-R05). Below the time
   * limit of the executor's queue.
   */
  maxRunSeconds: number
}

/**
 * What an executor is given to carry out one operation: the frozen
 * content of its assignment with the executor's parameters, the executor
 * state saved for this operation so far (null for a new one), and two
 * writers. Each writer answers whether the operation still runs; when one
 * answers no, or fails, the executor sends nothing more and returns.
 */
export type OperationWork = {
  content: AssignmentContent
  parameters: ExecutorParameters
  state: unknown
  /**
   * Appends the raw text of a request before it is sent, or of a response
   * before it is read (T2-R08).
   */
  exchange: (kind: 'request' | 'response', raw: string) => Promise<boolean>
  /** Replaces the executor state saved for the operation. */
  saveState: (state: unknown) => Promise<boolean>
}

/**
 * The one outcome of an operation (T2-R03): a result, an ordinary failure
 * (`retryable`), a non-retryable failure, or uncertain when the executor
 * cannot tell how the work ended. The content of a result is a JSON value
 * when the assignment gave a response format, otherwise the text.
 */
export type ExecutorOutcome =
  | { kind: 'result'; content: unknown; usage: ExecutorUsage }
  | {
      kind: 'failed'
      retryable: boolean
      cause: ExecutorCause
      usage: ExecutorUsage
    }
  | { kind: 'uncertain'; cause: ExecutorCause; usage: ExecutorUsage }

/** What the job of an operation carries: only the operation's identifier. */
export type OperationJobData = { operationId: string }

export type ExecutorDeclaration = {
  name: string
  /**
   * The job of the executor's operations, on its own queue with
   * exclusivity on a constant key: one operation at a time (ZA-D01).
   */
  job: JobDefinition<OperationJobData>
  /** The assignment types it serves; a type it does not serve is absent. */
  services: Partial<Record<AssignmentType, ServiceDeclaration>>
  /** Whether its secret or address for these parameters is present now. */
  configured: (parameters: ExecutorParameters) => boolean
  /**
   * The size, in UTF-8 bytes, of the request it would send for the content,
   * when it can measure it; for the size check of placing.
   */
  requestSize?: (
    content: AssignmentContent,
    parameters: ExecutorParameters,
    priceList: PriceList,
  ) => number | undefined
}

/** An executor: its declaration and the carrying out of one operation. */
export type Executor = ExecutorDeclaration & {
  /** Carries out one operation once and returns its one outcome (T2-R03). */
  carryOut: (work: OperationWork) => Promise<ExecutorOutcome>
  /**
   * The materials an agent session gathered, read from the executor state
   * it saved; null when the state holds none.
   */
  materials: (state: unknown) => AgentMaterial[] | null
}
