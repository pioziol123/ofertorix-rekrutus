import type { AiEndpoint } from '../configuration.ts'
import { record, tokenCount } from '../infrastructure/adapters/response.ts'
import type { ExecutorContent, ExecutorParameters } from './declaration.ts'
import type { ExecutorOutcome } from './outcome.ts'
import {
  failedBeforeSending,
  resultContent,
  timeLimitPassed,
  type Run,
} from './run.ts'

/**
 * The local executor's single answer on Ollama's native protocol, the
 * same requests as the old way's adapter sends (T2-R06): the list of
 * models, which fixes that the model is available when the operation
 * starts, then the chat request. Each is written to the exchange before it
 * is sent, and its raw response before it is read. The chat request has
 * no limit of its own: only the maximum run time ends it.
 */

/** The limit of the request for the list of models, as today. */
const tagsLimitMs = 10_000

export type LocalModel = {
  endpoint: AiEndpoint
  numCtx: number
}

const ordinary = (
  run: Run,
  cause:
    | 'incomplete'
    | 'no_content'
    | 'format'
    | 'network'
    | 'http'
    | 'model_unavailable',
): ExecutorOutcome => ({
  kind: 'failed',
  retryable: true,
  cause,
  usage: run.meter.usage(),
})

/** One request with its raw response, or how the operation ends. */
async function send(
  run: Run,
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  limitMs: number | undefined,
  work: boolean,
): Promise<{ status: number; raw: string } | ExecutorOutcome> {
  const request = run.request(limitMs)
  try {
    if (work) run.meter.sending()
    let response: Response
    try {
      response = await fetcher(url, { ...init, signal: request.signal })
    } catch (error) {
      if (request.timedOut()) return timeLimitPassed(run.meter)
      if (!work || failedBeforeSending(error)) {
        if (work) run.meter.notSent()
        return ordinary(run, 'network')
      }
      return { kind: 'uncertain', cause: 'network', usage: run.meter.usage() }
    }
    try {
      return { status: response.status, raw: await response.text() }
    } catch {
      if (request.timedOut()) return timeLimitPassed(run.meter)
      return work
        ? { kind: 'uncertain', cause: 'network', usage: run.meter.usage() }
        : ordinary(run, 'network')
    }
  } finally {
    request.done()
  }
}

const ok = (status: number) => status >= 200 && status < 300

/** Carries out a local single answer on the model of the parameters. */
export async function carryOutLocalSingle(
  run: Run,
  content: ExecutorContent,
  parameters: ExecutorParameters,
  local: LocalModel,
  fetcher: typeof fetch,
): Promise<ExecutorOutcome> {
  const base = local.endpoint.url.replace(/\/$/, '')
  const token = local.endpoint.credentialEnv
    ? process.env[local.endpoint.credentialEnv]
    : undefined
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const model = String(parameters.model)

  const tagsUrl = `${base}/api/tags`
  await run.exchange('request', `GET ${tagsUrl}`)
  const tags = await send(
    run,
    fetcher,
    tagsUrl,
    { headers },
    tagsLimitMs,
    false,
  )
  if ('kind' in tags) return tags
  await run.exchange('response', tags.raw)
  if (!ok(tags.status)) return ordinary(run, 'http')
  let listed: Record<string, unknown>
  try {
    listed = record(JSON.parse(tags.raw))
  } catch {
    return ordinary(run, 'format')
  }
  if (!Array.isArray(listed.models)) return ordinary(run, 'format')
  if (!listed.models.map(record).some((entry) => entry.name === model))
    return ordinary(run, 'model_unavailable')

  const format = content.responseFormat
  const body = JSON.stringify({
    model,
    stream: false,
    truncate: false,
    shift: false,
    messages: [
      { role: 'system', content: content.instruction },
      { role: 'user', content: content.input },
    ],
    // ASSUMPTION(oferty-pracy-sq2.3/ASM-1): no format asked for without a
    // response format.
    ...(format ? { format: format.schema } : {}),
    options: { num_ctx: local.numCtx },
  })
  await run.exchange('request', body)
  const chat = await send(
    run,
    fetcher,
    `${base}/api/chat`,
    { method: 'POST', headers, body },
    undefined,
    true,
  )
  if ('kind' in chat) return chat
  await run.exchange('response', chat.raw)
  let value: Record<string, unknown> | null
  try {
    value = record(JSON.parse(chat.raw))
  } catch {
    value = null
  }
  if (!ok(chat.status)) {
    if (chat.status === 404) {
      run.meter.notCharged()
      return ordinary(run, 'model_unavailable')
    }
    if (chat.status === 400 && value?.code === 'context_overflow')
      return {
        kind: 'failed',
        retryable: false,
        cause: 'context_overflow',
        usage: run.meter.usage(),
      }
    return ordinary(run, 'http')
  }
  if (value === null) return ordinary(run, 'format')
  const input = tokenCount(value.prompt_eval_count)
  const output = tokenCount(value.eval_count)
  if (input !== null && output !== null) run.meter.measured(input, output)
  if (value.done !== true) return ordinary(run, 'format')
  if (value.done_reason !== 'stop') return ordinary(run, 'incomplete')
  const message = record(value.message)
  if (
    message.role !== 'assistant' ||
    typeof message.content !== 'string' ||
    !message.content.trim()
  )
    return ordinary(run, 'no_content')
  const result = resultContent(message.content, format !== null)
  if (!result) return ordinary(run, 'format')
  return { kind: 'result', content: result.content, usage: run.meter.usage() }
}
