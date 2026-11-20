import { z } from 'zod'
import { AiRequestError } from '../../errors.ts'
import type { ExecutionCause } from '../../domain/execution-state.ts'
import {
  emptyUsage,
  ModelError,
  type BatchContext,
  type BatchItem,
  type SavedBatchBody,
  type BatchItemOutcome,
  type BatchRunner,
  type BatchStep,
  type ModelRequest,
  type ProviderSettings,
} from '../../provider-adapter.ts'
import { normalizeOpenAi, openAiEnd } from './openai.ts'

/**
 * The OpenAI Batch adapter: the batch mode of the OpenAI provider. It
 * translates the items of a group into one batch file, sends it, polls the
 * batch, collects each item's result and cleans up the files. Every raw
 * artefact is archived before it is interpreted. Only fixed codes and
 * validated HTTP statuses leave this file; provider bodies stay in the
 * archive.
 */

const base = 'https://api.openai.com/v1'
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
export const batchSchema = z
  .object({
    id: identifier,
    input_file_id: identifier,
    output_file_id: identifier.nullish(),
    error_file_id: identifier.nullish(),
    status: z.enum([
      'validating',
      'failed',
      'in_progress',
      'finalizing',
      'completed',
      'expired',
      'cancelling',
      'cancelled',
    ]),
  })
  .passthrough()
export type Batch = z.infer<typeof batchSchema>
export const terminal = (batch: Batch) =>
  ['failed', 'completed', 'expired', 'cancelled'].includes(batch.status)
export class BatchError extends Error {
  constructor(
    public readonly code: 'network' | 'http' | 'format' | 'limit' | 'archive',
    public readonly status: number | null = null,
  ) {
    super(`Batch ${code}${status ? ` (${status})` : ''}`)
  }
}

/** One line of a batch file: a Responses API request with its item id. */
export type BatchRequestLine = {
  custom_id: string
  method: 'POST'
  url: '/v1/responses'
  body: Record<string, unknown>
}

/** The framing of a batch line around the body of a Responses API request. */
function frame(
  itemId: string,
  body: BatchRequestLine['body'],
): BatchRequestLine {
  return { custom_id: itemId, method: 'POST', url: '/v1/responses', body }
}

/** The batch line of one item, with the body of a Responses API request. */
export function batchLine(
  settings: ProviderSettings,
  item: BatchItem,
): BatchRequestLine {
  identifier.parse(item.itemId)
  const request: ModelRequest = item.request
  return frame(item.itemId, {
    model: request.model,
    store: false,
    tools: [],
    max_output_tokens: settings.maxOutputTokens,
    ...(settings.reasoningEffort === null
      ? {}
      : { reasoning: { effort: settings.reasoningEffort } }),
    instructions: request.instructions,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: request.input }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: request.output.name,
        strict: true,
        schema: request.output.schema,
      },
    },
  })
}

/** The most lines and bytes one batch file takes. */
const maxLines = 100
const maxFileBytes = 2 * 1024 * 1024
const jsonl = (lines: BatchRequestLine[]) =>
  lines.map((l) => JSON.stringify(l)).join('\n') + '\n'

/**
 * The input file of a batch sent before the archive kept inputs, rebuilt
 * from the request bodies saved then, framed as every batch line is.
 * ASSUMPTION(oferty-pracy-0mq.21/ASM-8)
 */
export function reconstructBatchInput(bodies: SavedBatchBody[]): string {
  return jsonl(
    bodies.map(({ itemId, body }) =>
      frame(itemId, body as BatchRequestLine['body']),
    ),
  )
}

export type BatchArchive = (
  kind: 'input' | 'output' | 'error' | 'metadata',
  key: string,
  content: string,
) => Promise<void>

export class BatchClient {
  /** Where raw artefacts are kept; set by the runner for each step. */
  archive?: BatchArchive
  constructor(
    private readonly key: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!key) throw new BatchError('format')
  }
  private async keep(
    kind: Parameters<BatchArchive>[0],
    key: string,
    content: string,
  ) {
    try {
      await this.archive?.(kind, key, content)
    } catch {
      throw new BatchError('archive')
    }
  }
  private async request(
    path: string,
    init: RequestInit = {},
    maxBytes = 8 * 1024 * 1024,
  ): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await this.fetcher(`${base}${path}`, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
        headers: { ...init.headers, Authorization: `Bearer ${this.key}` },
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new BatchError('http', response.status)
      }
      const reader = response.body?.getReader()
      if (!reader) throw new BatchError('format')
      const chunks: Uint8Array[] = []
      let bytes = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBytes) {
          await reader.cancel()
          throw new BatchError('limit')
        }
        chunks.push(value)
      }
      return Buffer.concat(chunks).toString('utf8')
    } catch (error) {
      if (error instanceof BatchError) throw error
      throw new BatchError('network')
    } finally {
      clearTimeout(timeout)
    }
  }
  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const text = await this.request(path, init)
    return this.parse(text)
  }
  private parse(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      throw new BatchError('format')
    }
  }
  async upload(lines: BatchRequestLine[]): Promise<string> {
    if (
      !lines.length ||
      lines.length > maxLines ||
      new Set(lines.map((l) => l.custom_id)).size !== lines.length ||
      new Set(lines.map((l) => l.body.model)).size !== 1
    )
      throw new BatchError('format')
    const content = jsonl(lines)
    if (Buffer.byteLength(content) > maxFileBytes) throw new BatchError('limit')
    await this.keep('input', 'request', content)
    const form = new FormData()
    form.set('purpose', 'batch')
    form.set('expires_after[anchor]', 'created_at')
    form.set('expires_after[seconds]', '172800')
    form.set(
      'file',
      new Blob([content], { type: 'application/jsonl' }),
      'offers.jsonl',
    )
    const data = await this.json('/files', { method: 'POST', body: form })
    return z.object({ id: identifier }).parse(data).id
  }
  async create(file: string, operation: string): Promise<Batch> {
    identifier.parse(file)
    identifier.parse(operation)
    const raw = await this.request('/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_file_id: file,
        endpoint: '/v1/responses',
        completion_window: '24h',
        output_expires_after: { anchor: 'created_at', seconds: 604800 },
        metadata: { operation_id: operation },
      }),
    })
    await this.keep('metadata', operation, raw)
    return batchSchema.parse(this.parse(raw))
  }
  async retrieve(id: string): Promise<Batch> {
    identifier.parse(id)
    const raw = await this.request(`/batches/${id}`)
    await this.keep('metadata', id, raw)
    const batch = batchSchema.parse(this.parse(raw))
    if (batch.id !== id) throw new BatchError('format')
    return batch
  }
  async results(
    batch: Batch,
    expected: string[],
  ): Promise<Map<string, BatchLine>> {
    if (!terminal(batch)) throw new BatchError('format')
    const results = new Map<string, BatchLine>()
    const allowed = new Set(expected)
    const contents: string[] = []
    for (const file of new Set(
      [batch.output_file_id, batch.error_file_id].filter(
        (f): f is string => !!f,
      ),
    )) {
      identifier.parse(file)
      let content: string
      try {
        content = await this.request(`/files/${file}/content`)
      } catch (error) {
        // A file exceeding the download limit is not safely archived. Keep
        // its remote copy rather than treating it as disposable bad content.
        if (
          this.archive &&
          error instanceof BatchError &&
          error.code === 'limit'
        )
          throw new BatchError('archive')
        throw error
      }
      await this.keep(
        file === batch.error_file_id ? 'error' : 'output',
        file,
        content,
      )
      contents.push(content)
    }
    // Archive every file before parsing: malformed output must not prevent
    // preservation of a companion error file before terminal cleanup.
    for (const content of contents) {
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        let item: BatchLine
        try {
          item = lineSchema.parse(JSON.parse(line))
        } catch {
          throw new BatchError('format')
        }
        if (!allowed.has(item.custom_id) || results.has(item.custom_id))
          throw new BatchError('format')
        results.set(item.custom_id, item)
      }
    }
    return results
  }
  async remove(file: string): Promise<void> {
    identifier.parse(file)
    try {
      const result = z
        .object({ id: identifier, deleted: z.literal(true) })
        .parse(await this.json(`/files/${file}`, { method: 'DELETE' }))
      if (result.id !== file) throw new BatchError('format')
    } catch (e) {
      if (!(e instanceof BatchError && e.status === 404)) throw e
    }
  }
}
const lineSchema = z
  .object({
    custom_id: identifier,
    response: z
      .object({ status_code: z.number().int(), body: z.unknown() })
      .nullish(),
    error: z
      .object({ code: z.string(), message: z.string().optional() })
      .nullish(),
  })
  .passthrough()
export type BatchLine = z.infer<typeof lineSchema>

/**
 * The adapter's own state of a group, kept in the execution's adapter
 * state: the facts it observed, from which it computes its next step.
 * - `sending`: the run that took the group sends it; the input file once
 *   uploaded;
 * - `submitted`: the provider accepted the batch;
 * - `ended`: the outcomes are saved; the files left to clean up;
 * - `unconfirmed`: creating the batch may have reached the provider
 *   without a confirmation; nothing is sent or cleaned automatically.
 */
const stateSchema = z
  .object({
    stage: z.enum(['sending', 'submitted', 'ended', 'unconfirmed']),
    inputFileId: identifier.nullable(),
    batchId: identifier.nullable(),
    status: z.string().nullable(),
    outputFileId: identifier.nullable(),
    errorFileId: identifier.nullable(),
    cleaned: z.boolean(),
  })
  .strict()
type BatchState = z.infer<typeof stateSchema>
const initialState: BatchState = {
  stage: 'sending',
  inputFileId: null,
  batchId: null,
  status: null,
  outputFileId: null,
  errorFileId: null,
  cleaned: false,
}

/** The adapter's state read back; null when there is none or it is invalid. */
function readState(value: unknown): BatchState | null {
  if (value === null || value === undefined) return null
  const parsed = stateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The public cause of an error of the batch transport. */
function causeOf(error: unknown): ExecutionCause {
  if (error instanceof BatchError)
    return error.code === 'network' || error.code === 'http'
      ? error.code
      : error.code === 'format' || error.code === 'limit'
        ? 'format'
        : 'unknown'
  return error instanceof z.ZodError ? 'format' : 'unknown'
}

/** A provider refused to create the batch: nothing was started or charged. */
const refusedByProvider = (error: unknown) =>
  error instanceof BatchError &&
  error.code === 'http' &&
  error.status !== null &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 408

/** The same end for every item of the group. */
function allEnded(
  items: BatchItem[],
  state: BatchState,
  end: BatchItemOutcome & { kind: 'end' },
): BatchStep {
  return {
    kind: 'ended',
    outcomes: new Map(items.map((item) => [item.itemId, end])),
    state,
  }
}

const groupEnd = (
  state: 'failed' | 'uncertain',
  cause: ExecutionCause,
  notCharged: boolean,
): BatchItemOutcome & { kind: 'end' } => ({
  kind: 'end',
  end: { state, cause },
  usage: emptyUsage(),
  responseId: null,
  notCharged,
})

/**
 * What one item's line means. A line with a response reads like a single
 * call; a missing line, an error line or a failed request ends the item.
 * The provider charges nothing only for a failed batch without any file
 * and for an expired request; any other missing result leaves the cost
 * unknown, never a default zero.
 */
export function itemOutcome(
  line: BatchLine | undefined,
  batch: Batch,
): BatchItemOutcome {
  if (!line || line.error || line.response?.status_code !== 200) {
    const notCharged =
      (!line &&
        batch.status === 'failed' &&
        !batch.output_file_id &&
        !batch.error_file_id) ||
      line?.error?.code === 'batch_expired'
    return {
      kind: 'end',
      end: {
        state: 'failed',
        cause: line?.response && !line.error ? 'http' : 'unknown',
      },
      usage: emptyUsage(),
      responseId: null,
      notCharged,
    }
  }
  try {
    return { kind: 'response', response: normalizeOpenAi(line.response.body) }
  } catch (error) {
    return {
      kind: 'end',
      end: openAiEnd({ kind: 'error', error }),
      usage:
        error instanceof ModelError
          ? (error.details.usage ?? emptyUsage())
          : emptyUsage(),
      responseId:
        error instanceof ModelError ? (error.details.responseId ?? null) : null,
      notCharged: false,
    }
  }
}

/** Sends the group the run took: uploads its file and creates the batch. */
async function send(
  api: BatchClient,
  items: BatchItem[],
  lines: BatchRequestLine[],
  context: BatchContext,
): Promise<BatchStep | BatchState> {
  let state: BatchState = initialState
  if (!(await context.save(state))) return { kind: 'wait' }
  let file: string
  try {
    file = await api.upload(lines)
  } catch (error) {
    // Nothing reached the provider's batch: no analysis was started.
    return allEnded(
      items,
      { ...state, stage: 'ended', cleaned: true },
      groupEnd('failed', causeOf(error), true),
    )
  }
  state = { ...state, inputFileId: file }
  if (!(await context.save(state))) return { kind: 'wait' }
  try {
    const batch = await api.create(file, context.groupId)
    if (batch.input_file_id !== file) throw new BatchError('format')
    const submitted: BatchState = {
      ...state,
      stage: 'submitted',
      batchId: batch.id,
      status: batch.status,
    }
    if (!(await context.save(submitted))) return { kind: 'wait' }
    return submitted
  } catch (error) {
    // A refusal started nothing. Any other failure may have created a paid
    // batch the provider did not confirm: it is not sent again, and its
    // cost and uncertain end stay visible.
    if (refusedByProvider(error))
      return allEnded(
        items,
        { ...state, stage: 'ended' },
        groupEnd('failed', causeOf(error), true),
      )
    return allEnded(
      items,
      { ...state, stage: 'unconfirmed' },
      groupEnd('uncertain', causeOf(error), false),
    )
  }
}

/** Polls a submitted batch and, once it ended, collects every item. */
async function collect(
  api: BatchClient,
  items: BatchItem[],
  state: BatchState,
  context: BatchContext,
): Promise<BatchStep> {
  let batch: Batch
  try {
    batch = await api.retrieve(state.batchId!)
    if (batch.input_file_id !== state.inputFileId)
      throw new BatchError('format')
  } catch {
    // Reading the batch resumes in the next step.
    return { kind: 'wait' }
  }
  const polled: BatchState = {
    ...state,
    status: batch.status,
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
  }
  if (!terminal(batch)) {
    await context.save(polled)
    return { kind: 'wait' }
  }
  const ended: BatchState = { ...polled, stage: 'ended' }
  let lines: Map<string, BatchLine>
  try {
    lines = await api.results(
      batch,
      items.map((item) => item.itemId),
    )
  } catch (error) {
    // An invalid or lost result file ends the items with their cost to be
    // checked; a transient failure (archive included) resumes collecting
    // with the files intact.
    if (
      error instanceof BatchError &&
      (error.code === 'format' ||
        error.code === 'limit' ||
        error.status === 404)
    )
      return allEnded(items, ended, groupEnd('failed', causeOf(error), false))
    await context.save(polled)
    return { kind: 'wait' }
  }
  return {
    kind: 'ended',
    outcomes: new Map(
      items.map((item) => [
        item.itemId,
        itemOutcome(lines.get(item.itemId), batch),
      ]),
    ),
    state: ended,
  }
}

/**
 * The batch mode of the OpenAI provider. `client` gives the transport,
 * with the provider's key from its secret.
 */
export function openAiBatch(
  settings: ProviderSettings,
  client: () => BatchClient,
): BatchRunner {
  return {
    admit(items) {
      const lines = items.map((item) => batchLine(settings, item))
      const cap = settings.maxInputTokens ?? 0
      // UTF-8 bytes are a conservative token ceiling including the
      // instruction and schema overhead of the exact batch line.
      // ASSUMPTION(oferty-pracy-0mq.21/ASM-5): every batch item is checked,
      // as every item of the former batch path was.
      if (lines.some((l) => Buffer.byteLength(JSON.stringify(l.body)) > cap))
        throw new AiRequestError('input_too_large')
      // ASSUMPTION(oferty-pracy-0mq.21/ASM-4): the refusal of a group one
      // batch file cannot take.
      if (
        lines.length > maxLines ||
        Buffer.byteLength(jsonl(lines)) > maxFileBytes
      )
        throw new AiRequestError('batch_too_large')
    },
    async advance(items, context) {
      let state = readState(context.state)
      const api = client()
      api.archive = context.archive
      if (state === null) {
        // Only the run that took the queued items sends them; a group in
        // sending belongs to that run, and a later job of an item ends it
        // when that run is lost.
        if (!context.claimed || context.state !== null) return { kind: 'wait' }
        const sent = await send(
          api,
          items,
          items.map((item) => batchLine(settings, item)),
          context,
        )
        if ('kind' in sent) return sent
        state = sent
      }
      if (state.stage !== 'submitted') return { kind: 'wait' }
      return collect(api, items, state, context)
    },
    async cleanup(context) {
      const state = readState(context.state)
      if (!state || !needsCleanup(state)) return
      const api = client()
      try {
        for (const file of new Set(
          [state.inputFileId, state.outputFileId, state.errorFileId].filter(
            (f): f is string => f !== null,
          ),
        ))
          await api.remove(file)
      } catch {
        // A later periodic pass retries the cleanup, never the paid
        // submission.
        return
      }
      await context.save({ ...state, cleaned: true })
    },
    needsCleanup: (value) => {
      const state = readState(value)
      return state !== null && needsCleanup(state)
    },
    // Nothing saved yet, or the batch not yet created: the group is being
    // sent. A state this adapter cannot read is not continued by it either.
    sending: (value) => {
      const state = readState(value)
      return state === null || state.stage === 'sending'
    },
  }
}

const needsCleanup = (state: BatchState) =>
  state.stage === 'ended' && !state.cleaned
