// Task uuk.2 of oferty-pracy-uuk: the runner in its own copy, exchange through GitHub.
// A bare repository stands in for GitHub; no network is used (W-AC02).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { cycle, preview } from './flow.ts'
import {
  type World,
  committingAgent,
  exchangeFile,
  exchangeMain,
  pushFiles,
  sh,
  snapshot,
  world,
  writeFile,
} from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

/** Leaves the owner's copy with another branch, an unpushed commit and uncommitted changes. */
function busyOwner(): void {
  sh(w.owner, 'switch', '--quiet', '-c', 'owner-work')
  writeFile(w.owner, 'notes.md', 'unpushed\n')
  sh(w.owner, 'add', 'notes.md')
  sh(w.owner, 'commit', '--quiet', '-m', 'owner: unpushed')
  writeFile(w.owner, 'README.md', 'owner edit, not committed\n')
  writeFile(w.owner, 'scratch.txt', 'untracked\n')
}

const commentsOf = (id: string) => w.db.comments.filter((c) => c.id === id).map((c) => c.text).join('\n')

describe('uuk.2: runner in its own copy', () => {
  it('U2-AC01: delivers to the exchange point whatever state the owner\'s copy is in', async () => {
    w = world()
    busyOwner()
    assert.equal(await cycle(w.runner), true)
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.match(w.db.closed[0]!.reason, /to main on GitHub at [0-9a-f]{7}/)
    assert.ok(w.notifications.some((n) => /is on GitHub/.test(n.title)))
    // The image is built from the fetched state of the exchange point.
    assert.deepEqual(w.images, [sh(w.exchange, 'rev-parse', 'main~1')])
  })

  it('U2-AC02: leaves branches, index and files of the owner\'s copy as they were', async () => {
    w = world()
    busyOwner()
    const before = snapshot(w.owner)
    await cycle(w.runner)
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
    assert.deepEqual(snapshot(w.owner), before)
  })

  it('U2-AC03: takes no task and logs the reason when GitHub cannot be fetched', async () => {
    w = world()
    sh(w.runnerCopy, 'remote', 'set-url', 'origin', `${w.base}/gone.git`)
    assert.equal(await cycle(w.runner), false)
    assert.deepEqual(w.db.claims, [])
    assert.match(w.logs.join('\n'), /cannot fetch main from GitHub; no task taken this cycle: .*gone\.git/)
  })

  it('U2-AC04: waits for a missing document without returning the task and takes another', async () => {
    w = world(committingAgent(), ['t-1', 't-2'])
    w.db.issues.get('t-1')!.metadata = { prd: 'docs/t-1/PRD.md', requirements: 'docs/t-1/later.md#r', sd: 'docs/t-1/sd.md' }
    assert.equal(await cycle(w.runner), true)
    assert.match(w.logs.join('\n'), /t-1: waits: documents not on main on GitHub yet: docs\/t-1\/later\.md/)
    assert.equal(w.db.show('t-1').status, 'open')
    assert.deepEqual(w.db.show('t-1').labels, ['ready-for-agent'])
    assert.equal(commentsOf('t-1'), '')
    assert.equal(w.db.show('t-2').status, 'closed')

    pushFiles(w.other, { 'docs/t-1/later.md': '# later\n' }, 'owner: push the document')
    w.sandboxes.agentTurn = committingAgent('second.txt', 'second\n')
    assert.equal(await cycle(w.runner), true)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'second.txt'), 'second')
  })

  // U2-AC05 (return on a change of GitHub during the task) is replaced by uuk.3:
  // see delivery.test.ts, U3-AC01 and U3-AC07.

  it('U2-AC06: a returned task leaves its branch on GitHub, and the merge removes it', async () => {
    w = world()
    w.sandboxes.gateExits = [1]
    await cycle(w.runner)
    const branch = sh(w.exchange, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/agent/')
    assert.match(branch, /^agent\/1-task-t-1$/)
    assert.match(commentsOf('t-1'), /The work is on GitHub on branch agent\/1-task-t-1\./)
    assert.equal(sh(w.exchange, 'show', `${branch}:feature.txt`), 'feature')

    w.db.handOffAgain('t-1')
    w.sandboxes.gateExits = [0]
    w.sandboxes.gateCalls = 0
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(sh(w.exchange, 'for-each-ref', 'refs/heads/agent/'), '')
  })

  it('U2-AC07: finishes in its own version and reports a newer program once', async () => {
    w = world(async (ctx) => {
      committingAgent(`${ctx.branch}.txt`)(ctx)
      // The newer program reaches the exchange point during the first task.
      if (!exchangeFile(w, '.sandcastle/runner.ts')?.includes('v2')) pushFiles(w.other, { '.sandcastle/runner.ts': '// runner v2\n' }, 'runner v2')
    }, ['t-1', 't-2', 't-3'])
    // The newer program arrives during t-1; it and the next tasks still run in the old version.
    assert.equal(await cycle(w.runner), true)
    assert.equal(await cycle(w.runner), true)
    assert.equal(await cycle(w.runner), true)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.db.show('t-2').status, 'closed')
    assert.equal(w.db.show('t-3').status, 'closed')
    assert.equal(w.notifications.filter((n) => n.title === 'Newer runner on GitHub').length, 1)
    assert.equal(w.logs.filter((l) => /has a newer runner program/.test(l)).length, 1)
    // The runner's program files stay at the version it started from.
    assert.equal(sh(w.runnerCopy, 'rev-parse', 'HEAD'), w.runner.startCommit)
    assert.equal(readFileSync(join(w.runnerCopy, '.sandcastle/runner.ts'), 'utf8'), '// runner v1\n')
  })

  it('ignores a write to main made from the agent\'s environment', async () => {
    w = world(async (ctx) => {
      committingAgent()(ctx)
      sh(ctx.worktree, 'update-ref', 'refs/heads/main', 'HEAD')
    })
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
  })

  it('preview writes nothing to the task database and builds no image', () => {
    w = world()
    preview(w.runner)
    assert.deepEqual(w.db.claims, [])
    assert.deepEqual(w.db.comments, [])
    assert.deepEqual(w.images, [])
  })
})
