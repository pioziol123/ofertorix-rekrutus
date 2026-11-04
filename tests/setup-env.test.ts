import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

function runSetup() {
  const directory = mkdtempSync(join(tmpdir(), 'oferty-env-'))
  temporaryDirectories.push(directory)
  mkdirSync(join(directory, 'scripts'))
  const script = join(directory, 'scripts/setup-env.mjs')
  copyFileSync(new URL('../scripts/setup-env.mjs', import.meta.url), script)
  return {
    envPath: join(directory, '.env'),
    run: () =>
      execFileSync(process.execPath, [script], {
        cwd: tmpdir(),
        encoding: 'utf8',
      }),
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('local environment setup', () => {
  it('creates a private environment beside the project script, regardless of working directory', () => {
    const first = runSetup()
    const second = runSetup()
    first.run()
    second.run()

    expect(readFileSync(first.envPath, 'utf8')).toMatch(
      /^POSTGRES_PASSWORD=[a-f0-9]{48}\nWEB_PORT=3100\n$/,
    )
    expect(readFileSync(first.envPath, 'utf8')).not.toEqual(
      readFileSync(second.envPath, 'utf8'),
    )
    expect(statSync(first.envPath).mode & 0o777).toBe(0o600)
  })

  it('preserves an existing password and custom configuration on rerun', () => {
    const setup = runSetup()
    const existing =
      'POSTGRES_PASSWORD=already-configured\nWEB_PORT=4567\nCUSTOM=value\n'
    writeFileSync(setup.envPath, existing, { mode: 0o600 })

    setup.run()
    setup.run()

    expect(readFileSync(setup.envPath, 'utf8')).toBe(existing)
  })
})
