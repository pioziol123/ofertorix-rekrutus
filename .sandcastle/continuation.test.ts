// Task 5yd.2 of oferty-pracy-5yd: a returned task continues the kept work.
// A bare repository stands in for GitHub; the task database, agents and reviewer are stand-ins.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { KEPT_BASE, KEPT_BRANCH, START_FRESH, parseReturnData, sinceReturn } from './continuation.ts'
import { cycle, processTask, RESULT_FILE } from './flow.ts'
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

const NOTE = { question: null, criteria: { 'T-AC01': 'met' }, remaining: ['answer F1'] }
const isNoteRequest = (prompt: string) => prompt.includes('task-state-note skill')
const returnComments = () => w.db.comments.filter((c) => c.id === 't-1' && c.text.startsWith('Runner returned the task.'))
const lastReturnData = () => {
  const parsed = parseReturnData(returnComments().at(-1)!.text)
  assert.ok(parsed && 'data' in parsed, 'the return comment carries a data block')
  return parsed.data
}

/** Writes the result file in a turn without touching the branch. */
const answer = (result: object): AgentTurn => ({ worktree }) => writeFile(worktree, RESULT_FILE, JSON.stringify(result))

/**
 * First attempt: commits kept.txt, then the reviewer fails it with finding F1 in every round
 * until the feedback turns are used up; asked for a state note, the agent writes `note`.
 */
function exhaustedAttempt(note: object | null): AgentTurn {
  return (ctx) => {
    if (ctx.turn === 1) return committingAgent('kept.txt', 'kept\n')(ctx)
    if (isNoteRequest(ctx.prompt)) return note ? answer({ ...doneResult(), state_note: note })(ctx) : undefined
    return answer(doneResult())(ctx)
  }
}

/** First attempt that finishes blocked at once with a state note, keeping its commit. */
function blockedAttempt(file = 'kept.txt', content = 'kept\n'): AgentTurn {
  return (ctx) => {
    committingAgent(file, content)(ctx)
    answer({ ...doneResult(), status: 'blocked', question: 'Which reading?', state_note: NOTE })(ctx)
  }
}

describe('5yd.2: the return keeps the work and asks for a state note', () => {
  it('CON-AC06: used-up feedback turns end with one request for a state note, the note is in the comment, the counter shows three turns', async () => {
    w = world(exhaustedAttempt(NOTE))
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.equal(w.sandboxes.prompts.filter(isNoteRequest).length, 1)
    assert.equal(w.sandboxes.prompts.length, 1 + 3 + 1, 'first turn, three feedback turns, one note request')
    const log = w.taskLogs.get('t-1')!.join('\n')
    assert.match(log, /feedback turn 3:/)
    assert.doesNotMatch(log, /feedback turn 4:/)
    assert.match(log, /not a feedback turn; feedback turns used: 3 of 3/)
    const comment = returnComments().at(-1)!.text
    assert.match(comment, /The spec review failed:\n- F1: kept\.txt lacks the header/)
    assert.match(comment, /All 3 feedback turns of the attempt are used \(3 of 3\)/)
    assert.deepEqual(lastReturnData().state_note, NOTE)
    // CON-R01: the task records the kept work and the commit of main it sits on.
    const meta = w.db.show('t-1').metadata!
    assert.equal(meta[KEPT_BRANCH], 'agent/1-task-t-1')
    assert.equal(meta[KEPT_BASE], exchangeMain(w))
  })

  it('CON-AC07: an agent that answers the request without a note: returned with the reason and no note', async () => {
    w = world(exhaustedAttempt(null))
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isNoteRequest).length, 1)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.match(returnComments().at(-1)!.text, /^Runner returned the task\. The spec review failed:\n- F1/)
    assert.equal(lastReturnData().state_note, undefined)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /the agent wrote no state note; returning without one/)
  })

  it('ASM-4: a state note that is not a JSON object counts as no note', async () => {
    w = world(exhaustedAttempt(null))
    const agent = w.sandboxes.agentTurn
    w.sandboxes.agentTurn = (ctx) => (isNoteRequest(ctx.prompt) ? answer({ ...doneResult(), state_note: 'just text' })(ctx) : agent(ctx))
    w.sandboxes.verdict = 'fail'
    await cycle(w.runner)
    assert.equal(lastReturnData().state_note, undefined)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /the state note is not a JSON object; returning without one/)
  })

  it('ASM-3: a continuation returned before its replay records the commit of main its kept work still sits on', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    const oldBase = w.db.show('t-1').metadata![KEPT_BASE]
    pushFiles(w.other, { 'other.txt': 'other\n' }, 'owner: unrelated change')
    w.db.handOffAgain('t-1')
    w.sandboxes.agentTurn = blockedAttempt('more.txt', 'more\n')
    await cycle(w.runner)
    const meta = w.db.show('t-1').metadata!
    assert.equal(meta[KEPT_BASE], oldBase)
    assert.notEqual(meta[KEPT_BASE], exchangeMain(w))
    assert.equal(sh(w.exchange, 'show', 'agent/1-task-t-1:kept.txt'), 'kept')
    assert.equal(sh(w.exchange, 'show', 'agent/1-task-t-1:more.txt'), 'more')
  })

  it('CON-R09: a note left in an earlier result does not count as the answer to the request', async () => {
    const stale = { remaining: ['stale'] }
    w = world((ctx) => {
      if (ctx.turn === 1) return committingAgent('kept.txt', 'kept\n')(ctx)
      if (isNoteRequest(ctx.prompt)) return
      answer({ ...doneResult(), state_note: stale })(ctx)
    })
    w.sandboxes.verdict = 'fail'
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isNoteRequest).length, 1)
    assert.equal(lastReturnData().state_note, undefined)
  })

  it('ASM-3: a task returned after delivery replayed its work records the commit the attempt started from', async () => {
    let started = ''
    w = world((ctx) => {
      if (ctx.turn === 1) {
        started = exchangeMain(w)
        committingAgent('kept.txt', 'kept\n')(ctx)
        pushFiles(w.other, { 'docs/t-1/sd.md': '# SD v2 during delivery\n', 'owner.txt': 'owner\n' }, 'owner: change the design')
        return
      }
      if (!isNoteRequest(ctx.prompt)) answer(doneResult())(ctx)
    })
    // The gate fails once the work sits on the owner's change, until the turns run out.
    w.sandboxes.gate = (_kind, worktree) => (existsSync(join(worktree, 'owner.txt')) ? 1 : 0)
    await cycle(w.runner)
    assert.ok(w.db.show('t-1').labels?.includes('needs-info'))
    assert.equal(sh(w.exchange, 'show', 'agent/1-task-t-1:owner.txt'), 'owner', 'the kept work was replayed onto the newer main')
    assert.equal(w.db.show('t-1').metadata![KEPT_BASE], started)
    // The continuation sees the document change the returned attempt never worked on.
    w.db.handOffAgain('t-1')
    w.sandboxes.gate = undefined
    w.sandboxes.agentTurn = committingAgent('second.txt')
    await cycle(w.runner)
    const first = w.sandboxes.prompts.find((p) => p.includes('continues an earlier attempt'))!
    assert.match(first, /\+# SD v2 during delivery/)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('CON-R10: a blocked agent\'s state note travels in the return comment without a separate request', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.length, 1)
    assert.deepEqual(lastReturnData().state_note, NOTE)
  })
})

describe('5yd.2: the next attempt continues the kept work', () => {
  /** Returns t-1 after exhausted turns, lets the owner answer and change main, and hands it off again. */
  async function continued(): Promise<{ startedWithKept: boolean; mainAtStart: string; first: string }> {
    w = world(exhaustedAttempt(NOTE))
    w.db.comment('t-1', 'owner: said before the return')
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    w.db.comment('t-1', 'owner: answer after the return, take reading B')
    const mainAtStart = pushFiles(w.other, { 'docs/t-1/sd.md': '# SD v2, reading B\n', 'other.txt': 'other\n' }, 'owner: decide reading B')
    w.db.handOffAgain('t-1')
    w.sandboxes.verdict = 'pass'
    w.sandboxes.findings = []
    const promptsBefore = w.sandboxes.prompts.length
    let startedWithKept = false
    w.sandboxes.agentTurn = (ctx) => {
      if (ctx.turn === 1) startedWithKept = existsSync(join(ctx.worktree, 'kept.txt'))
      committingAgent('second.txt', 'second\n')(ctx)
    }
    await cycle(w.runner)
    return { startedWithKept, mainAtStart, first: w.sandboxes.prompts[promptsBefore]! }
  }

  it('CON-AC01: starts from the kept commits replayed on the current main, with the note, the answer, the document change and the last review', async () => {
    const { startedWithKept, mainAtStart, first } = await continued()
    assert.ok(startedWithKept, 'the branch holds the kept work when the agent starts')
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(sh(w.exchange, 'log', '--format=%s', '-3', 'main'), 'agent: second.txt\nagent: kept.txt\nowner: decide reading B')
    assert.equal(sh(w.exchange, 'rev-parse', 'main~2'), mainAtStart, 'the kept commit sits on the current main')
    assert.equal(exchangeFile(w, 'kept.txt'), 'kept')
    assert.match(first, /This task continues an earlier attempt/)
    assert.match(first, /"remaining": \[\n\s+"answer F1"/, 'the state note')
    assert.match(first, /owner: answer after the return, take reading B/)
    assert.match(first, /\+# SD v2, reading B/, 'the change of the task documents')
    assert.doesNotMatch(first, /other\.txt/, 'only the task documents are diffed')
    assert.match(first, /The last review report of the returned attempt:\nVerdict: "fail"\n- F1: kept\.txt lacks the header/)
    // Delivered: the kept work is no longer recorded and its branch is gone.
    assert.equal(w.db.show('t-1').metadata![KEPT_BRANCH], undefined)
    assert.equal(sh(w.exchange, 'for-each-ref', 'refs/heads/agent/'), '')
  })

  it('CON-AC02: comments added before the return are not part of the owner\'s answer', async () => {
    const { first } = await continued()
    assert.doesNotMatch(first, /said before the return/)
    const { after } = sinceReturn([{ text: 'early' }, { text: 'Runner returned the task. A' }, { text: 'mid' }, { text: 'Runner returned the task. B' }, { text: 'late' }])
    assert.deepEqual(after.map((c) => c.text), ['late'])
  })

  it('CON-AC08: the continuation\'s review receives the diff of the whole task against main', async () => {
    const { mainAtStart } = await continued()
    const review = w.sandboxes.reviewPrompts.at(-1)!
    assert.match(review, new RegExp(`Diff: git diff ${mainAtStart}\\.\\.\\.HEAD`))
    assert.match(review, /the kept commits included/)
    const files = sh(w.exchange, 'diff', '--name-only', `${mainAtStart}...main`)
    assert.deepEqual(files.split('\n'), ['kept.txt', 'second.txt'])
  })

  it('CON-AC03: a replay of the kept work that conflicts with main is a feedback turn naming the files and commits', async () => {
    w = world(blockedAttempt('shared.txt', 'kept\n'))
    await cycle(w.runner)
    const theirs = pushFiles(w.other, { 'shared.txt': 'theirs\n' }, 'owner: conflicting shared')
    w.db.handOffAgain('t-1')
    const promptsBefore = w.sandboxes.prompts.length
    w.sandboxes.agentTurn = (ctx) => {
      if (ctx.turn === 1) return answer(doneResult())(ctx)
      const onto = ctx.prompt.match(/git rebase ([0-9a-f]{40})/)![1]!
      sh(ctx.worktree, 'reset', '--quiet', '--hard', onto)
      writeFile(ctx.worktree, 'shared.txt', 'theirs + kept\n')
      sh(ctx.worktree, 'commit', '--quiet', '-am', 'agent: resolve the conflict')
      answer(doneResult())(ctx)
    }
    await cycle(w.runner)
    const report = w.sandboxes.prompts[promptsBefore + 1]!
    assert.match(report, /^The runner checked your work/)
    assert.match(report, /Conflicting files:\n- shared\.txt/)
    assert.match(report, new RegExp(`${theirs.slice(0, 7)} owner: conflicting shared`))
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /feedback turn 1: Replaying the task branch/)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'shared.txt'), 'theirs + kept')
  })

  it('CON-AC04: the fresh-start label starts from main and is gone after the claim', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    w.db.update('t-1', { add: [START_FRESH] })
    let startedWithKept = true
    let labelsAtStart: string[] = []
    let metaAtStart: Record<string, unknown> = {}
    w.sandboxes.agentTurn = (ctx) => {
      startedWithKept = existsSync(join(ctx.worktree, 'kept.txt'))
      labelsAtStart = w.db.show('t-1').labels ?? []
      metaAtStart = w.db.show('t-1').metadata ?? {}
      committingAgent('second.txt')(ctx)
    }
    await cycle(w.runner)
    assert.equal(startedWithKept, false)
    assert.ok(!labelsAtStart.includes(START_FRESH))
    assert.equal(metaAtStart[KEPT_BRANCH], undefined)
    assert.doesNotMatch(w.sandboxes.prompts.at(-1)!, /continues an earlier attempt/)
    assert.equal(w.db.show('t-1').status, 'closed')
    assert.equal(exchangeFile(w, 'kept.txt'), null)
  })

  it('CON-AC05: kept work missing on GitHub: starts from main, logs why, and the task is not returned', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    sh(w.exchange, 'branch', '-D', 'agent/1-task-t-1')
    w.db.handOffAgain('t-1')
    const returnsBefore = returnComments().length
    let startedWithKept = true
    w.sandboxes.agentTurn = (ctx) => {
      startedWithKept = existsSync(join(ctx.worktree, 'kept.txt'))
      committingAgent('second.txt')(ctx)
    }
    await cycle(w.runner)
    assert.equal(startedWithKept, false)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /the kept work agent\/1-task-t-1 recorded in the task is no longer on GitHub; starting from main/)
    assert.equal(returnComments().length, returnsBefore)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('ASM-1: a continuation returned before its own first review carries the report it received', async () => {
    w = world(exhaustedAttempt(NOTE))
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    w.sandboxes.agentTurn = blockedAttempt('more.txt', 'more\n')
    await cycle(w.runner)
    assert.equal(returnComments().length, 2)
    assert.equal(lastReturnData().last_review, 'Verdict: "fail"\n- F1: kept.txt lacks the header')
  })

  it('ASM-1: a continuation stopped on an error carries the report it received, and one of its own review', async () => {
    w = world(exhaustedAttempt(NOTE))
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    w.sandboxes.agentTurn = () => {
      throw new Error('agent process died')
    }
    await cycle(w.runner)
    // Every turn fails: an environment failure, retried twice, then the task goes back (ENV-R05).
    assert.match(returnComments().at(-1)!.text, /The cause is the environment[\s\S]*3\. the agent's turn in the implementing agent's sandbox failed: Error: agent process died/)
    assert.equal(lastReturnData().last_review, 'Verdict: "fail"\n- F1: kept.txt lacks the header')

    // A review of the attempt itself, then an error in the next turn: its own report travels.
    w.db.handOffAgain('t-1')
    w.sandboxes.findings = ['F2: still wrong']
    w.sandboxes.agentTurn = (ctx) => {
      if (ctx.turn > 1) throw new Error('sandbox lost')
      answer(doneResult())(ctx)
    }
    await cycle(w.runner)
    assert.match(returnComments().at(-1)!.text, /The cause is the environment[\s\S]*3\. the agent's turn in the implementing agent's sandbox failed: Error: sandbox lost/)
    assert.equal(lastReturnData().last_review, 'Verdict: "fail"\n- F2: still wrong')
  })

  it('ASM-1: an error before the agent starts carries the continued attempt\'s report', async () => {
    w = world(exhaustedAttempt(NOTE))
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F1: kept.txt lacks the header']
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    w.sandboxes.warm = async () => {
      throw new Error('docker gone')
    }
    await cycle(w.runner)
    assert.match(returnComments().at(-1)!.text, /The cause is the environment[\s\S]*3\. opening the implementing agent's sandbox failed: Error: docker gone/)
    assert.equal(lastReturnData().last_review, 'Verdict: "fail"\n- F1: kept.txt lacks the header')
  })

  it('ASM-2: GitHub not giving the kept work: the task waits in selection, unclaimed, and the next task is taken', async () => {
    w = world(blockedAttempt(), ['t-1', 't-2'])
    w.db.update('t-2', { remove: ['ready-for-agent'] })
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    w.db.update('t-2', { add: ['ready-for-agent'] })
    const kept = w.db.show('t-1').metadata![KEPT_BRANCH] as string
    // The branch is still listed on GitHub, but its commit cannot be fetched.
    writeFile(w.exchange, `refs/heads/${kept}`, `${'1'.repeat(40)}\n`)
    const returnsBefore = returnComments().length
    const claimsBefore = w.db.claims.length
    // The planted ref also breaks pushes to the stand-in GitHub, so t-2 is only checked as taken.
    w.sandboxes.agentTurn = committingAgent('second.txt')
    assert.equal(await cycle(w.runner), true)
    assert.deepEqual(w.db.claims.slice(claimsBefore), ['t-2'])
    assert.match(w.logs.join('\n'), new RegExp(`t-1: waits: cannot fetch the kept work ${kept} from GitHub`))
    assert.equal(returnComments().length, returnsBefore, 'not returned')
    assert.equal(w.db.show('t-1').status, 'open')
    assert.equal(w.db.show('t-1').metadata![KEPT_BRANCH], kept)
  })

  it('ASM-2: GitHub unreachable while fetching the kept work: the task waits, claimed by no one, its kept work still recorded', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    w.db.handOffAgain('t-1')
    const kept = w.db.show('t-1').metadata![KEPT_BRANCH]
    const returnsBefore = returnComments().length
    const promptsBefore = w.sandboxes.prompts.length
    assert.ok(w.db.claim('t-1'))
    sh(w.runnerCopy, 'remote', 'set-url', 'origin', `${w.base}/gone.git`)
    await processTask(w.runner, w.db.show('t-1'), exchangeMain(w))
    assert.equal(w.sandboxes.prompts.length, promptsBefore, 'no agent started')
    assert.equal(returnComments().length, returnsBefore, 'not returned')
    assert.equal(w.db.show('t-1').status, 'open')
    assert.ok(w.db.show('t-1').labels?.includes('ready-for-agent'))
    assert.equal(w.db.show('t-1').metadata![KEPT_BRANCH], kept)
    assert.match(w.logs.join('\n'), /t-1: waits: cannot fetch the kept work agent\/1-task-t-1 from GitHub/)
  })

  it('a malformed data block in the return comment: the attempt goes on without the note and logs it', async () => {
    w = world(blockedAttempt())
    await cycle(w.runner)
    const comment = returnComments().at(-1)!
    comment.text = comment.text.replace('"state_note"', '"state_note" broken')
    w.db.handOffAgain('t-1')
    w.sandboxes.agentTurn = committingAgent('second.txt')
    await cycle(w.runner)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /the data of the return's comment is malformed, going on without it/)
    assert.match(w.sandboxes.prompts.at(-1)!, /The returned attempt left no state note\./)
    assert.equal(w.db.show('t-1').status, 'closed')
  })
})
