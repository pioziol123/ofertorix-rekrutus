// Task uuk.4 of oferty-pracy-uuk: runs of tasks independent of each other.
// Stand-in agents finish in a fixed order; a bare repository stands in for GitHub.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { serialLane, serve } from './flow.ts'
import { type AgentTurn, type World, committingAgent, exchangeFile, world } from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const commentsOf = (id: string) => w.db.comments.filter((c) => c.id === id).map((c) => c.text).join('\n')

/**
 * Agents that each commit a file named after their branch. Each waits, up to `waitMs`, until
 * the other task's agent has started too, which only happens when both run at once; t-1
 * then finishes last. `peak` is the most agents that were ever working at the same time.
 */
function pairedAgents(waitMs: number, extra: AgentTurn = () => {}) {
  const seen = new Set<string>()
  const state = { active: 0, peak: 0 }
  const turn: AgentTurn = async (ctx) => {
    seen.add(ctx.branch)
    state.active++
    state.peak = Math.max(state.peak, state.active)
    try {
      for (let waited = 0; seen.size < 2 && waited < waitMs; waited += 10) await sleep(10)
      if (ctx.branch.startsWith('1-')) await sleep(50)
      await extra(ctx)
      committingAgent(`${ctx.branch}.txt`, `${ctx.branch}\n`)(ctx)
    } finally {
      // A turn that fails ends too; the runner then starts a new agent (oferty-pracy-5yd, ENV-R01).
      state.active--
    }
  }
  return { turn, state }
}

describe('uuk.4: runs of tasks independent of each other', () => {
  it('U4-AC01: with 2 slots two tasks run in parallel, both reach GitHub, each with its own log', async () => {
    const agents = pairedAgents(3000)
    w = world(agents.turn, ['t-1', 't-2'])
    w.runner.slots = 2
    await serve(w.runner, { stopWhenIdle: true })
    assert.equal(agents.state.peak, 2, 'both agents worked at the same time')
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.db.show('t-2').status, 'closed')
    assert.equal(exchangeFile(w, '1-task-t-1.txt'), '1-task-t-1')
    assert.equal(exchangeFile(w, '2-task-t-2.txt'), '2-task-t-2')
    const own1 = w.taskLogs.get('t-1')!.join('\n')
    const own2 = w.taskLogs.get('t-2')!.join('\n')
    assert.match(own1, /t-1: delivered/)
    assert.match(own2, /t-2: delivered/)
    assert.doesNotMatch(own1, /(^|\n)t-2:/)
    assert.doesNotMatch(own2, /(^|\n)t-1:/)
    // t-2 finished first; t-1's delivery replayed its work on top of t-2's.
    assert.match(own1, /moved [0-9a-f]{7} → [0-9a-f]{7}; replaying the work/)
  })

  it('U4-AC02: a task another run claimed first is skipped without a return', async () => {
    w = world(committingAgent(), ['t-1', 't-2'])
    w.db.lostClaims.add('t-1')
    await serve(w.runner, { stopWhenIdle: true })
    assert.match(w.logs.join('\n'), /t-1: skipped, another run claimed it first/)
    assert.equal(commentsOf('t-1'), '')
    assert.deepEqual(w.db.show('t-1').labels, ['ready-for-agent'])
    assert.deepEqual(w.db.claims, ['t-2'])
    assert.equal(w.db.show('t-2').status, 'closed')
  })

  it('U4-AC03: of two parallel tasks one is returned and the other is merged', async () => {
    const agents = pairedAgents(3000)
    w = world(agents.turn, ['t-1', 't-2'])
    w.runner.slots = 2
    w.sandboxes.gate = (_kind, worktree) => (existsSync(join(worktree, '1-task-t-1.txt')) && !existsSync(join(worktree, '2-task-t-2.txt')) ? 1 : 0)
    await serve(w.runner, { stopWhenIdle: true })
    assert.equal(agents.state.peak, 2)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.equal(w.db.show('t-2').status, 'closed')
    assert.equal(exchangeFile(w, '2-task-t-2.txt'), '2-task-t-2')
    assert.equal(exchangeFile(w, '1-task-t-1.txt'), null)
  })

  it('U4-R05: an error in one run returns that task and leaves the other run alone', async () => {
    const agents = pairedAgents(3000, (ctx) => {
      if (ctx.branch.startsWith('1-')) throw new Error('sandbox lost')
    })
    w = world(agents.turn, ['t-1', 't-2'])
    w.runner.slots = 2
    await serve(w.runner, { stopWhenIdle: true })
    // A failing agent is an environment failure: retried twice, then the task goes back.
    assert.match(commentsOf('t-1'), /The cause is the environment[\s\S]*3\. the agent's turn in the implementing agent's sandbox failed: Error: sandbox lost/)
    assert.equal(w.db.show('t-2').status, 'closed')
  })

  it('U4-AC04: with the default setting one task runs at a time', async () => {
    const agents = pairedAgents(200)
    w = world(agents.turn, ['t-1', 't-2'])
    assert.equal(w.runner.slots, 1)
    await serve(w.runner, { stopWhenIdle: true })
    assert.equal(agents.state.peak, 1)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.db.show('t-2').status, 'closed')
  })

  it('--once stops when no task is ready instead of polling', async () => {
    w = world(committingAgent(), [])
    await serve(w.runner, { maxTasks: 1 })
    assert.equal(w.pauses, 0)
    assert.deepEqual(w.db.claims, [])
  })

  it('--once runs one task and stops even when more are ready', async () => {
    w = world(committingAgent(), ['t-1', 't-2'])
    await serve(w.runner, { maxTasks: 1 })
    assert.deepEqual(w.db.claims, ['t-1'])
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.db.show('t-2').status, 'open')
  })

  it('U4-R05: a failure while selecting a task does not stop the running tasks', async () => {
    const agents = pairedAgents(300)
    w = world(agents.turn, ['t-1', 't-2'])
    w.runner.slots = 2
    const show = w.db.show
    let failed = false
    w.db.show = (id: string) => {
      if (id === 't-2' && !failed) {
        failed = true
        throw new Error('bd is busy')
      }
      return show(id)
    }
    await serve(w.runner, { stopWhenIdle: true })
    assert.match(w.logs.join('\n'), /selecting a task failed; trying again after the pause: bd is busy/)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(w.db.show('t-2').status, 'closed')
  })
})

describe('delivery queue', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it('U4-R04: runs operations one at a time, in the order they arrive', async () => {
    const lane = serialLane()
    const events: string[] = []
    const op = (name: string, ms: number) => lane.run(async () => {
      events.push(`start ${name}`)
      await sleep(ms)
      events.push(`end ${name}`)
      return name
    })
    const results = await Promise.all([op('a', 30), op('b', 5), op('c', 1)])
    assert.deepEqual(results, ['a', 'b', 'c'])
    assert.deepEqual(events, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c'])
  })

  it('keeps going after a failed operation', async () => {
    const lane = serialLane()
    await assert.rejects(lane.run(() => {
      throw new Error('push failed')
    }))
    assert.equal(await lane.run(() => 'next'), 'next')
  })
})
