import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const integration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip

// A16-R06: with the database and the queue unreachable, requesting a
// disabled source still answers as before 0mq.16, because the entry points
// check the source before they request the sync. Since nq3.5 the browser
// requests syncs only from the panel (T5-R04), so the command line is the
// entry point left to check here.
const unreachable = 'postgresql://nobody@127.0.0.1:1/none'

integration('sync requests while the queue is unavailable', () => {
  it('prints that a JobSpy portal is disabled', async () => {
    const result = await promisify(execFile)(
      'node_modules/.bin/tsx',
      ['scripts/jobspy-sync.ts', '--source', 'bayt'],
      {
        env: { ...process.env, DATABASE_URL: unreachable, JOBSPY_SOURCES: '' },
        timeout: 60_000,
      },
    ).then(
      () => ({ code: 0, stderr: '' }),
      (error: { code?: number; stderr?: string }) => ({
        code: error.code,
        stderr: error.stderr ?? '',
      }),
    )
    expect(result).toEqual({ code: 1, stderr: 'JobSpy source is disabled\n' })
  }, 60_000)
})
