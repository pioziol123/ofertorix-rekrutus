import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

// The worker image supplies the pinned Python dependencies used in production.
// Opt in on hosts with JOBSPY_PYTHON; enabled automatically inside that image.
const python = process.env.JOBSPY_PYTHON
it.skipIf(!python)(
  'passes offline Python portal parsing and bounded transport tests',
  async () => {
    const { stderr } = await promisify(execFile)(
      python!,
      ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_polish*.py'],
      { timeout: 30_000 },
    )
    expect(stderr).toContain('OK')
  },
  35_000,
)
