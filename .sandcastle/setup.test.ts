// The preparing command of the runner's copy and the start settings (task uuk.2, U2-R04, U2-R05).
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { ENV_FILE, readSettings, settingsProblems, writeSettings } from './settings.ts'
import { defaultRunnerDir, prepareRunnerCopy } from './setup.ts'
import { type World, pushFiles, sh, world, writeFile } from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

function setup(dir: string) {
  const installs: string[] = []
  const result = prepareRunnerCopy({ owner: w.owner, dir, install: (programDir) => void installs.push(programDir) })
  return { result, installs }
}

describe('preparing command', () => {
  it('creates the runner\'s copy in an empty place, detached at main from GitHub, with its settings', () => {
    w = world()
    writeFile(w.owner, ENV_FILE, 'CLAUDE_CODE_OAUTH_TOKEN=secret\n')
    const dir = join(w.base, 'fresh-runner')
    const { result, installs } = setup(dir)
    assert.deepEqual(result, { ok: true, action: 'created', commit: sh(w.exchange, 'rev-parse', 'main') })
    assert.equal(sh(dir, 'rev-parse', 'HEAD'), sh(w.exchange, 'rev-parse', 'main'))
    // Not attached to a branch, so the runner may overwrite its main mirror.
    assert.throws(() => sh(dir, 'symbolic-ref', '-q', 'HEAD'))
    assert.deepEqual(installs, [join(dir, '.sandcastle')])
    assert.equal(readSettings(dir).beadsDir, join(w.owner, '.beads'))
    assert.match(readFileSync(join(dir, ENV_FILE), 'utf8'), /^CLAUDE_CODE_OAUTH_TOKEN=secret$/m)
  })

  it('updates the program when run again and keeps the settings', () => {
    w = world()
    const dir = join(w.base, 'fresh-runner')
    setup(dir)
    writeSettings(dir, { beadsDir: '/kept' })
    const v2 = pushFiles(w.other, { '.sandcastle/runner.ts': '// runner v2\n' }, 'runner v2')
    const { result } = setup(dir)
    assert.deepEqual(result, { ok: true, action: 'updated', commit: v2 })
    assert.equal(readFileSync(join(dir, '.sandcastle/runner.ts'), 'utf8'), '// runner v2\n')
    assert.equal(readSettings(dir).beadsDir, '/kept')
  })

  it('refuses to update a program with local changes', () => {
    w = world()
    const dir = join(w.base, 'fresh-runner')
    setup(dir)
    writeFile(dir, '.sandcastle/runner.ts', '// edited in place\n')
    const { result } = setup(dir)
    assert.equal(result.ok, false)
    assert.match(!result.ok ? result.error : '', /local changes[\s\S]*runner\.ts/)
  })

  it('refuses a non-empty directory that is not a runner\'s copy', () => {
    w = world()
    const dir = join(w.base, 'occupied')
    mkdirSync(dir)
    writeFileSync(join(dir, 'file'), 'x')
    assert.equal(setup(dir).result.ok, false)
  })

  it('defaults to a directory beside the owner\'s copy with the -runner suffix', () => {
    assert.equal(defaultRunnerDir('/work/oferty-pracy'), '/work/oferty-pracy-runner')
  })
})

describe('start settings', () => {
  it('refuses to start without the agent token or the task database location', () => {
    w = world()
    assert.deepEqual(settingsProblems(w.runnerCopy), [
      '.sandcastle/.env has no CLAUDE_CODE_OAUTH_TOKEN',
      '.sandcastle/runner.json with the location of the task database is missing or unreadable',
    ])
    writeFile(w.runnerCopy, ENV_FILE, 'CLAUDE_CODE_OAUTH_TOKEN=t\n')
    writeSettings(w.runnerCopy, { beadsDir: join(w.base, 'nowhere') })
    assert.deepEqual(settingsProblems(w.runnerCopy), [`the task database ${join(w.base, 'nowhere')} does not exist`])
    writeSettings(w.runnerCopy, { beadsDir: w.base })
    assert.deepEqual(settingsProblems(w.runnerCopy), [])
  })
})
