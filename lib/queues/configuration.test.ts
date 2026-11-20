import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readQueueConfiguration } from './configuration.ts'

async function file(content: string) {
  const path = join(await mkdtemp(join(tmpdir(), 'queues-')), 'queues.json')
  await writeFile(path, content)
  return path
}

describe('queue configuration (B1-R04, B1-AC03)', () => {
  it('reads the settings of each queue; an absent setting stays absent', async () => {
    const path = await file(
      JSON.stringify({
        a: {},
        b: {
          attempts: 1,
          retryDelaySeconds: 0,
          retryBackoff: true,
          timeLimitSeconds: 86_400,
          waitingRetentionSeconds: 1,
          finishedRetentionSeconds: 0,
        },
      }),
    )
    expect(readQueueConfiguration(path)).toEqual({
      a: {},
      b: {
        attempts: 1,
        retryDelaySeconds: 0,
        retryBackoff: true,
        timeLimitSeconds: 86_400,
        waitingRetentionSeconds: 1,
        finishedRetentionSeconds: 0,
      },
    })
  })

  it('refuses a file that cannot be read or parsed, naming it', async () => {
    const missing = join(tmpdir(), 'no-such-dir', 'queues.json')
    expect(() => readQueueConfiguration(missing)).toThrow(
      `Queue configuration ${missing} cannot be read`,
    )
    const broken = await file('{ "a": ')
    expect(() => readQueueConfiguration(broken)).toThrow(
      `Queue configuration ${broken} is not valid JSON`,
    )
    const list = await file('[]')
    expect(() => readQueueConfiguration(list)).toThrow('must be a JSON object')
  })

  it.each([
    [
      { q: { retries: 2 } },
      'queue "q", field "retries" is not a known setting',
    ],
    [
      { q: { attempts: -1 } },
      'queue "q", field "attempts" must be an integer ≥ 1',
    ],
    [
      { q: { attempts: 0 } },
      'queue "q", field "attempts" must be an integer ≥ 1',
    ],
    [{ q: { attempts: 1.5 } }, 'queue "q", field "attempts"'],
    [{ q: { retryDelaySeconds: -1 } }, 'queue "q", field "retryDelaySeconds"'],
    [{ q: { retryBackoff: 'yes' } }, 'queue "q", field "retryBackoff"'],
    [
      { q: { timeLimitSeconds: 86_401 } },
      'queue "q", field "timeLimitSeconds"',
    ],
    [
      { q: { waitingRetentionSeconds: 0 } },
      'queue "q", field "waitingRetentionSeconds"',
    ],
    [
      { q: { finishedRetentionSeconds: '1' } },
      'queue "q", field "finishedRetentionSeconds"',
    ],
    [{ q: 3 }, 'queue "q" must be an object'],
  ])('refuses %j naming the queue and the field', async (content, message) => {
    const path = await file(JSON.stringify(content))
    expect(() => readQueueConfiguration(path)).toThrow(message)
  })
})
