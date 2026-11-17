import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  BatchClient,
  BatchError,
  batchFailure,
  batchRequest,
  readBatchResponse,
  terminal,
  type Batch,
  type BatchLine,
  type BatchArchive,
} from '../lib/matching/batch.ts'
import type { AiConfiguration } from '../modules/ai/index.ts'
import type { MatchingInput } from '../lib/matching/model.ts'

const config: AiConfiguration = {
  model: 'test-model',
  version: 'v1',
  inputUsdPerMillion: '1',
  outputUsdPerMillion: '4',
  usdPln: '4',
  fxVersion: 'test',
  maxInputTokens: 100000,
  maxOutputTokens: 500,
}
const input: MatchingInput = {
  profile: 'PHP',
  offer: 'PHP',
  criteria: [],
  checks: [],
}
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
    const request = batchRequest('offer_1', input, config)
    expect(request).toMatchObject({
      custom_id: 'offer_1',
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: 'test-model',
        store: false,
        tools: [],
        max_output_tokens: 500,
        text: { format: { type: 'json_schema', strict: true } },
      },
    })
    expect(JSON.stringify(request)).not.toContain('secret-test-key')
    expect(() => batchRequest('../escape', input, config)).toThrow()
    expect(() =>
      batchRequest('offer', input, { ...config, maxInputTokens: 10 }),
    ).toThrow(BatchError)
  })
  it('accepts 200 criteria and rejects 201 before preparing a paid operation', () => {
    const criteria = Array.from({ length: 200 }, (_, i) => ({
      id: `criterion_${i}`,
      group: 'technologies' as const,
      label: 'PHP',
      unknown: true,
    }))
    expect(() =>
      batchRequest(
        'offer',
        { ...input, criteria },
        { ...config, maxInputTokens: 1000000 },
      ),
    ).not.toThrow()
    expect(() =>
      batchRequest(
        'offer',
        { ...input, criteria: [...criteria, { ...criteria[0]!, id: 'extra' }] },
        { ...config, maxInputTokens: 1000000 },
      ),
    ).toThrow(BatchError)
  })
  it('uploads multipart batch purpose with newline-terminated JSONL and expiration', async () => {
    const { client, fetcher } = fakeClient(async () =>
      json({ id: 'file_input' }),
    )
    const request = batchRequest('offer_1', input, config)
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
    const request = batchRequest('one', input, config)
    for (const requests of [
      [],
      [request, request],
      [request, batchRequest('two', input, { ...config, model: 'other' })],
      Array.from({ length: 101 }, (_, i) =>
        batchRequest(`offer_${i}`, input, config),
      ),
    ]) {
      await expect(client.upload(requests)).rejects.toBeInstanceOf(BatchError)
    }
    const huge = batchRequest(
      'huge',
      { ...input, offer: 'x'.repeat(2100000) },
      { ...config, maxInputTokens: 3000000 },
    )
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
  it.each(['network', 'http', 'format', 'limit'] as const)(
    'persists only the allowlisted %s code and valid HTTP status',
    (code) => {
      const error = new BatchError(code, 403)
      error.message = 'secret-test-key private CV provider body'
      expect(batchFailure('Upload failed.', error)).toBe(
        `Upload failed. [Batch: ${code}${code === 'http' ? '; HTTP 403' : ''}]`,
      )
    },
  )
  it.each([null, 99, 600, 403.5, NaN, Infinity, '403'])(
    'omits invalid HTTP status %s',
    (status) => {
      const error = new BatchError('http')
      Object.assign(error, { status })
      expect(batchFailure('Upload failed.', error)).toBe(
        'Upload failed. [Batch: http]',
      )
    },
  )
  it.each([100, 599])('accepts HTTP status boundary %s', (status) => {
    expect(batchFailure('Upload failed.', new BatchError('http', status))).toBe(
      `Upload failed. [Batch: http; HTTP ${status}]`,
    )
  })
  it('classifies validation errors and rejects untrusted error messages and codes', () => {
    const invalid = z.string().safeParse({ privateCV: 'secret-test-key' })
    expect(batchFailure('Upload failed.', invalid.error)).toBe(
      'Upload failed. [Batch: format]',
    )
    const forged = new BatchError('http', 403)
    Object.assign(forged, { code: 'secret-test-key private CV' })
    for (const error of [
      forged,
      new Error('secret-test-key private CV'),
      { code: 'http', status: 403, message: 'secret-test-key private CV' },
      'secret-test-key private CV',
      null,
      undefined,
    ]) {
      expect(batchFailure('Upload failed.', error)).toBe(
        'Upload failed. [Batch: unknown]',
      )
    }
  })
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
  it('retains usage for refusal, incomplete or invalid JSON without publishing assessment', () => {
    for (const kind of ['refusal', 'incomplete', 'json', 'text_count']) {
      const value = line()
      const body = value.response!.body as {
        status: string
        output: { type: string; content: { type: string; text: string }[] }[]
      }
      if (kind === 'refusal') body.output[0]!.content[0]!.type = 'refusal'
      if (kind === 'incomplete') body.status = 'incomplete'
      if (kind === 'json')
        body.output[0]!.content[0]!.text = 'private-provider-body-not-json'
      if (kind === 'text_count')
        body.output[0]!.content.push({ ...body.output[0]!.content[0]! })
      expect(readBatchResponse(value)).toEqual({
        id: 'resp_test',
        usage: { input_tokens: 100, output_tokens: 20 },
        assessment: null,
        diagnostic: `response_${kind}`,
      })
    }
  })
  it('parses completed assessment and rejects failed responses or invalid usage', () => {
    expect(readBatchResponse(line())).toMatchObject({
      assessment: { summary: 'Ocena' },
      diagnostic: null,
    })
    expect(() =>
      readBatchResponse({ custom_id: 'offer', error: { code: 'failed' } }),
    ).toThrow()
    const value = line()
    ;(
      value.response!.body as { usage: { input_tokens: number } }
    ).usage.input_tokens = -1
    expect(() => readBatchResponse(value)).toThrow()
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
    const client = new BatchClient('secret-test-key', fetcher, archive)
    const request = batchRequest('offer_1', input, config)
    await client.upload([request])
    expect(kept).toEqual([['input', 'request', JSON.stringify(request) + '\n']])
    expect(events).toEqual(['archive', 'network'])
    expect(JSON.stringify(kept)).not.toMatch(
      /secret-test-key|Authorization|Bearer/,
    )
  })
  it('does not upload when the durable archive cannot save the input', async () => {
    const fetcher = vi.fn(async () => json({ id: 'file_input' }))
    const client = new BatchClient('secret-test-key', fetcher, async () => {
      throw new Error('private database details')
    })
    await expect(
      client.upload([batchRequest('offer_1', input, config)]),
    ).rejects.toMatchObject({ code: 'archive' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['create', 'retrieve'] as const)(
    'preserves malformed raw %s metadata before parsing',
    async (method) => {
      const raw = ' { malformed provider metadata \n'
      const kept: unknown[][] = []
      const client = new BatchClient(
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
    const client = new BatchClient(
      'secret-test-key',
      fetcher,
      async (...args) => {
        kept.push(args)
      },
    )
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
    const client = new BatchClient(
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
    const client = new BatchClient(
      'secret-test-key',
      async () => new Response(JSON.stringify(line()) + '\n'),
      archive,
    )
    await expect(client.results(batch, ['offer_1'])).rejects.toMatchObject({
      code: 'archive',
    })
    expect(batchFailure('Read failed.', new BatchError('archive'))).toBe(
      'Read failed. [Batch: archive]',
    )
  })
})
