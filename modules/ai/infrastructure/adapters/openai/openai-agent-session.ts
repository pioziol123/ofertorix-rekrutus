import { z } from 'zod'
import type { AgentMaterial } from '../../../domain/agent-material.ts'
import { citedMaterials, responseSchema } from './openai-search.ts'
import type { AssignmentContent } from '../../../domain/assignment.ts'
import type {
  ExecutorParameters,
  ExecutorOutcome,
} from '../../../ports/executor.ts'
import type { PriceList } from '../../../domain/price-list.ts'
import {
  contextExceeded,
  openAiKey,
  refused,
  responsesHeaders,
  responsesUrl,
} from './openai-protocol.ts'
import { nothingSent } from '../../../domain/usage.ts'
import type { ExecutorCause } from '../../../domain/operation.ts'
import {
  errorAnswer,
  failedBeforeSending,
  resultContent,
  timeLimitPassed,
  type Run,
} from '../run.ts'

/**
 * The paid agent session: a web search, then the result written from the
 * materials the search cited, in two requests of the Responses API, the
 * same as the old way's agent sends (T2-R06). Each request is sent once.
 * The step log and the materials are the executor state, saved before a
 * step is sent and after its response (architecture rules, default
 * storage of adapter state). A session is never continued by a later
 * operation: each starts from its first step.
 */

/** The limit of each request of an agent session (T2-R06). */
const stepLimitMs = 120_000

const usageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  toolCalls: z.number().nullable(),
})

/** The executor state of a session: its step log and its materials. */
const sessionState = z.object({
  version: z.literal(1),
  steps: z.array(
    z.object({
      step: z.enum(['search', 'synthesis']),
      status: z.enum(['sent', 'completed', 'failed', 'unknown']),
      responseId: z.string().nullable(),
      usage: usageSchema,
    }),
  ),
  materials: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      text: z.string(),
      sources: z.array(
        z.object({
          url: z.string(),
          title: z.string(),
          kind: z.enum(['page', 'search_snippet']),
          accessedAt: z.string(),
        }),
      ),
    }),
  ),
})
type SessionState = z.infer<typeof sessionState>
type ProviderResponse = z.infer<typeof responseSchema>

/** The materials kept in a session's state; null when it holds none. */
export function sessionMaterials(state: unknown): AgentMaterial[] | null {
  const parsed = sessionState.safeParse(state)
  return parsed.success && parsed.data.materials.length
    ? parsed.data.materials
    : null
}

/** A step that gave no usable response: how the session ends. */
class SessionEnd extends Error {
  constructor(
    readonly kind: 'failed' | 'uncertain',
    readonly reason: ExecutorCause,
    readonly retryable = true,
  ) {
    super(`Agent session ${kind} ${reason}`)
  }
}

/** The input as JSON when it is JSON, so the synthesis sees its structure. */
function parsedInput(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * Carries out a paid agent session. A missing secret, an agent without
 * web search or parameters the session does not fit end before anything
 * is sent. What each event of a step means follows the mapping of the
 * solution design.
 */
export async function carryOutSession(
  run: Run,
  content: AssignmentContent,
  parameters: ExecutorParameters,
  priceList: PriceList | null,
  fits: boolean,
  fetcher: typeof fetch,
  key = openAiKey(),
): Promise<ExecutorOutcome> {
  if (
    !key ||
    !priceList ||
    !fits ||
    !content.agent?.tools.includes('web_search')
  )
    return {
      kind: 'failed',
      retryable: false,
      cause: 'configuration',
      usage: nothingSent(),
    }
  const state: SessionState = { version: 1, steps: [], materials: [] }
  const effort = parameters.reasoningEffort

  /** Sends one step once and reads its response with its usage. */
  async function step(
    name: 'search' | 'synthesis',
    extra: Record<string, unknown>,
  ): Promise<ProviderResponse> {
    const logged: SessionState['steps'][number] = {
      step: name,
      status: 'sent',
      responseId: null,
      usage: { inputTokens: null, outputTokens: null, toolCalls: null },
    }
    state.steps.push(logged)
    // Saved before the step is sent: a step that may have been sent is
    // never sent again.
    await run.saveState(state)
    const body = JSON.stringify({
      model: parameters.model,
      store: false,
      ...(effort ? { reasoning: { effort } } : {}),
      service_tier: 'default',
      max_output_tokens: Math.floor(priceList!.maxOutputTokens / 2),
      ...extra,
    })
    await run.exchange('request', body)
    const request = run.request(stepLimitMs)
    let raw: string
    let status: number
    const end = async (
      outcome: SessionEnd,
      logStatus: 'failed' | 'unknown' = 'unknown',
    ) => {
      logged.status = logStatus
      await run.saveState(state)
      return outcome
    }
    try {
      run.meter.sending()
      let response: Response
      try {
        response = await fetcher(responsesUrl, {
          method: 'POST',
          headers: responsesHeaders(key!),
          body,
          signal: request.signal,
        })
      } catch (error) {
        if (request.timedOut())
          throw await end(new SessionEnd('failed', 'time_limit_run'))
        if (failedBeforeSending(error)) {
          run.meter.notSent()
          throw await end(new SessionEnd('failed', 'network'), 'failed')
        }
        throw await end(new SessionEnd('uncertain', 'network'))
      }
      status = response.status
      try {
        raw = await response.text()
      } catch {
        if (request.timedOut())
          throw await end(new SessionEnd('failed', 'time_limit_run'))
        throw await end(new SessionEnd('failed', 'format'))
      }
    } finally {
      request.done()
    }
    await run.exchange('response', raw)
    if (status < 200 || status >= 300) {
      const answer = errorAnswer(
        status,
        contextExceeded(status, raw),
        run.meter,
      )
      if (answer.kind === 'result') throw new Error('Unexpected result')
      throw await end(
        new SessionEnd(
          answer.kind,
          answer.cause,
          answer.kind === 'failed' && answer.retryable,
        ),
        answer.kind === 'failed' ? 'failed' : 'unknown',
      )
    }
    let r: ProviderResponse
    try {
      r = responseSchema.parse(JSON.parse(raw))
    } catch {
      throw await end(new SessionEnd('failed', 'format'))
    }
    const searches = r.output.filter((o) => o.type === 'web_search_call')
    logged.responseId = r.id
    logged.usage = {
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      toolCalls: searches.length,
    }
    // A search still in progress was charged for an unknown number of
    // calls: the session cannot tell what it cost.
    if (searches.some((o) => o.status !== 'completed'))
      throw await end(new SessionEnd('uncertain', 'incomplete'))
    run.meter.measured(
      r.usage.input_tokens,
      r.usage.output_tokens,
      searches.length,
    )
    if (r.status !== 'completed')
      throw await end(new SessionEnd('failed', 'incomplete'), 'failed')
    if (refused(r.output))
      throw await end(new SessionEnd('failed', 'refused', false), 'failed')
    logged.status = 'completed'
    await run.saveState(state)
    return r
  }

  try {
    const searched = await step('search', {
      tools: [{ type: 'web_search', search_context_size: 'low' }],
      tool_choice: 'required',
      max_tool_calls: priceList.maxToolCalls,
      instructions: content.instruction,
      input: content.input,
    })
    state.materials = citedMaterials(searched)
    await run.saveState(state)
    // Without cited material there is nothing to write the result from,
    // and the synthesis is not sent.
    if (!state.materials.length) throw new SessionEnd('failed', 'no_content')
    const format = content.responseFormat
    const synthesized = await step('synthesis', {
      tools: [],
      instructions: content.agent.resultInstruction,
      input: JSON.stringify({
        target: parsedInput(content.input),
        evidence: state.materials,
      }),
      // ASSUMPTION(oferty-pracy-sq2.3/ASM-1): no format asked for without
      // a response format.
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
    const texts = synthesized.output
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .filter((p) => p.type === 'output_text')
      .map((p) => p.text)
    const text = texts.length === 1 ? texts[0] : undefined
    if (!text?.trim()) throw new SessionEnd('failed', 'no_content')
    // ASSUMPTION(oferty-pracy-sq2.3/ASM-1): the text without a format.
    const result = resultContent(text, format !== null)
    if (!result) throw new SessionEnd('failed', 'format')
    return { kind: 'result', content: result.content, usage: run.meter.usage() }
  } catch (error) {
    if (!(error instanceof SessionEnd)) throw error
    if (error.reason === 'time_limit_run') return timeLimitPassed(run.meter)
    return error.kind === 'uncertain'
      ? { kind: 'uncertain', cause: error.reason, usage: run.meter.usage() }
      : {
          kind: 'failed',
          retryable: error.retryable,
          cause: error.reason,
          usage: run.meter.usage(),
        }
  }
}
