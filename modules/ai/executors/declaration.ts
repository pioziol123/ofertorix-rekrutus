import type { JobDefinition } from '../../../lib/queues/index.ts'
import type { AgentTool } from '../domain/execution-mode.ts'
import type { AiConfiguration } from '../model-catalog.ts'
import type {
  AssignmentType,
  ResponseFormat,
} from '../assignments/assignment.ts'

/**
 * The declaration part of the executor contract (solution design of epic
 * sq2, "Contract: executor"): what an executor offers, read without calling
 * a provider. Carrying out an operation is added to the contract by task
 * oferty-pracy-sq2.3, with the maximum run time of each service.
 */

/**
 * The price list an executor computes the potential and the actual cost
 * from: its version, the exchange rate, the rates and the caps of input,
 * output and paid tool calls.
 */
export type PriceList = AiConfiguration

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
}

/** The frozen content of an assignment, as far as an executor reads it. */
export type ExecutorContent = {
  type: AssignmentType
  instruction: string
  input: string
  responseFormat: ResponseFormat | null
  agent: { tools: AgentTool[]; resultInstruction: string } | null
}

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
    content: ExecutorContent,
    parameters: ExecutorParameters,
    priceList: PriceList,
  ) => number | undefined
}
