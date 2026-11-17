import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

// Native fetch has a headers deadline unsuitable for quiet local inference.
// This client waits for the complete response until an explicit caller abort.
export const localFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported local protocol')
  return await new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        signal: init?.signal ?? undefined,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('error', reject)
        response.on('end', () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(response.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          const status = response.statusCode ?? 500
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
              { status, headers },
            ),
          )
        })
      },
    )
    request.on('error', reject)
    request.end(typeof init?.body === 'string' ? init.body : undefined)
  })
}
