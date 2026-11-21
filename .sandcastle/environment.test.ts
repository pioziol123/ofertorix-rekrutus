// Task 5yd.3 of oferty-pracy-5yd: the runner retries after an environment failure.
// A bare repository stands in for GitHub; the task database, sandboxes and agents are stand-ins.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { START_FRESH } from './continuation.ts'
import { cycle, RESULT_FILE } from './flow.ts'
import { type AgentTurn, type World, committingAgent, doneResult, exchangeFile, sh, snapshot, world, writeFile } from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

const comments = () => w.db.comments.filter((c) => c.id === 't-1').map((c) => c.text)
const taskLog = () => w.taskLogs.get('t-1')!.join('\n')
const answer = (ctx: Parameters<AgentTurn>[0]) => writeFile(ctx.worktree, RESULT_FILE, JSON.stringify(doneResult()))

/** Makes the first `times` openings of a fresh sandbox fail, as a Docker that cannot start a container. */
function failFreshOpenings(times: number, message = 'docker: Error response from daemon: cannot start container'): () => number {
  const open = w.sandboxes.fresh.bind(w.sandboxes)
  let calls = 0
  w.sandboxes.fresh = async (branch) => {
    if (calls++ < times) throw new Error(`${message} (${calls})`)
    return open(branch)
  }
  return () => calls
}

describe('5yd.3: retry after an environment failure', () => {
  it('resumes a returned attempt in its retained worktree, preserving tracked and untracked changes', async () => {
    let retained = ''
    let failures = 0
    w = world((ctx) => {
      retained = ctx.worktree
      failures++
      writeFile(ctx.worktree, 'README.md', 'unfinished tracked work\n')
      writeFile(ctx.worktree, 'draft.txt', 'unfinished new file\n')
      throw new Error('agent timeout')
    })
    await cycle(w.runner)
    assert.equal(failures, 3)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))

    let resumed = false
    w.db.handOffAgain('t-1')
    w.sandboxes.agentTurn = (ctx) => {
      resumed = true
      assert.equal(ctx.worktree, retained)
      assert.equal(readFileSync(join(ctx.worktree, 'README.md'), 'utf8'), 'unfinished tracked work\n')
      assert.equal(readFileSync(join(ctx.worktree, 'draft.txt'), 'utf8'), 'unfinished new file\n')
      sh(ctx.worktree, 'add', 'README.md', 'draft.txt')
      sh(ctx.worktree, 'commit', '--quiet', '-m', 'finish retained work')
      answer(ctx)
    }
    await cycle(w.runner)

    assert.equal(resumed, true, 'the next attempt reaches the agent')
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'README.md'), 'unfinished tracked work')
    assert.equal(exchangeFile(w, 'draft.txt'), 'unfinished new file')
  })

  for (const scenario of ['different retained commit', 'start-fresh'] as const) {
    it(`does not reset or remove retained work when resuming with ${scenario}`, async () => {
      let retained = ''
      w = world((ctx) => {
        retained = ctx.worktree
        writeFile(ctx.worktree, 'README.md', 'unfinished tracked work\n')
        writeFile(ctx.worktree, 'draft.txt', 'unfinished new file\n')
        throw new Error('agent timeout')
      })
      await cycle(w.runner)
      assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
      if (scenario === 'different retained commit') {
        writeFile(retained, 'local.txt', 'local commit after return\n')
        sh(retained, 'add', 'local.txt')
        sh(retained, 'commit', '--quiet', '-m', 'local work after return')
      } else {
        w.db.update('t-1', { add: [START_FRESH] })
      }
      const before = snapshot(retained)
      const opens = w.sandboxes.warmOpens
      w.db.handOffAgain('t-1')
      w.sandboxes.agentTurn = committingAgent()
      await cycle(w.runner)

      assert.equal(w.sandboxes.warmOpens, opens, 'the unsafe attempt never opens a sandbox')
      assert.deepEqual(snapshot(retained), before, 'the branch, index and all working files survive')
      assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
      assert.match(comments().at(-1)!, /Cannot prepare task branch/)
      assert.match(comments().at(-1)!, /Existing work was not reset or removed/)
    })
  }

  it('ENV-AC01: the agent fails in the first turn: a new agent in a new sandbox on the same work directory finds the uncommitted file and delivers', async () => {
    const seen: { worktree: string; turn: number; prompt: string; draft: boolean }[] = []
    w = world((ctx) => {
      seen.push({ worktree: ctx.worktree, turn: ctx.turn, prompt: ctx.prompt, draft: existsSync(join(ctx.worktree, 'draft.txt')) })
      if (seen.length === 1) {
        writeFile(ctx.worktree, 'draft.txt', 'draft\n')
        throw new Error('claude exited with code 137\nstack of the CLI')
      }
      sh(ctx.worktree, 'add', 'draft.txt')
      sh(ctx.worktree, 'commit', '--quiet', '-m', 'agent: draft.txt')
      answer(ctx)
    })
    await cycle(w.runner)

    assert.equal(w.sandboxes.warmOpens, 2, 'a new sandbox was opened')
    assert.equal(seen.length, 2)
    assert.equal(seen[1]!.worktree, seen[0]!.worktree, 'on the same work directory')
    assert.equal(seen[1]!.turn, 1, 'a new agent, not a resumed session')
    assert.equal(seen[1]!.draft, true, "the failed agent's uncommitted file is still there")
    assert.match(seen[1]!.prompt, /Use the implement-task skill\./)
    assert.match(seen[1]!.prompt, /The previous agent of this attempt stopped on an environment failure, not because of the task: the agent's turn in the implementing agent's sandbox failed: Error: claude exited with code 137\n/)
    assert.doesNotMatch(seen[1]!.prompt, /stack of the CLI/, 'only the first line of the failure')
    assert.match(taskLog(), /environment failure 1, retry 1 of 2 \(not a feedback turn\)/)
    assert.doesNotMatch(taskLog(), /feedback turn \d/)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'draft.txt'), 'draft')
  })

  it('ENV-AC02: the gate\'s fresh sandbox fails to open: the gate runs again in a new fresh sandbox, and no feedback turn is used', async () => {
    w = world(committingAgent())
    const calls = failFreshOpenings(1)
    await cycle(w.runner)

    assert.equal(calls(), 2, 'a second fresh sandbox was opened')
    assert.equal(w.sandboxes.events.filter((e) => e === 'gate:fresh').length, 1, 'the gate ran in the new fresh sandbox')
    assert.equal(w.sandboxes.prompts.length, 1, 'no feedback turn went to the agent')
    assert.doesNotMatch(taskLog(), /feedback turn \d/)
    assert.match(taskLog(), /environment failure 1, retry 1 of 2 \(not a feedback turn\): opening the fresh sandbox of the gate and the review failed/)
    assert.match(taskLog(), /repeating the check in a new fresh sandbox/)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('ENV-AC03: a third environment failure in one attempt, in either kind of sandbox: the task is returned, naming the environment and quoting all three', async () => {
    let turns = 0
    w = world((ctx) => {
      if (++turns === 1) throw new Error('claude: connection reset')
      committingAgent()(ctx)
    })
    failFreshOpenings(2)
    await cycle(w.runner)

    const task = w.db.show('t-1')
    assert.ok(task.labels?.includes('needs-info'))
    assert.notEqual(task.status, 'closed')
    const comment = comments().at(-1)!
    assert.match(comment, /^Runner returned the task\. The cause is the environment, not the task: the sandboxes failed 3 times in this attempt/)
    assert.match(comment, /1\. the agent's turn in the implementing agent's sandbox failed: Error: claude: connection reset/)
    assert.match(comment, /2\. opening the fresh sandbox of the gate and the review failed: Error: docker: Error response from daemon: cannot start container \(1\)/)
    assert.match(comment, /3\. opening the fresh sandbox of the gate and the review failed: Error: docker: Error response from daemon: cannot start container \(2\)/)
    assert.match(taskLog(), /environment failure 3, no retry left/)
    assert.doesNotMatch(taskLog(), /feedback turn \d/)
    // The kept work goes to GitHub as with every return.
    assert.match(comment, /The work is on GitHub on branch agent\/1-task-t-1\./)
  })

  it('ENV-AC04: a failed gate and a failed review are not environment failures: with two environment failures as well, the task is delivered', async () => {
    let turns = 0
    w = world((ctx) => {
      turns++
      if (turns === 1) throw new Error('claude exited with code 1')
      if (turns === 2) return committingAgent()(ctx)
      if (turns === 4) w.sandboxes.verdict = 'pass'
      answer(ctx)
    })
    w.sandboxes.gateExits = [1, 0]
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: a finding']
    failFreshOpenings(1)
    await cycle(w.runner)

    assert.match(taskLog(), /feedback turn 1: scripts\/gate\.sh failed in your sandbox/)
    assert.match(taskLog(), /feedback turn 2: The spec review failed/)
    assert.equal((taskLog().match(/environment failure \d/g) ?? []).length, 2)
    assert.equal(w.db.show('t-1').status, 'closed', 'two environment failures and two failed checks still leave the attempt going')
  })

  it('ENV-AC04: an error of the task database is not an environment failure: the task is returned at once, without a retry', async () => {
    w = world(committingAgent())
    w.db.update('t-1', { add: [START_FRESH] })
    const update = w.db.update.bind(w.db)
    w.db.update = (id, change) => {
      if (change.remove?.includes(START_FRESH)) throw new Error('bd: database is locked')
      update(id, change)
    }
    await cycle(w.runner)

    assert.equal(w.sandboxes.warmOpens, 0, 'no sandbox was opened again for it')
    const comment = comments().at(-1)!
    assert.match(comment, /^Runner returned the task\. The runner stopped the attempt on an error: Error: bd: database is locked/)
    assert.doesNotMatch(comment, /environment/)
    assert.doesNotMatch(taskLog(), /environment failure/)
  })

  it('ENV-R02: the new agent after a failure in a feedback turn receives the last review report of the attempt', async () => {
    let turns = 0
    w = world((ctx) => {
      turns++
      if (turns === 1) return committingAgent()(ctx)
      if (turns === 2) throw new Error('container killed')
      w.sandboxes.verdict = 'pass'
      answer(ctx)
    })
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept the old header']
    await cycle(w.runner)

    const retry = w.sandboxes.prompts.at(-1)!
    assert.match(retry, /stopped on an environment failure, not because of the task: the agent's turn in the implementing agent's sandbox failed: Error: container killed/)
    assert.match(retry, /The last review report of this attempt:\nVerdict: "fail"\n- F1: kept the old header/)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('ASM-2: a feedback turn the environment interrupts is given back, so the retry costs no feedback turn', async () => {
    let turns = 0
    w = world((ctx) => {
      turns++
      if (turns === 1) return committingAgent()(ctx)
      if (turns === 2 || turns === 4) throw new Error('container killed')
      if (turns === 5) w.sandboxes.verdict = 'pass'
      answer(ctx)
    })
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: a finding']
    await cycle(w.runner)

    assert.equal((taskLog().match(/feedback turn 1:/g) ?? []).length, 2, 'the interrupted turn 1 was sent again as turn 1')
    assert.doesNotMatch(taskLog(), /feedback turn 2:/)
    assert.equal((taskLog().match(/environment failure \d/g) ?? []).length, 2)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('ASM-1: closing the agent\'s sandbox fails after delivery: the task stays delivered and the failure is only logged', async () => {
    w = world(committingAgent())
    const open = w.sandboxes.warm.bind(w.sandboxes)
    w.sandboxes.warm = async (branch) => {
      const sandbox = await open(branch)
      return {
        ...sandbox,
        close: async () => {
          await sandbox.close()
          throw new Error('docker rm: container is busy')
        },
      }
    }
    await cycle(w.runner)

    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'feature.txt'), 'feature')
    assert.equal(comments().filter((c) => c.startsWith('Runner returned the task.')).length, 0)
    assert.match(taskLog(), /closing a sandbox failed, ignored: EnvironmentFailure: closing the implementing agent's sandbox failed: Error: docker rm: container is busy/)
    assert.doesNotMatch(taskLog(), /environment failure \d/)
  })

  it('keeps a worktree with uncommitted files when the sandbox closes, as Sandcastle does', async () => {
    w = world(committingAgent())
    sh(w.runnerCopy, 'branch', 'wip')
    const sandbox = await w.sandboxes.warm('wip')
    writeFile(sandbox.worktreePath, 'wip.txt', 'wip\n')
    await sandbox.close()
    const again = await w.sandboxes.warm('wip')
    assert.equal(again.worktreePath, sandbox.worktreePath)
    assert.equal(readFileSync(join(again.worktreePath, 'wip.txt'), 'utf8'), 'wip\n')
  })
})
