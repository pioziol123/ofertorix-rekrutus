import { randomUUID } from 'node:crypto'
import { transaction } from '../../../lib/db.ts'
import { sendJob } from '../../../lib/queues/index.ts'
import { agentTools } from '../domain/agent-tools.ts'
import { schemaValidator } from '../domain/response-schema.ts'
import type { ExecutorContent } from '../executors/declaration.ts'
import {
  insertAssignment,
  insertPendingOperation,
} from '../infrastructure/persistence/assignments.ts'
import {
  AssignmentError,
  assignmentTimeLimitSeconds,
  assignmentTypes,
  automaticOperationLimit,
  type AssignmentRequest,
} from './assignment.ts'
import { exceedsPriceList } from './request-size.ts'
import { resolveExecutor, type ResolvedExecutor } from './resolve-executor.ts'

export type PlacedAssignment = { assignmentId: string }

const filled = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''

/** The content of the request, checked for its shape (T1-R04). */
function frozenContent(request: AssignmentRequest): ExecutorContent {
  if (
    typeof request !== 'object' ||
    request === null ||
    typeof request.settingsName !== 'string' ||
    !(assignmentTypes as readonly unknown[]).includes(request.type)
  )
    throw new AssignmentError('invalid_request')
  const format = request.responseFormat ?? null
  if (
    format !== null &&
    (!filled(format.name) ||
      typeof format.schema !== 'object' ||
      format.schema === null ||
      Array.isArray(format.schema) ||
      !schemaValidator(format.schema))
  )
    throw new AssignmentError('invalid_request')
  if (request.type === 'agent') {
    const agent = request.agent as Partial<typeof request.agent> | undefined
    if (!Array.isArray(agent?.tools) || !agent.tools.length)
      throw new AssignmentError('invalid_request')
    if (
      agent.tools.some(
        (tool) => !(agentTools as readonly unknown[]).includes(tool),
      )
    )
      throw new AssignmentError('unknown_tool')
    if (!filled(agent.resultInstruction))
      throw new AssignmentError('empty_content')
  }
  if (
    !filled(request.label) ||
    !filled(request.instruction) ||
    !filled(request.input)
  )
    throw new AssignmentError('empty_content')
  return {
    type: request.type,
    instruction: request.instruction,
    input: request.input,
    responseFormat: format,
    agent:
      request.type === 'agent'
        ? {
            tools: [...new Set(request.agent.tools)],
            resultInstruction: request.agent.resultInstruction,
          }
        : null,
  }
}

/** Checks the content against what the executor offers (T1-R04). */
function checkAgainstExecutor(
  content: ExecutorContent,
  resolved: ResolvedExecutor,
  refuseOversized: boolean,
) {
  if (
    content.agent?.tools.some((tool) => !resolved.service.tools.includes(tool))
  )
    throw new AssignmentError('invalid_parameters')
  const priceList = resolved.offer.priceList
  if (
    refuseOversized &&
    priceList &&
    exceedsPriceList(
      content,
      priceList,
      resolved.executor.requestSize?.(content, resolved.parameters, priceList),
    )
  )
    throw new AssignmentError('request_too_large')
}

/**
 * Places an assignment in the caller's transaction (T1-R01): freezes its
 * content with the executor and the parameters found under the settings
 * name (T1-R03), and creates it in progress with its first operation,
 * pending and waiting for the executor, whose job is sent to the executor's
 * queue (T1-R05). Rolling back the caller's transaction removes all of it.
 * Each call places a new assignment (T1-R06). A refusal throws an
 * `AssignmentError` before anything is created (T1-R04).
 */
export async function placeAssignment(
  request: AssignmentRequest,
): Promise<PlacedAssignment> {
  const content = frozenContent(request)
  const resolved = resolveExecutor(request.settingsName, content.type)
  checkAgainstExecutor(content, resolved, request.refuseOversized === true)
  const assignmentId = randomUUID()
  const operationId = randomUUID()
  await transaction(async () => {
    await insertAssignment({
      id: assignmentId,
      settingsName: request.settingsName,
      type: content.type,
      label: request.label,
      instruction: content.instruction,
      input: content.input,
      responseFormat: content.responseFormat,
      agentOptions: content.agent,
      executor: resolved.executor.name,
      executorParameters: resolved.parameters,
      automaticOperationLimit,
      timeLimitSeconds: assignmentTimeLimitSeconds,
    })
    await insertPendingOperation({
      id: operationId,
      assignmentId,
      ordinal: 1,
      origin: 'automatic',
    })
    await sendJob(resolved.executor.job, { operationId })
  })
  return { assignmentId }
}
