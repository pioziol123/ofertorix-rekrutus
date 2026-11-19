import { z } from 'zod'
import type {
  AgentMaterial,
  AgentOutcome,
  AgentRequest,
  AgentRunner,
  AgentStep,
  ModelUsage,
  ProviderSettings,
} from '../../provider-adapter.ts'
import type { ExecutionEnd } from '../../domain/execution-state.ts'
import { agentTools, type AgentTool } from '../../domain/execution-mode.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-5): the materials keep only the sources
// this rule accepts, the same rule Companies validates a report with.
import { safeSourceUrl } from '../../domain/source-url.ts'

/**
 * The agent mode of the OpenAI adapter: web search and synthesis in two
 * calls of the Responses API, moved from Companies' research provider
 * (task oferty-pracy-0mq.22). The first call searches with the request's
 * instruction and keeps, as materials, every paragraph of its answer that
 * cites a safe URL. The second writes the result in the response schema
 * from those materials. Each call is sent once and never again; the step
 * log is saved before a call is sent and after its response.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the materials kept in the
 * adapter's state, and the input of the synthesis.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-4): the usage with its search calls,
 * and the settings the agent fits.
 */

const responseSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    }),
    output: z.array(
      z
        .object({
          type: z.string(),
          status: z.string().optional(),
          action: z
            .object({ type: z.string(), url: z.string().optional() })
            .passthrough()
            .optional(),
          content: z
            .array(
              z
                .object({
                  type: z.string(),
                  text: z.string().optional(),
                  annotations: z
                    .array(
                      z
                        .object({
                          type: z.string(),
                          url: z.string().optional(),
                          title: z.string().optional(),
                          start_index: z.number().int().optional(),
                          end_index: z.number().int().optional(),
                        })
                        .passthrough(),
                    )
                    .optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
type ProviderResponse = z.infer<typeof responseSchema>

/**
 * The materials of a completed search: each paragraph of its answer with
 * the safe URLs cited inside it, an opened page told apart from a search
 * snippet. At most 40.
 */
export function citedMaterials(
  value: unknown,
  at = new Date().toISOString(),
): AgentMaterial[] {
  const response = responseSchema.parse(value)
  if (response.status !== 'completed') throw new Error('Incomplete search')
  const opened = new Set(
    response.output
      .filter(
        (o) => o.type === 'web_search_call' && o.action?.type === 'open_page',
      )
      .map((o) => o.action?.url),
  )
  const units: AgentMaterial[] = []
  for (const item of response.output)
    if (item.type === 'message')
      for (const part of item.content ?? []) {
        if (part.type !== 'output_text' || !part.text) continue
        const text = part.text
        let offset = 0
        for (const paragraph of text.split('\n')) {
          const start = offset
          offset += paragraph.length + 1
          if (!paragraph.trim()) continue
          const sources = (part.annotations ?? [])
            .filter(
              (a) =>
                a.type === 'url_citation' &&
                a.start_index !== undefined &&
                a.end_index !== undefined &&
                a.start_index >= start &&
                a.end_index <= start + paragraph.length &&
                a.end_index > a.start_index &&
                a.url &&
                safeSourceUrl(a.url),
            )
            .map((a) => ({
              url: a.url!,
              title: a.title || a.url!,
              kind: opened.has(a.url)
                ? ('page' as const)
                : ('search_snippet' as const),
              accessedAt: at,
            }))
          if (sources.length)
            units.push({ id: units.length, text: paragraph, sources })
        }
      }
  return units.slice(0, 40)
}

/** Each public tool the agent offers, as OpenAI's protocol names it. */
const protocolTools: Record<AgentTool, string> = { web_search: 'web_search' }

/** The adapter's own state of an execution: its step log and materials. */
const agentState = z.object({
  version: z.literal(1),
  steps: z.array(
    z.object({
      step: z.string(),
      status: z.enum(['sent', 'completed', 'failed', 'unknown']),
      responseId: z.string().nullable(),
      usage: z.object({
        inputTokens: z.number().nullable(),
        outputTokens: z.number().nullable(),
        toolCalls: z.number().nullable().optional(),
      }),
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
type AgentState = z.infer<typeof agentState>

/** A call that gave no usable response: how the work ends. */
class StepEnd extends Error {
  constructor(readonly end: ExecutionEnd) {
    super(`Agent step ${end.state} ${end.cause}`)
  }
}

/**
 * The model, token caps and tool calls the agent needs: the search of
 * gpt-6-luna reports its context in the input tokens, so its input cap
 * must take it; gpt-4.1-mini is charged a fixed block per search.
 */
function fits(settings: ProviderSettings) {
  const minimum =
    settings.model === 'gpt-6-luna'
      ? 500000
      : settings.model === 'gpt-4.1-mini'
        ? 100000
        : Infinity
  return (
    (settings.maxInputTokens ?? 0) >= minimum &&
    settings.maxOutputTokens >= 4000 &&
    (settings.maxToolCalls ?? 0) > 0
  )
}

/** The OpenAI agent: search, then synthesis from the cited materials. */
export function openAiAgent(
  settings: ProviderSettings,
  fetcher: typeof fetch,
  apiKey: () => string | undefined = () => process.env.OPENAI_API_KEY,
): AgentRunner {
  return {
    tools: agentTools,
    fits: () => fits(settings),
    materials: (state) => agentState.parse(state).materials,
    async run(request, context) {
      return runAgent(settings, request, context.save, fetcher, apiKey())
    },
  }
}

async function runAgent(
  settings: ProviderSettings,
  request: AgentRequest,
  save: (state: AgentState) => Promise<void>,
  fetcher: typeof fetch,
  key: string | undefined,
): Promise<AgentOutcome> {
  const state: AgentState = { version: 1, steps: [], materials: [] }
  let input = 0,
    output = 0,
    calls = 0,
    unmeasured = false
  const responseIds: string[] = []
  const finish = (
    outcome:
      | { kind: 'end'; end: ExecutionEnd }
      | { kind: 'response'; text: string; responseId: string },
  ): AgentOutcome => {
    // gpt-4.1-mini is charged a fixed block of tokens per search;
    // gpt-6-luna reports its search context in the usage.
    if (settings.model === 'gpt-4.1-mini') input += calls * 8000
    const usage: ModelUsage = {
      inputTokens: input,
      outputTokens: output,
      toolCalls: calls,
    }
    const measured = { usage, unmeasured, responseIds }
    return outcome.kind === 'end'
      ? { ...measured, kind: 'end', end: outcome.end }
      : {
          ...measured,
          kind: 'response',
          response: {
            outcome: 'completed',
            text: outcome.text,
            usage,
            responseId: outcome.responseId,
          },
        }
  }

  /** Sends one step once and reads its response with its usage. */
  async function step(
    name: string,
    body: Record<string, unknown>,
  ): Promise<ProviderResponse> {
    const logged: AgentStep = {
      step: name,
      status: 'sent',
      responseId: null,
      usage: { inputTokens: null, outputTokens: null, toolCalls: null },
    }
    state.steps.push(logged)
    // Saved before the step is sent: a step that may have been sent is
    // never sent again, and a failed save sends nothing more.
    await save(state)
    unmeasured = true
    let response: Response
    try {
      response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.model,
          store: false,
          ...(settings.reasoningEffort
            ? { reasoning: { effort: settings.reasoningEffort } }
            : {}),
          service_tier: 'default',
          max_output_tokens: Math.floor(settings.maxOutputTokens / 2),
          ...body,
        }),
        signal: AbortSignal.timeout(120000),
      })
    } catch (cause) {
      logged.status = 'unknown'
      await save(state)
      const aborted = cause instanceof Error && cause.name === 'TimeoutError'
      throw new StepEnd({
        state: 'uncertain',
        cause: aborted ? 'aborted' : 'network',
      })
    }
    if (!response.ok) {
      logged.status = 'unknown'
      await save(state)
      throw new StepEnd({ state: 'uncertain', cause: 'http' })
    }
    let r: ProviderResponse
    try {
      r = responseSchema.parse(await response.json())
    } catch {
      logged.status = 'unknown'
      await save(state)
      throw new StepEnd({ state: 'uncertain', cause: 'format' })
    }
    responseIds.push(r.id)
    input += r.usage.input_tokens
    output += r.usage.output_tokens
    const searches = r.output.filter((o) => o.type === 'web_search_call')
    logged.responseId = r.id
    logged.usage = {
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      toolCalls: searches.length,
    }
    // A search still in progress was charged for an unknown number of
    // calls: the cost of the work stays unknown.
    if (searches.some((o) => o.status !== 'completed')) {
      logged.status = 'unknown'
      await save(state)
      throw new StepEnd({ state: 'uncertain', cause: 'incomplete' })
    }
    calls += searches.length
    unmeasured = false
    logged.status = r.status === 'completed' ? 'completed' : 'failed'
    await save(state)
    if (r.status !== 'completed')
      throw new StepEnd({ state: 'failed', cause: 'incomplete' })
    return r
  }

  if (!key) return finish({ kind: 'end', end: failed('configuration') })
  // The search step needs web search; the request names it (checked when
  // the work was requested).
  if (!request.tools.includes('web_search'))
    return finish({ kind: 'end', end: failed('configuration') })
  try {
    const searched = await step('search', {
      tools: [{ type: protocolTools.web_search, search_context_size: 'low' }],
      tool_choice: 'required',
      max_tool_calls: settings.maxToolCalls,
      instructions: request.instructions,
      input: request.input,
    })
    state.materials = citedMaterials(searched)
    await save(state)
    // Without cited material there is nothing to write the result from,
    // and the synthesis is not sent.
    if (!state.materials.length)
      return finish({ kind: 'end', end: failed('no_content') })
    const synthesized = await step('synthesis', {
      tools: [],
      instructions: request.resultInstructions,
      input: JSON.stringify({
        target: parsedInput(request.input),
        evidence: state.materials,
      }),
      text: {
        format: {
          type: 'json_schema',
          name: request.output.name,
          strict: true,
          schema: request.output.schema,
        },
      },
    })
    const texts = synthesized.output
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .filter((p) => p.type === 'output_text')
      .map((p) => p.text)
    // The answer could not be read as one result.
    if (texts.length !== 1 || !texts[0])
      return finish({ kind: 'end', end: failed('format') })
    return finish({
      kind: 'response',
      text: texts[0],
      responseId: synthesized.id,
    })
  } catch (error) {
    if (error instanceof StepEnd) return finish({ kind: 'end', end: error.end })
    throw error
  }
}

const failed = (cause: ExecutionEnd['cause']): ExecutionEnd => ({
  state: 'failed',
  cause,
})

/** The input as JSON when it is JSON, so the synthesis sees its structure. */
function parsedInput(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
