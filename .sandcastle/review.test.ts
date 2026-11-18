// Task 5yd.4 of oferty-pracy-5yd: the reviewer separates fix findings from owner findings.
// A bare repository stands in for GitHub; the task database, agents and reviewer are stand-ins.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { parseReturnData } from './continuation.ts'
import { cycle, findingsOf, RESULT_FILE } from './flow.ts'
import { type AgentTurn, type World, committingAgent, doneResult, world, writeFile } from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

const NOTE = { question: { text: 'Which reading of REV-R01?' }, remaining: ['fix F2'] }
const QUESTION = {
  conflict: 'REV-R01 says "..." while REV-R04 says "..."',
  options: [{ option: 'A', consequence: 'x' }, { option: 'B', consequence: 'y' }],
  recommendation: 'A',
}
const OWNER = { kind: 'owner', text: 'F1: the documents leave the reading of REV-R01 open', question: QUESTION }
const FIX = { kind: 'fix', text: 'F2: feature.txt lacks the header' }

const isNoteRequest = (prompt: string) => prompt.includes('task-state-note skill')
const isFeedback = (prompt: string) => prompt.startsWith('The runner checked your work')
const returnComment = () => w.db.comments.filter((c) => c.id === 't-1' && c.text.startsWith('Runner returned the task.')).at(-1)?.text

/** Commits on the first turn; asked for a state note, writes NOTE; otherwise writes a done result. */
const agent: AgentTurn = (ctx) => {
  if (ctx.turn === 1) return committingAgent()(ctx)
  const result = isNoteRequest(ctx.prompt) ? { ...doneResult(), state_note: NOTE } : doneResult()
  writeFile(ctx.worktree, RESULT_FILE, JSON.stringify(result))
}

describe('5yd.4: owner findings end the attempt, fix findings go back to the agent', () => {
  it('REV-AC01: one owner and one fix finding: no feedback turn, one note request, the task returned with both findings', async () => {
    w = world(agent)
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = [OWNER, FIX]
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isFeedback).length, 0, 'no feedback turn')
    assert.equal(w.sandboxes.prompts.filter(isNoteRequest).length, 1, 'one request for a state note')
    assert.equal(w.sandboxes.prompts.length, 2, 'the first turn and the note request')
    assert.equal(w.sandboxes.reviews, 1)
    const issue = w.db.show('t-1')
    assert.ok(issue.labels?.includes('needs-info'))
    assert.ok(!issue.labels?.includes('ready-for-agent'))
    const comment = returnComment()
    assert.ok(comment, 'the task is returned')
    assert.match(comment, /F1: the documents leave the reading of REV-R01 open/)
    assert.match(comment, /F2: feature\.txt lacks the header/)
    assert.match(comment, /recommendation/)
    const parsed = parseReturnData(comment)
    assert.ok(parsed && 'data' in parsed)
    assert.deepEqual(parsed.data.state_note, NOTE)
    assert.match(parsed.data.last_review!, /F1:/)
    assert.match(parsed.data.last_review!, /F2:/)
    // The note request names both kinds of findings so the note carries them.
    const request = w.sandboxes.prompts.find(isNoteRequest)!
    assert.match(request, /F1:/)
    assert.match(request, /F2:/)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /owner finding/)
    assert.doesNotMatch(w.taskLogs.get('t-1')!.join('\n'), /feedback turn 1:/)
  })

  it('REV-AC02: fix findings only: a feedback turn with those findings', async () => {
    w = world(agent)
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = [FIX, { kind: 'fix', text: 'F3: the test is missing' }]
    await cycle(w.runner)
    const turns = w.sandboxes.prompts.filter(isFeedback)
    assert.equal(turns.length, 3, 'every feedback turn of the attempt is used on fix findings')
    assert.match(turns[0]!, /The spec review failed:\n- F2: feature\.txt lacks the header\n- F3: the test is missing/)
    assert.match(w.taskLogs.get('t-1')!.join('\n'), /feedback turn 1:/)
  })

  it('REV-AC03: findings without a marking count as fix findings', async () => {
    w = world(agent)
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F2: feature.txt lacks the header', { text: 'F3: the test is missing' }]
    await cycle(w.runner)
    const turns = w.sandboxes.prompts.filter(isFeedback)
    assert.equal(turns.length, 3)
    assert.match(turns[0]!, /The spec review failed:\n- F2: feature\.txt lacks the header\n- F3: the test is missing/)
    assert.match(returnComment()!, /All 3 feedback turns of the attempt are used/)
  })

  it('REV-AC03: a fix result passes the review after a feedback turn and is delivered', async () => {
    w = world(agent)
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = ['F2: feature.txt lacks the header']
    const turn = w.sandboxes.agentTurn
    w.sandboxes.agentTurn = (ctx) => {
      turn(ctx)
      if (isFeedback(ctx.prompt)) {
        w.sandboxes.verdict = 'pass'
        w.sandboxes.findings = []
      }
    }
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isFeedback).length, 1)
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('ASM-1: an owner finding without a question still ends the attempt', async () => {
    w = world(agent)
    w.sandboxes.verdict = 'fail'
    w.sandboxes.findings = [{ kind: 'owner', text: 'F1: only the owner can settle this' }]
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isFeedback).length, 0)
    assert.equal(w.sandboxes.prompts.filter(isNoteRequest).length, 1)
    assert.match(returnComment()!, /F1: only the owner can settle this/)
  })
})

describe('5yd.4: the reviewer\'s instruction', () => {
  it('REV-AC04: defines both kinds, the shape of an owner finding, and the discarded option and unneeded stop as fix findings', async () => {
    w = world(committingAgent())
    await cycle(w.runner)
    const prompt = w.sandboxes.reviewPrompts[0]!
    assert.match(prompt, /- "fix": /)
    assert.match(prompt, /- "owner": removing it needs a choice the documents leave open, or a change of a document/)
    assert.match(prompt, /always "fix" findings[^\n]*discarded[^\n]*a stop the agent did not need/)
    assert.match(prompt, /"question" in the shape of the question of a state note[^\n]*conflict[^\n]*options[^\n]*recommendation/)
    assert.match(prompt, /"findings": \[\{"kind": "fix"/)
  })
})

describe('5yd.4: reading the review file', () => {
  it('marks each finding, counting plain strings and unknown kinds as fix findings', () => {
    assert.deepEqual(findingsOf(['a', { kind: 'owner', text: 'b', question: QUESTION }, { kind: 'odd', text: 'c' }, { text: 'd' }, 5]), [
      { kind: 'fix', text: 'a' },
      { kind: 'owner', text: 'b', question: QUESTION },
      { kind: 'fix', text: 'c' },
      { kind: 'fix', text: 'd' },
      { kind: 'fix', text: '5' },
    ])
    assert.deepEqual(findingsOf(undefined), [])
  })
})
