// Task 5yd.5 of oferty-pracy-5yd: agents take reversible decisions themselves, and later tasks
// of the epic know its unconfirmed assumptions. A bare repository stands in for GitHub; the task
// database, agents and reviewer are stand-ins.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { cycle, RESULT_FILE } from './flow.ts'
import type { AgentResult, Assumption, Deviation } from './followups.ts'
import { type AgentTurn, type World, doneResult, sh, world, writeFile } from './testing.ts'

let w: World
afterEach(() => w?.cleanup())

const EPIC = 'p-e'
const FIRST = 'p-e.1'
const SECOND = 'p-e.2'

function assumption(id: string, decision: string, reversal: string): Assumption {
  return {
    id, requirements: ['T-AC01'], gap: `gap of ${id}`, decision, sources: ['requirements T-R01', 'code: the existing list'],
    prd: 'Goal', rule: 'existing behaviour', if_reversed: reversal,
  }
}

const ASM_1 = assumption('ASM-1', 'Lists are sorted by date.', 'Sort by name in three places.')
const ASM_2 = assumption('ASM-2', 'Empty titles are kept.', 'Reject empty titles at the form.')

/** Two tasks of one handed-off epic. */
function epicWorld(agent: AgentTurn): World {
  const v = world(agent, [FIRST, SECOND])
  v.db.add({ id: EPIC, title: 'Epic', issue_type: 'epic', labels: ['ready-for-agent'] })
  for (const id of [FIRST, SECOND]) v.db.issues.get(id)!.parent = EPIC
  return v
}

/** The task this turn implements, read from its prompt. */
const taskOf = (prompt: string) => (prompt.includes(`"id": "${FIRST}"`) ? FIRST : SECOND)

/** Commits the given files and writes the result. */
function commit(worktree: string, files: Record<string, string>, result: AgentResult): void {
  for (const [path, content] of Object.entries(files)) writeFile(worktree, path, content)
  sh(worktree, 'add', '-A')
  sh(worktree, 'commit', '--quiet', '-m', 'agent work')
  writeFile(worktree, RESULT_FILE, JSON.stringify(result))
}

const isFeedback = (prompt: string) => prompt.startsWith('The runner checked your work')

describe('5yd.5: assumptions and deviations', () => {
  it('AUT-AC01: an assumption whose marker the change does not add fails the checks before the review', async () => {
    let reviewsBeforeFix = -1
    w = world(({ worktree, turn }) => {
      const result = { ...doneResult(), assumptions: [ASM_1] }
      if (turn === 1) return commit(worktree, { 'feature.txt': 'sorted by date\n' }, result)
      reviewsBeforeFix = w.sandboxes.reviews
      commit(worktree, { 'feature.txt': '// ASSUMPTION(t-1/ASM-1)\nsorted by date\n' }, result)
    })
    await cycle(w.runner)
    const feedback = w.sandboxes.prompts.filter(isFeedback)
    assert.equal(feedback.length, 1)
    assert.match(feedback[0]!, /Assumption ASM-1: marker ASSUMPTION\(t-1\/ASM-1\) is not added by the task's own change/)
    assert.equal(reviewsBeforeFix, 0, 'no review before the marker is added')
    assert.equal(w.db.show('t-1').status, 'closed')
  })

  it('AUT-AC02, AUT-AC08: each assumption is its own open issue; the next task receives the open ones only', async () => {
    w = epicWorld(({ worktree, prompt }) => {
      const id = taskOf(prompt)
      if (id === FIRST) {
        return commit(worktree, { 'list.ts': `// ASSUMPTION(${FIRST}/ASM-1)\n// ASSUMPTION(${FIRST}/ASM-2)\n` }, { ...doneResult(), assumptions: [ASM_1, ASM_2] })
      }
      commit(worktree, { 'second.ts': 'second\n' }, doneResult())
    })
    await cycle(w.runner)
    assert.equal(w.db.show(FIRST).status, 'closed')

    const filed = [...w.db.issues.values()].filter((i) => i.metadata?.type === 'assumption')
    assert.equal(filed.length, 2, 'two separate assumption items')
    for (const [item, a] of filed.map((i, n) => [i, [ASM_1, ASM_2][n]!] as const)) {
      assert.equal(item.status, 'open')
      assert.equal(w.db.discoveredFrom.get(item.id), FIRST, 'linked to the task')
      assert.equal(item.metadata?.marker, `ASSUMPTION(${FIRST}/${a.id})`)
      assert.equal(item.metadata?.epic, EPIC)
      assert.equal(item.parent, null, 'outside the epic')
      assert.ok(item.labels?.includes('needs-triage'))
      assert.match(item.description!, new RegExp(a.decision))
      assert.match(item.description!, /Sources: requirements T-R01; code: the existing list/)
      assert.match(item.description!, /PRD: Goal/)
    }
    const comment = w.db.comments.filter((c) => c.id === FIRST).map((c) => c.text).join('\n')
    for (const item of filed) assert.match(comment, new RegExp(`→ ${item.id}`))

    // The owner confirms ASM-2: its issue is closed.
    const confirmed = filed.find((i) => i.metadata?.marker === `ASSUMPTION(${FIRST}/ASM-2)`)!
    w.db.close(confirmed.id, 'confirmed in the solution design')

    await cycle(w.runner)
    assert.equal(w.db.show(SECOND).status, 'closed')
    const prompt = w.sandboxes.prompts.find((p) => taskOf(p) === SECOND)!
    const open = filed.find((i) => i !== confirmed)!
    assert.match(prompt, new RegExp(`"id": "${open.id}"`))
    assert.match(prompt, /ASSUMPTION\(p-e\.1\/ASM-1\)/)
    assert.match(prompt, /Lists are sorted by date\./)
    assert.match(prompt, /Sort by name in three places\./)
    assert.doesNotMatch(prompt, /ASSUMPTION\(p-e\.1\/ASM-2\)/)
    assert.doesNotMatch(prompt, /Empty titles are kept/)
    assert.match(prompt, /uses it only through the places carrying its marker/)
    // The reviewer of the second task sees the same assumptions.
    assert.match(w.sandboxes.reviewPrompts.at(-1)!, /Lists are sorted by date\./)
  })

  it('a load-bearing assumption is flagged on its issue', async () => {
    w = epicWorld(({ worktree }) => {
      commit(worktree, { 'list.ts': `// ASSUMPTION(${FIRST}/ASM-1)\n` }, { ...doneResult(), assumptions: [ASM_1] })
    })
    w.db.update(EPIC, { setMetadata: { load_bearing: 'T-AC01' } })
    await cycle(w.runner)
    const item = [...w.db.issues.values()].find((i) => i.metadata?.type === 'assumption')!
    assert.ok(item.labels?.includes('load-bearing'))
    assert.match(item.description!, /Load-bearing \(T-AC01\)/)
  })

  it('AUT-AC04: a deviation whose interim code spans more than three files passes when every place carries the marker', async () => {
    const deviation: Deviation = {
      id: 'DEV-1', kind: 'underspecified', requirements: ['T-R02'], deferred_acs: [], interim: 'keeps today\'s list',
      qualification: 'local', title: 'Target list', description: 'Full description',
    }
    const files = Object.fromEntries(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map((f) => [f, '// FOLLOW-UP(t-1/DEV-1)\n']))
    w = world(({ worktree }) => commit(worktree, files, { ...doneResult(), deviations: [deviation] }))
    w.sandboxes.verdict = 'pass-with-deferral'
    await cycle(w.runner)
    assert.equal(w.sandboxes.prompts.filter(isFeedback).length, 0)
    assert.equal(w.db.show('t-1').status, 'closed')
  })
})
