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
  writeFileSync(join(dir, 'bd'), `#!/bin/sh\nprintf '%s|%s|%s\\n' "$BEADS_DIR" "$PWD" "$*" >> "${join(dir, 'calls')}"\ncase "$*" in *broken*) exit 1;; esac\ncase "$*" in *--if-assignee*) [ -f "${join(dir, 'taken')}" ] && exit 13;; esac\necho '[{"id":"t-1","title":"Task"}]'\n`)
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
    const db = bdTaskDb({ repo: dir, beadsDir: '/owner/.beads', assignee: 'Runner' })
    assert.equal(db.show('t-1').id, 't-1')
    assert.equal(db.claim('t-1'), true)
    db.update('t-1', { add: ['needs-info'], remove: ['ready-for-agent'] })
    const calls = readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n')
    assert.equal(calls.length, 3)
    for (const call of calls) assert.ok(call.startsWith(`/owner/.beads|${dir}|`), call)
    assert.match(calls[1]!, /\|update t-1 --if-assignee  --assignee Runner --status in_progress$/)
    assert.match(calls[2]!, /\|update t-1 --add-label needs-info --remove-label ready-for-agent$/)
  })

  it('U4-AC02: reports a claim lost to another run as false, and other failures as errors', () => {
    const db = bdTaskDb({ repo: dir, beadsDir: '/owner/.beads', assignee: 'Runner' })
    writeFileSync(join(dir, 'taken'), '')
    assert.equal(db.claim('t-1'), false)
    assert.throws(() => db.claim('broken'))
  })
})
