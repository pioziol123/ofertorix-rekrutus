import { record, tokenCount } from '../infrastructure/adapters/response.ts'
import type {
  ExecutorContent,
  ExecutorParameters,
  PriceList,
} from './declaration.ts'
import {
  errorAnswer,
  openAiKey,
  refused,
  responsesHeaders,
  responsesUrl,
} from './openai-protocol.ts'
import { nothingSent, type ExecutorOutcome } from './outcome.ts'
import {
  failedBeforeSending,
  resultContent,
  timeLimitPassed,
  type Run,
} from './run.ts'

/** The limit of the one request of a paid single answer (T2-R06). */
const requestLimitMs = 90_000

/**
 * The exact body of a paid single answer, the same as the old way sends
 * (T2-R06): the reasoning effort when the parameters give one, and the
 * response format as a strict JSON Schema when the assignment gives one.
 * ASSUMPTION(oferty-pracy-sq2.3/ASM-1): without a response format the
 * body asks for no format, and the result is the text.
 */
export function singleBody(
  content: ExecutorContent,
  parameters: ExecutorParameters,
  maxOutputTokens: number,
): string {
  const effort = parameters.reasoningEffort ?? null
  const format = content.responseFormat
  return JSON.stringify({
    model: parameters.model,
    store: false,
    tools: [],
    service_tier: 'default',
    max_output_tokens: maxOutputTokens,
    ...(effort === null ? {} : { reasoning: { effort } }),
    instructions: content.instruction,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: content.input }],
      },
    ],
    ...(format
      ? {
          text: {
            format: {
              type: 'json_schema',
              name: format.name,
              strict: true,
              schema: format.schema,
            },
          },
        }
      : {}),
  })
}

const failed = (
  run: Run,
  cause: 'incomplete' | 'no_content' | 'format',
): ExecutorOutcome => ({
  kind: 'failed',
  retryable: true,
  cause,
  usage: run.meter.usage(),
})

/**
 * Carries out a paid single answer: one request, sent once, written to
 * the exchange before it is sent, and its raw response written before it
 * is read. What each event means follows the mapping of the solution
 * design; the result is not compared with the response format (T2-R07).
 */
export async function carryOutSingle(
  run: Run,
  content: ExecutorContent,
  parameters: ExecutorParameters,
  priceList: PriceList | null,
  fetcher: typeof fetch,
  key = openAiKey(),
): Promise<ExecutorOutcome> {
  if (!key || !priceList)
    return {
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: nothingSent(),
    }
  const body = singleBody(content, parameters, priceList.maxOutputTokens)
  await run.exchange('request', body)
  const request = run.request(requestLimitMs)
  let raw: string
  let status: number
  try {
    run.meter.sending()
    let response: Response
    try {
      response = await fetcher(responsesUrl, {
        method: 'POST',
        headers: responsesHeaders(key),
        body,
        signal: request.signal,
      })
    } catch (error) {
      if (request.timedOut()) return timeLimitPassed(run.meter)
      if (failedBeforeSending(error)) {
        run.meter.notSent()
        return {
          kind: 'failed',
          retryable: true,
          cause: 'network',
          usage: run.meter.usage(),
        }
      }
      return { kind: 'uncertain', cause: 'network', usage: run.meter.usage() }
    }
    status = response.status
    try {
      raw = await response.text()
    } catch {
      if (request.timedOut()) return timeLimitPassed(run.meter)
      return failed(run, 'format')
    }
  } finally {
    request.done()
  }
  await run.exchange('response', raw)
  if (status < 200 || status >= 300) return errorAnswer(status, raw, run.meter)
  let value: Record<string, unknown>
  try {
    value = record(JSON.parse(raw))
  } catch {
    return failed(run, 'format')
  }
  const usage = record(value.usage)
  const input = tokenCount(usage.input_tokens)
  const output = tokenCount(usage.output_tokens)
  if (input !== null && output !== null) run.meter.measured(input, output)
  if (value.status !== 'completed') return failed(run, 'incomplete')
  if (refused(value.output))
    return {
      kind: 'failed',
      retryable: false,
      cause: 'refused',
      usage: run.meter.usage(),
    }
  const texts = (Array.isArray(value.output) ? value.output : [])
    .map(record)
    .filter(
      (item) =>
        item.type === 'message' &&
        (item.role === undefined || item.role === 'assistant'),
    )
    .flatMap((item) =>
      Array.isArray(item.content) ? item.content.map(record) : [],
    )
    .filter(
      (part) => part.type === 'output_text' && typeof part.text === 'string',
    )
    .map((part) => part.text as string)
  const text = texts.length === 1 ? texts[0]! : ''
  if (!text.trim()) return failed(run, 'no_content')
  const result = resultContent(text, content.responseFormat !== null)
  if (!result) return failed(run, 'format')
  return { kind: 'result', content: result.content, usage: run.meter.usage() }
}
