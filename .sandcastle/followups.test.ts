import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type AgentResult,
  type Deviation,
  type Issue,
  criterionIds,
  dependants,
  deviationProblems,
  epicLabelPlan,
  resultShapeProblems,
} from './followups.ts'

const TASK = 'oferty-pracy-abc.1'
const ACCEPTANCE = 'T1-AC01: first\nT1-AC05: status unchanged\nW-AC01: gate passes'

function deviation(overrides: Partial<Deviation> = {}): Deviation {
  return {
    id: 'DEV-1',
    kind: 'contradiction',
    requirements: ['R2-01', 'T1-AC05'],
    deferred_acs: ['T1-AC05'],
    interim: 'keeps the current behaviour',
    qualification: 'local',
    title: 'Target behaviour',
    description: 'Full description',
    ...overrides,
  }
}

function result(deviations: Deviation[], evidence = ['T1-AC01', 'W-AC01']): AgentResult {
  return {
    status: 'done',
    summary: 's',
    evidence: evidence.map((ac) => ({ ac, check: 'test', result: 'passed' })),
    deviations,
    question: null,
  }
}

function task(id: string, overrides: Partial<Issue> = {}): Issue {
  return { id, title: id, issue_type: 'task', status: 'open', labels: ['ready-for-agent'], ...overrides }
}

const epic: Issue = { id: 'oferty-pracy-0mq', title: 'epic', issue_type: 'epic', status: 'open', labels: ['ready-for-agent'] }
const allMarkers = () => true

function check(res: AgentResult, siblings: Issue[] = [], options: { epic?: Issue; hasMarker?: (t: string) => boolean } = {}) {
  return deviationProblems(res, {
    taskId: TASK,
    acceptance: ACCEPTANCE,
    epic: options.epic ?? epic,
    siblings,
    hasMarker: options.hasMarker ?? allMarkers,
  })
}

describe('criterionIds', () => {
  it('reads IDs from AC lines and skips prose', () => {
    assert.deepEqual(criterionIds('T1-AC01: x\n- W-AC02: y\nfree text without id\n'), ['T1-AC01', 'W-AC02'])
  })
})

describe('deviationProblems', () => {
  it('accepts a qualifying deviation with evidence for the other criteria', () => {
    assert.deepEqual(check(result([deviation()])), [])
  })

  it('requires evidence or a deviation for every criterion', () => {
    assert.match(check(result([], ['T1-AC01']))[0]!, /T1-AC05, W-AC01/)
  })

  it('rejects more than two deviations per task', () => {
    const three = ['DEV-1', 'DEV-2', 'DEV-3'].map((id) => deviation({ id, deferred_acs: [] }))
    assert.ok(check(result(three, ['T1-AC01', 'T1-AC05', 'W-AC01'])).some((p) => p.includes('at most 2')))
  })

  it('rejects a deviation past the epic limit of open follow-ups', () => {
    const open = ['a', 'b', 'c'].map((id) => task(id, { metadata: { type: 'follow-up' }, labels: ['needs-info'] }))
    assert.ok(check(result([deviation()]), open).some((p) => p.includes('limit of 3')))
  })

  it('ignores closed follow-ups in the epic limit', () => {
    const closed = ['a', 'b', 'c'].map((id) => task(id, { metadata: { type: 'follow-up' }, status: 'closed' }))
    assert.deepEqual(check(result([deviation()]), closed), [])
  })

  it('blocks a deviation touching a load-bearing requirement', () => {
    const bearing = { ...epic, metadata: { load_bearing: 'X-01, R2-01' } }
    assert.ok(check(result([deviation()]), [], { epic: bearing }).some((p) => p.includes('load-bearing')))
  })

  it('needs one or two requirements', () => {
    const wide = deviation({ requirements: ['R2-01', 'T1-AC05', 'T1-R02'] })
    assert.ok(check(result([wide])).some((p) => p.includes('one or two')))
  })

  it('rejects deferring every criterion', () => {
    const all = deviation({ deferred_acs: ['T1-AC01', 'T1-AC05', 'W-AC01'] })
    assert.ok(check(result([all], [])).some((p) => p.includes('Every acceptance criterion is deferred')))
  })

  it('rejects a deferred criterion that is not the task’s', () => {
    assert.ok(check(result([deviation({ deferred_acs: ['A9-AC01'] })], ['T1-AC01', 'T1-AC05', 'W-AC01'])).some((p) => p.includes('not a criterion')))
  })

  it('requires the marker in the committed code', () => {
    const problems = check(result([deviation()]), [], { hasMarker: () => false })
    assert.ok(problems.some((p) => p.includes(`FOLLOW-UP(${TASK}/DEV-1)`)))
  })

  it('rejects a deviation more than two other open tasks depend on', () => {
    const siblings = ['x', 'y', 'z'].map((id) => task(id, { acceptance_criteria: `${id}-AC01: uses R2-01 status` }))
    assert.ok(check(result([deviation()]), siblings).some((p) => p.includes('at most 2 may wait')))
  })
})

describe('resultShapeProblems', () => {
  it('accepts a complete result', () => {
    assert.deepEqual(resultShapeProblems(result([deviation()])), [])
  })

  it('reports missing evidence and malformed deviations', () => {
    const broken = { status: 'done', summary: 's', deviations: [{ id: 'DEV-1' }], question: null } as unknown as AgentResult
    assert.equal(resultShapeProblems(broken).length, 2)
  })
})

describe('dependants', () => {
  it('finds open tasks mentioning the IDs as whole tokens, skipping follow-ups, closed tasks and itself', () => {
    const siblings = [
      task('a', { description: 'Depends on R2-01.' }),
      task('b', { description: 'Mentions R2-012 only.' }),
      task('c', { description: 'R2-01', status: 'closed' }),
      task('d', { description: 'R2-01', metadata: { type: 'follow-up' } }),
      task(TASK, { description: 'R2-01' }),
    ]
    assert.deepEqual(dependants(deviation(), TASK, siblings), ['a'])
  })
})

describe('epicLabelPlan', () => {
  const followUp = (labels: string[], status = 'open') => task('f', { metadata: { type: 'follow-up' }, labels, status })
  const done = task('t', { status: 'closed' })
  const takenBack = { ...epic, labels: ['needs-info'], metadata: { follow_ups: true } }

  it('leaves an epic alone while other tasks are open', () => {
    assert.equal(epicLabelPlan(epic, [task('t'), followUp(['needs-info'])]), null)
  })

  it('takes the epic back once only undecided follow-ups remain', () => {
    assert.deepEqual(epicLabelPlan(epic, [done, followUp(['needs-info'])]), {
      add: ['needs-info'],
      remove: ['ready-for-agent'],
      followUps: true,
    })
  })

  it('keeps a handed-off epic running when every follow-up is ready', () => {
    assert.deepEqual(epicLabelPlan(epic, [done, followUp(['ready-for-agent'])]), { add: [], remove: [], followUps: true })
  })

  it('never hands the epic off again, even when every follow-up is ready', () => {
    assert.equal(epicLabelPlan(takenBack, [done, followUp(['ready-for-agent'])]), null)
  })

  it('takes a re-handed-off epic back when a follow-up files another undecided one', () => {
    const handedOff = { ...epic, metadata: { follow_ups: true } }
    const plan = epicLabelPlan(handedOff, [done, followUp(['ready-for-agent']), { ...followUp(['needs-info']), id: 'g' }])
    assert.deepEqual(plan, { add: ['needs-info'], remove: ['ready-for-agent'] })
  })

  it('clears follow_ups without touching labels when none is open', () => {
    assert.deepEqual(epicLabelPlan(takenBack, [done, followUp(['ready-for-agent'], 'closed')]), { add: [], remove: [], followUps: false })
  })

  it('clears follow_ups when the owner adds regular work', () => {
    assert.deepEqual(epicLabelPlan(takenBack, [task('new'), followUp(['needs-info'])]), { add: [], remove: [], followUps: false })
  })

  it('is idempotent once taken back', () => {
    assert.equal(epicLabelPlan(takenBack, [done, followUp(['needs-info'])]), null)
  })

  it('respects a pause: an epic without ready-for-agent stays paused', () => {
    const paused = { ...epic, labels: [], metadata: { follow_ups: true } }
    assert.equal(epicLabelPlan(paused, [done, followUp(['ready-for-agent'])]), null)
  })

  it('never touches an epic that was not handed off', () => {
    assert.equal(epicLabelPlan({ ...epic, labels: [] }, [done, followUp(['needs-info'])]), null)
  })
})
