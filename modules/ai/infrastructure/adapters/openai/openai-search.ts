import { z } from 'zod'
import type { AgentMaterial } from '../../../domain/agent-material.ts'
// ASSUMPTION(oferty-pracy-0mq.22/ASM-5): the materials keep only the sources
// this rule accepts, the same rule Companies validates a report with.
import { safeSourceUrl } from '../../../domain/source-url.ts'

/**
 * What the paid agent session reads from the answer of OpenAI's Responses
 * API, kept from the old way's agent when that way was removed (task
 * oferty-pracy-sq2.11): the shape of an answer, the materials of a
 * completed search and the caps the session needs.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-3): the materials of the search.
 * ASSUMPTION(oferty-pracy-0mq.22/ASM-4): the caps the session fits.
 */

export const responseSchema = z
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

/**
 * The model, token caps and tool calls the agent session needs: the search
 * of gpt-6-luna reports its context in the input tokens, so its input cap
 * must take it; gpt-4.1-mini is charged a fixed block per search.
 */
export function agentFits(caps: {
  model: string
  maxInputTokens: number
  maxOutputTokens: number
  maxToolCalls?: number
}) {
  const minimum =
    caps.model === 'gpt-6-luna'
      ? 500000
      : caps.model === 'gpt-4.1-mini'
        ? 100000
        : Infinity
  return (
    caps.maxInputTokens >= minimum &&
    caps.maxOutputTokens >= 4000 &&
    (caps.maxToolCalls ?? 0) > 0
  )
}
