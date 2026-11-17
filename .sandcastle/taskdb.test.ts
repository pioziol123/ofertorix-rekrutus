// U2-AC01 / U2-R05: every task database call goes to the database the setting names.
// A stand-in bd on PATH records its environment and arguments.
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { bdTaskDb } from './taskdb.ts'

let dir: string
let path: string | undefined

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'taskdb-')))
  writeFileSync(join(dir, 'bd'), `#!/bin/sh\nprintf '%s|%s|%s\\n' "$BEADS_DIR" "$PWD" "$*" >> "${join(dir, 'calls')}"\necho '[{"id":"t-1","title":"Task"}]'\n`)
  chmodSync(join(dir, 'bd'), 0o755)
  path = process.env.PATH
  process.env.PATH = `${dir}:${path}`
})

afterEach(() => {
  process.env.PATH = path
  rmSync(dir, { recursive: true, force: true })
})

describe('bd task database', () => {
  it('points every call at the database from the setting, run from the runner\'s copy', () => {
    const db = bdTaskDb({ repo: dir, beadsDir: '/owner/.beads' })
    assert.equal(db.show('t-1').id, 't-1')
    db.claim('t-1')
    db.update('t-1', { add: ['needs-info'], remove: ['ready-for-agent'] })
    const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n')
    assert.equal(calls.length, 3)
    for (const call of calls) assert.ok(call.startsWith(`/owner/.beads|${dir}|`), call)
    assert.match(calls[1]!, /\|update t-1 --claim$/)
    assert.match(calls[2]!, /\|update t-1 --add-label needs-info --remove-label ready-for-agent$/)
  })
})
