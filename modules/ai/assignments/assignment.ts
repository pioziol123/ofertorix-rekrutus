import type { AgentTool } from '../domain/agent-tools.ts'
import type { ResponseFormat } from '../domain/assignment.ts'

/**
 * The command of placing an assignment and its refusals: the contract of
 * `placeAssignment`. The assignment's own concepts, its status, type and
 * limits, are in `domain/assignment.ts`.
 */

type CommonContent = {
  /**
   * The name of the requesting module's settings, under which the AI module
   * finds the executor and its parameters.
   */
  settingsName: string
  /** A short description for the owner; the AI module does not read it. */
  label: string
  instruction: string
  input: string
  responseFormat?: ResponseFormat | null
  /**
   * Refuse with `request_too_large`, before anything is created, a request
   * larger than the executor's price list covers. Without it the request is
   * placed and a usage beyond the price list's caps leaves its cost unknown.
   */
  refuseOversized?: boolean
}

/**
 * What a requesting module gives when it places an assignment (T1-R02).
 * An agent assignment also gives the tools it allows, from the shared list
 * of agent tools, and the instruction for writing the result. The step
 * that writes the result gets the JSON object `{"target": <the input>,
 * "evidence": <the materials>}`, as agent work does today.
 */
export type AssignmentRequest =
  | (CommonContent & { type: 'single' })
  | (CommonContent & {
      type: 'agent'
      agent: { tools: AgentTool[]; resultInstruction: string }
    })

/**
 * Why placing was refused (T1-R04); nothing is created:
 * - `unknown_settings`: no settings under the name, or they are incomplete;
 * - `unsupported_type`: the executor does not serve the assignment type;
 * - `invalid_parameters`: the parameters of the settings, or an agent tool,
 *   are outside what the executor offers for the type;
 * - `not_configured`: the executor lacks its secret or address;
 * - `unknown_tool`: an agent tool is not on the shared list of agent tools;
 * - `empty_content`: the label, the instruction, the input or an agent's
 *   result instruction is empty;
 * - `request_too_large`: the request is larger than the executor's price
 *   list covers, for a request that asked for this check;
 * - `invalid_request`: the request has another shape than the contract
 *   allows, e.g. an unknown type, no agent tools or an unusable response
 *   format.
 */
export const assignmentErrorCodes = [
  'unknown_settings',
  'unsupported_type',
  'invalid_parameters',
  'not_configured',
  'unknown_tool',
  'empty_content',
  'request_too_large',
  'invalid_request',
] as const
export type AssignmentErrorCode = (typeof assignmentErrorCodes)[number]

export class AssignmentError extends Error {
  constructor(readonly code: AssignmentErrorCode) {
    super(`AI assignment refused: ${code}`)
    this.name = 'AssignmentError'
  }
}
