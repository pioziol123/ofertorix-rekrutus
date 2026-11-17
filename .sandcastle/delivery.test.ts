// Task uuk.3 of oferty-pracy-uuk: delivery with a changing exchange point.
// A bare repository stands in for GitHub; another clone pushes the other party's changes
// between the runner's steps. No network is used (W-AC02).
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { cycle } from './flow.ts'
import { RESULT_FILE } from './flow.ts'
import {
  type AgentTurn,
  type World,
  committingAgent,
  doneResult,
  exchangeFile,
  exchangeMain,
  pushFiles,
  sh,
  world,
  writeFile,
} from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

const commentsOf = (id: string) => w.db.comments.filter((c) => c.id === id).map((c) => c.text).join('\n')
const freshGates = () => w.sandboxes.events.filter((e) => e === 'gate:fresh').length

/** The agent's first turn commits feature.txt, then `during` changes GitHub; later turns only answer. */
function agent(during: () => void = () => {}, later: AgentTurn = ({ worktree }) => writeFile(worktree, RESULT_FILE, JSON.stringify(doneResult()))): AgentTurn {
  return async (ctx) => {
    if (ctx.turn > 1) return later(ctx)
    committingAgent()(ctx)
    during()
  }
}

describe('uuk.3: delivery with a changing exchange point', () => {
  it('U3-AC01: puts the work on top of a commit pushed during the task, repeats the gate and keeps both', async () => {
    let theirs = ''
    w = world(agent(() => {
      theirs = pushFiles(w.other, { 'owner.txt': 'owner\n' }, 'owner: pushed during the task')
    }))
    assert.equal(await cycle(w.runner), true)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
    assert.equal(exchangeFile(w, 'owner.txt'), 'owner')
    assert.equal(sh(w.exchange, 'rev-parse', 'main~1'), theirs, 'the work sits on top of the other commit, history linear')
    assert.equal(freshGates(), 2, 'the gate ran again after the work was replayed')
  })

  it('U3-AC02: a change between the fetch and the push rejects the first delivery and the retry succeeds', async () => {
    let pushes = 0
    w = world(agent(() => void pushFiles(w.other, { 'a.txt': 'a\n' }, 'other: a')))
    // The gate after the first replay runs between the delivery's fetch and its push.
    w.sandboxes.gate = (kind) => {
      if (kind === 'fresh' && freshGates() === 2 && pushes++ === 0) pushFiles(w.other, { 'b.txt': 'b\n' }, 'other: b')
      return 0
    }
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    for (const file of ['a.txt', 'b.txt', 'feature.txt']) assert.ok(exchangeFile(w, file), file)
    assert.equal(freshGates(), 3)
    assert.match(w.logs.join('\n'), /retry 2 of 5/)
  })

  it('U3-AC03: a change of a task document runs the review again; another change repeats only the gate', async () => {
    w = world(agent(() => void pushFiles(w.other, { 'docs/t-1/sd.md': '# SD v2\n' }, 'owner: sd v2')))
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.sandboxes.reviews, 2)
    w.cleanup()

    w = world(agent(() => void pushFiles(w.other, { 'owner.txt': 'owner\n' })))
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.sandboxes.reviews, 1)
    assert.equal(freshGates(), 2)
  })

  it('U3-AC04: a conflict goes back to the agent with the files and commits, and the corrected work is delivered', async () => {
    let theirs = ''
    let mainDuringFix = ''
    w = world(agent(
      () => {
        theirs = pushFiles(w.other, { 'feature.txt': 'theirs\n' }, 'owner: conflicting feature')
      },
      ({ worktree, prompt }) => {
        mainDuringFix = exchangeMain(w)
        const onto = prompt.match(/git rebase ([0-9a-f]{40})/)![1]!
        sh(worktree, 'reset', '--quiet', '--hard', onto)
        writeFile(worktree, 'feature.txt', 'theirs + feature\n')
        sh(worktree, 'commit', '--quiet', '-am', 'agent: resolve the conflict')
        writeFile(worktree, RESULT_FILE, JSON.stringify(doneResult()))
      },
    ))
    await cycle(w.runner)
    assert.equal(mainDuringFix, theirs, 'nothing reached GitHub before the correction')
    const report = w.sandboxes.prompts[1]!
    assert.match(report, /Conflicting files:\n- feature\.txt/)
    assert.match(report, new RegExp(`${theirs.slice(0, 7)} owner: conflicting feature`))
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'feature.txt'), 'theirs + feature')
  })

  it('U3-AC05: a gate that fails after the replay is a feedback turn, and a fourth turn ends with a return', async () => {
    w = world(agent(() => void pushFiles(w.other, { 'owner.txt': 'owner\n' })))
    w.sandboxes.gate = (_kind, worktree) => (existsSync(join(worktree, 'owner.txt')) ? 1 : 0)
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.length, 4, 'the first turn and three feedback turns')
    assert.match(w.sandboxes.prompts[1]!, /failed in a fresh sandbox/)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.match(commentsOf('t-1'), /Runner returned the task\. scripts\/gate\.sh failed/)
    assert.equal(exchangeFile(w, 'feature.txt'), null)
  })

  it('U3-AC06: after five delivery retries caused by changes of GitHub the task is returned with that reason', async () => {
    let n = 0
    w = world(agent(() => void pushFiles(w.other, { 'c0.txt': '0\n' })))
    w.sandboxes.gate = (kind) => {
      if (kind === 'fresh' && freshGates() >= 2) pushFiles(w.other, { [`c${++n}.txt`]: `${n}\n` })
      return 0
    }
    await cycle(w.runner)
    assert.match(commentsOf('t-1'), /changed during delivery more than 5 times/)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.equal(exchangeFile(w, 'feature.txt'), null)
    assert.equal(freshGates(), 1 + 5)
  })

  it('U3-AC07: an unreachable GitHub at delivery makes the work wait, not return, and it is delivered before a new task', async () => {
    w = world(agent(() => sh(w.runnerCopy, 'remote', 'set-url', 'origin', `${w.base}/gone.git`)), ['t-1', 't-2'])
    w.onPause = () => {
      if (w.pauses === 2) sh(w.runnerCopy, 'remote', 'set-url', 'origin', w.exchange)
    }
    assert.equal(await cycle(w.runner), true)
    assert.equal(w.pauses, 2)
    assert.match(w.logs.join('\n'), /delivery waits, GitHub is unreachable/)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(commentsOf('t-1').includes('returned'), false)
    assert.deepEqual(w.db.claims, ['t-1'], 'no new task while the delivery waited')
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
  })

  it('U3-AC08: a dependency change builds the image before the gate in a fresh sandbox', async () => {
    let theirs = ''
    w = world(agent(() => {
      theirs = pushFiles(w.other, { 'pnpm-lock.yaml': 'lock v2\n' }, 'owner: dependencies')
    }))
    await cycle(w.runner)
    assert.equal(w.db.show('t-1').status, 'closed')
    const events = w.sandboxes.events
    const built = events.indexOf(`image:${theirs}`)
    assert.ok(built > 0, events.join(' '))
    assert.equal(events.slice(built + 1).filter((e) => e === 'gate:fresh').length, 1)
  })

  it('U3-AC08: when a feedback turn is needed after the environment changed, the task is returned with that reason', async () => {
    w = world(agent(() => void pushFiles(w.other, { 'pnpm-lock.yaml': 'lock v2\n' })))
    w.sandboxes.gate = (_kind, worktree) => (existsSync(join(worktree, 'pnpm-lock.yaml')) ? 1 : 0)
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.length, 1, 'no feedback turn in the out-of-date sandbox')
    assert.match(commentsOf('t-1'), /The environment changed during the task/)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
  })
})
