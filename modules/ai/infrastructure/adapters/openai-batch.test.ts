import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiRequestError } from '../../errors.ts'
import type { BatchItem, ProviderSettings } from '../../provider-adapter.ts'
import {
  BatchClient,
  BatchError,
  batchLine,
  itemOutcome,
  openAiBatch,
  terminal,
  type Batch,
  type BatchArchive,
  type BatchLine,
} from './openai-batch.ts'

// The OpenAI Batch adapter, moved from Matching (task oferty-pracy-0mq.21).
const settings: ProviderSettings = {
  provider: 'openai',
  model: 'test-model',
  reasoningEffort: 'low',
  maxOutputTokens: 500,
  maxInputTokens: 100000,
  runtime: null,
}
const item = (itemId = 'offer_1', input = '{"profile":"PHP"}'): BatchItem => ({
  itemId,
  request: {
    model: settings.model,
    instructions: 'Evaluate job fit.',
    input,
    output: { name: 'offer_assessment', schema: { type: 'object' } },
  },
})
const batchRequest = (
  id: string,
  options: { input?: string; model?: string; maxInputTokens?: number } = {},
) =>
  batchLine(
    {
      ...settings,
      model: options.model ?? settings.model,
      maxInputTokens: options.maxInputTokens ?? settings.maxInputTokens,
    },
    {
      ...item(id, options.input),
      request: {
        ...item(id, options.input).request,
        model: options.model ?? settings.model,
      },
    },
  )
const batch: Batch = {
  id: 'batch_test',
  input_file_id: 'file_input',
  output_file_id: 'file_output',
  status: 'completed',
}
const line = (id = 'offer_1'): BatchLine => ({
  custom_id: id,
  response: {
    status_code: 200,
    body: {
      id: 'resp_test',
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '{"summary":"Ocena"}' }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  },
})
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status })
const archived = (
  key: string,
  fetcher: typeof fetch,
  archive?: BatchArchive,
) => {
  const client = new BatchClient(key, fetcher)
  client.archive = archive
  return client
}
const fakeClient = (
  impl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
) => {
  const fetcher = vi.fn(impl)
  return {
    client: new BatchClient('secret-test-key', fetcher as typeof fetch),
    fetcher,
  }
}
afterEach(() => vi.useRealTimers())

describe('batch request and upload', () => {
  it('builds Responses JSONL records with stable custom ID and constrained model output', () => {
    const request = batchRequest('offer_1')
    expect(request).toMatchObject({
      custom_id: 'offer_1',
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: 'test-model',
        store: false,
        tools: [],
        max_output_tokens: 500,
        reasoning: { effort: 'low' },
        instructions: 'Evaluate job fit.',
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: '{"profile":"PHP"}' }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'offer_assessment',
            strict: true,
            schema: { type: 'object' },
          },
        },
      },
    })
    expect(JSON.stringify(request)).not.toContain('secret-test-key')
    expect(() => batchRequest('../escape')).toThrow()
  })
  it('refuses at request time a line above the input cap, more than 100 lines or a file above 2 MiB', () => {
    const noTransport = () => {
      throw new Error('No transport at request time')
    }
    const runner = openAiBatch(settings, noTransport)
    expect(() => runner.admit([item('a'), item('b')])).not.toThrow()
    expect(() =>
      openAiBatch({ ...settings, maxInputTokens: 10 }, noTransport).admit([
        item(),
      ]),
    ).toThrow(new AiRequestError('input_too_large'))
    expect(() =>
      runner.admit(Array.from({ length: 101 }, (_, i) => item(`offer_${i}`))),
    ).toThrow(new AiRequestError('batch_too_large'))
    const large = openAiBatch(
      { ...settings, maxInputTokens: 3000000 },
      noTransport,
    )
    expect(() =>
      large.admit([
        item('a', 'x'.repeat(1100000)),
        item('b', 'x'.repeat(1100000)),
      ]),
    ).toThrow(new AiRequestError('batch_too_large'))
  })
  it('uploads multipart batch purpose with newline-terminated JSONL and expiration', async () => {
    const { client, fetcher } = fakeClient(async () =>
      json({ id: 'file_input' }),
    )
    const request = batchRequest('offer_1')
    expect(await client.upload([request])).toBe('file_input')
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/files')
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer secret-test-key' },
    })
    const form = init!.body as FormData
    expect(form.get('purpose')).toBe('batch')
    expect(form.get('expires_after[seconds]')).toBe('172800')
    expect(await (form.get('file') as Blob).text()).toBe(
      JSON.stringify(request) + '\n',
    )
  })
  it('rejects empty, duplicate, mixed-model and oversized uploads before any network call', async () => {
    const { client, fetcher } = fakeClient(async () => json({ id: 'file' }))
    const request = batchRequest('one')
    for (const requests of [
      [],
      [request, request],
      [request, batchRequest('two', { model: 'other' })],
      Array.from({ length: 101 }, (_, i) => batchRequest(`offer_${i}`)),
    ]) {
      await expect(client.upload(requests)).rejects.toBeInstanceOf(BatchError)
    }
    const huge = batchRequest('huge', { input: 'x'.repeat(2100000) })
    await expect(client.upload([huge])).rejects.toMatchObject({ code: 'limit' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('creates one 24h Responses batch and checks retrieved identity', async () => {
    const { client, fetcher } = fakeClient(async () => json(batch))
    expect(await client.create('file_input', 'operation_1')).toEqual(batch)
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string)
    expect(body).toMatchObject({
      endpoint: '/v1/responses',
      completion_window: '24h',
      input_file_id: 'file_input',
      metadata: { operation_id: 'operation_1' },
    })
    await expect(client.retrieve('batch_other')).rejects.toMatchObject({
      code: 'format',
    })
  })
})

describe('bounded and redacted transport', () => {
  it.each([
    [new BatchError('http', 403), 'http'],
    [new BatchError('network'), 'network'],
    [new BatchError('format'), 'format'],
    [new BatchError('limit'), 'format'],
    [new BatchError('archive'), 'unknown'],
    [new Error('secret-test-key private CV'), 'unknown'],
  ] as const)(
    'ends a group whose upload failed with a public cause only (%s)',
    async (error, cause) => {
      error.message = 'secret-test-key private CV provider body'
      const client = new BatchClient('secret-test-key', async () => {
        throw new Error('No call expected')
      })
      client.upload = async () => {
        throw error
      }
      const saved: unknown[] = []
      const step = await openAiBatch(settings, () => client).advance(
        [item('a'), item('b')],
        {
          groupId: 'group_1',
          state: null,
          claimed: true,
          save: async (next) => {
            saved.push(next)
            return true
          },
          archive: async () => {},
        },
      )
      expect(step).toMatchObject({ kind: 'ended' })
      const outcomes = step.kind === 'ended' ? [...step.outcomes.values()] : []
      expect(outcomes).toEqual([
        {
          kind: 'end',
          end: { state: 'failed', cause },
          usage: { inputTokens: null, outputTokens: null },
          responseId: null,
          notCharged: true,
        },
        expect.anything(),
      ])
      expect(JSON.stringify([step, saved])).not.toMatch(
        /secret-test-key|private CV/,
      )
    },
  )
  it('sanitizes fetch exceptions and HTTP response errors without credentials or response content', async () => {
    for (const impl of [
      async () => {
        throw new Error('secret-test-key private CV')
      },
      async () => new Response('secret-test-key private CV', { status: 429 }),
    ]) {
      const { client } = fakeClient(impl)
      try {
        await client.retrieve('batch_test')
        expect.fail('Must reject')
      } catch (error) {
        expect(error).toBeInstanceOf(BatchError)
        expect(String(error)).not.toMatch(/secret-test-key|private CV/)
      }
    }
  })
  it('requires redirect rejection and aborts timed-out requests', async () => {
    vi.useFakeTimers()
    const { client, fetcher } = fakeClient(
      async (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () =>
            reject(new Error('timeout')),
          ),
        ),
    )
    const pending = client.retrieve('batch_test')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'network' })
    await vi.advanceTimersByTimeAsync(60000)
    await assertion
    expect(fetcher.mock.calls[0]![1]!.redirect).toBe('error')
  })
  it('bounds streamed response bodies and cancels overflow', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(8 * 1024 * 1024 + 1))
      },
      cancel,
    })
    const { client } = fakeClient(async () => new Response(stream))
    await expect(client.retrieve('batch_test')).rejects.toMatchObject({
      code: 'limit',
    })
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects malformed JSON with a safe error', async () => {
    const { client } = fakeClient(async () => new Response('private CV'))
    await expect(client.retrieve('batch_test')).rejects.toMatchObject({
      code: 'format',
    })
  })
})

describe('terminal and partial result processing', () => {
  it('reads unordered partial results from an expired batch without inventing missing rows', async () => {
    const { client } = fakeClient(
      async (url) =>
        new Response(
          String(url).includes('file_error')
            ? JSON.stringify({
                custom_id: 'offer_2',
                error: { code: 'batch_expired' },
              })
            : JSON.stringify(line('offer_3')) +
                '\n' +
                JSON.stringify(line('offer_1')) +
                '\n',
        ),
    )
    const expired: Batch = {
      ...batch,
      status: 'expired',
      error_file_id: 'file_error',
    }
    expect(terminal(expired)).toBe(true)
    const results = await client.results(expired, [
      'offer_1',
      'offer_2',
      'offer_3',
      'offer_4',
    ])
    expect([...results.keys()]).toEqual(['offer_3', 'offer_1', 'offer_2'])
    expect(results.has('offer_4')).toBe(false)
    expect(results.get('offer_2')!.error?.code).toBe('batch_expired')
  })
  it.each(['duplicate', 'unknown', 'malformed'])(
    'rejects %s result identifiers or lines',
    async (kind) => {
      const data =
        kind === 'duplicate'
          ? [line(), line()]
          : kind === 'unknown'
            ? [line('unknown')]
            : [{ custom_id: 'offer_1', response: { status_code: '200' } }]
      const { client } = fakeClient(
        async () => new Response(data.map((v) => JSON.stringify(v)).join('\n')),
      )
      await expect(client.results(batch, ['offer_1'])).rejects.toMatchObject({
        code: 'format',
      })
    },
  )
  it('does not download results for a nonterminal batch', async () => {
    const { client, fetcher } = fakeClient(async () => json({}))
    await expect(
      client.results({ ...batch, status: 'in_progress' }, []),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reads a refusal, an incomplete response or a text that is not one content like a single call, keeping the usage', () => {
    for (const kind of ['refusal', 'incomplete', 'text_count']) {
      const value = line()
      const body = value.response!.body as {
        status: string
        output: { type: string; content: { type: string; text: string }[] }[]
      }
      if (kind === 'refusal') body.output[0]!.content[0]!.type = 'refusal'
      if (kind === 'incomplete') body.status = 'incomplete'
      if (kind === 'text_count')
        body.output[0]!.content.push({ ...body.output[0]!.content[0]! })
      const outcome = itemOutcome(value, batch)
      if (kind === 'text_count')
        expect(outcome).toEqual({
          kind: 'end',
          end: { state: 'failed', cause: 'no_content' },
          usage: { inputTokens: 100, outputTokens: 20 },
          responseId: 'resp_test',
          notCharged: false,
        })
      else
        expect(outcome).toEqual({
          kind: 'response',
          response: {
            outcome: kind === 'refusal' ? 'refused' : 'incomplete',
            text: null,
            usage: { inputTokens: 100, outputTokens: 20 },
            responseId: 'resp_test',
          },
        })
    }
  })
  it('reads a completed response; invalid usage leaves the cost unknown', () => {
    expect(itemOutcome(line(), batch)).toEqual({
      kind: 'response',
      response: {
        outcome: 'completed',
        text: '{"summary":"Ocena"}',
        usage: { inputTokens: 100, outputTokens: 20 },
        responseId: 'resp_test',
      },
    })
    const value = line()
    ;(
      value.response!.body as { usage: { input_tokens: number } }
    ).usage.input_tokens = -1
    expect(itemOutcome(value, batch)).toMatchObject({
      response: { usage: { inputTokens: null, outputTokens: 20 } },
    })
  })
  it('tells a missing result from a valid one, charging nothing only when the provider charges nothing', () => {
    expect(itemOutcome(undefined, batch)).toMatchObject({
      kind: 'end',
      end: { state: 'failed', cause: 'unknown' },
      notCharged: false,
    })
    expect(
      itemOutcome(undefined, {
        ...batch,
        status: 'failed',
        output_file_id: null,
      }),
    ).toMatchObject({ kind: 'end', notCharged: true })
    expect(
      itemOutcome(
        { custom_id: 'offer_1', error: { code: 'batch_expired' } },
        batch,
      ),
    ).toMatchObject({ kind: 'end', notCharged: true })
    expect(
      itemOutcome({ custom_id: 'offer_1', error: { code: 'failed' } }, batch),
    ).toMatchObject({ kind: 'end', notCharged: false })
    expect(
      itemOutcome(
        { custom_id: 'offer_1', response: { status_code: 500, body: {} } },
        batch,
      ),
    ).toMatchObject({
      kind: 'end',
      end: { state: 'failed', cause: 'http' },
      notCharged: false,
    })
  })
  it('treats cleanup 404 as already deleted and checks other deletion replies', async () => {
    const { client } = fakeClient(async () => new Response('', { status: 404 }))
    await expect(client.remove('file_deleted')).resolves.toBeUndefined()
    const other = fakeClient(async () =>
      json({ id: 'file_wrong', deleted: true }),
    ).client
    await expect(other.remove('file_deleted')).rejects.toMatchObject({
      code: 'format',
    })
    const failed = fakeClient(
      async () => new Response('', { status: 500 }),
    ).client
    await expect(failed.remove('file_deleted')).rejects.toMatchObject({
      status: 500,
    })
  })
})

describe('complete local batch archive', () => {
  it('archives exact input JSONL before upload, without transport credentials', async () => {
    const events: string[] = []
    const kept: unknown[][] = []
    const archive: BatchArchive = async (...args) => {
      kept.push(args)
      events.push('archive')
    }
    const fetcher = vi.fn(async () => {
      events.push('network')
      return json({ id: 'file_input' })
    })
    const client = archived('secret-test-key', fetcher, archive)
    const request = batchRequest('offer_1')
    await client.upload([request])
    expect(kept).toEqual([['input', 'request', JSON.stringify(request) + '\n']])
    expect(events).toEqual(['archive', 'network'])
    expect(JSON.stringify(kept)).not.toMatch(
      /secret-test-key|Authorization|Bearer/,
    )
  })
  it('does not upload when the durable archive cannot save the input', async () => {
    const fetcher = vi.fn(async () => json({ id: 'file_input' }))
    const client = archived('secret-test-key', fetcher, async () => {
      throw new Error('private database details')
    })
    await expect(
      client.upload([batchRequest('offer_1')]),
    ).rejects.toMatchObject({ code: 'archive' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['create', 'retrieve'] as const)(
    'preserves malformed raw %s metadata before parsing',
    async (method) => {
      const raw = ' { malformed provider metadata \n'
      const kept: unknown[][] = []
      const client = archived(
        'secret-test-key',
        async () => new Response(raw),
        async (...args) => {
          kept.push(args)
        },
      )
      await expect(
        method === 'create'
          ? client.create('file_input', 'operation_1')
          : client.retrieve('batch_test'),
      ).rejects.toMatchObject({ code: 'format' })
      expect(kept).toEqual([
        ['metadata', method === 'create' ? 'operation_1' : 'batch_test', raw],
      ])
    },
  )
  it('preserves both raw output and error files before parsing malformed output', async () => {
    const output = '  invalid-json \n'
    const error = '{"custom_id":"offer_1","error":{"code":"batch_expired"}}\n'
    const kept: unknown[][] = []
    const fetcher = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response(String(url).includes('file_error') ? error : output),
    )
    const client = archived('secret-test-key', fetcher, async (...args) => {
      kept.push(args)
    })
    await expect(
      client.results({ ...batch, error_file_id: 'file_error' }, ['offer_1']),
    ).rejects.toMatchObject({ code: 'format' })
    expect(kept).toEqual([
      ['output', 'file_output', output],
      ['error', 'file_error', error],
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(kept)).not.toMatch(
      /secret-test-key|Authorization|Bearer/,
    )
  })
  it('keeps an unarchived oversized result retryable instead of allowing terminal cleanup', async () => {
    const archive = vi.fn(async () => {})
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1))
      },
      cancel,
    })
    const client = archived(
      'secret-test-key',
      async () => new Response(stream),
      archive,
    )
    await expect(client.results(batch, ['offer_1'])).rejects.toMatchObject({
      code: 'archive',
    })
    expect(archive).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('reports archive failure as retryable rather than returning results', async () => {
    const archive = vi.fn(async () => {
      throw new Error('private DB failure')
    })
    const client = archived(
      'secret-test-key',
      async () => new Response(JSON.stringify(line()) + '\n'),
      archive,
    )
    await expect(client.results(batch, ['offer_1'])).rejects.toMatchObject({
      code: 'archive',
    })
  })
})
