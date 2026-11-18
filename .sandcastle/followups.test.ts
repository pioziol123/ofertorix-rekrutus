import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type AgentResult,
  type Assumption,
  type Deviation,
  type Issue,
  bearingAssumptions,
  criterionIds,
  dependants,
  deviationProblems,
  epicLabelPlan,
  loadBearing,
  sharedCriteria,
  rangeIds,
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

function assumption(id: string): Assumption {
  return { id, requirements: ['T1-AC01'], gap: 'g', decision: 'd', sources: ['requirements T1-R01'], prd: 'Goal', rule: 'existing behaviour', if_reversed: 'r' }
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

  it('AUT-AC03: accepts three deviations per task and rejects a fourth', () => {
    const devs = (n: number) => ['DEV-1', 'DEV-2', 'DEV-3', 'DEV-4'].slice(0, n).map((id) => deviation({ id, deferred_acs: [] }))
    const evidence = ['T1-AC01', 'T1-AC05', 'W-AC01']
    assert.deepEqual(check(result(devs(3), evidence)), [])
    assert.ok(check(result(devs(4), evidence)).some((p) => p.includes('4 deviations; a task may defer at most 3')))
  })

  it('AUT-AC03: the epic limit is six open follow-ups', () => {
    const open = (n: number) => Array.from({ length: n }, (_, i) => task(`f${i}`, { metadata: { type: 'follow-up' }, labels: ['needs-info'] }))
    assert.deepEqual(check(result([deviation()]), open(5)), [])
    assert.ok(check(result([deviation()]), open(6)).some((p) => p.includes('limit of 6')))
  })

  it('AUT-AC04: does not count the files of the interim code; a marker at every place passes', () => {
    // The stand-in diff adds the marker in five files; nothing limits how many files a deviation spans.
    const diff = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map((f) => `+++ b/${f}\n+// FOLLOW-UP(${TASK}/DEV-1) interim`).join('\n')
    const hasMarker = (text: string) => diff.split('\n').some((line) => line.startsWith('+') && line.includes(text))
    assert.deepEqual(check(result([deviation()]), [], { hasMarker }), [])
  })

  it('ignores closed follow-ups in the epic limit', () => {
    const closed = Array.from({ length: 6 }, (_, i) => task(`f${i}`, { metadata: { type: 'follow-up' }, status: 'closed' }))
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

  it('rejects a deviation more than four other open tasks depend on', () => {
    const siblings = (ids: string[]) => ids.map((id) => task(id, { acceptance_criteria: `${id}-AC01: uses R2-01 status` }))
    assert.deepEqual(check(result([deviation()]), siblings(['v', 'w', 'x', 'y'])), [])
    assert.ok(check(result([deviation()]), siblings(['v', 'w', 'x', 'y', 'z'])).some((p) => p.includes('at most 4 may wait')))
  })

  it('AUT-AC01: requires each assumption\'s marker in the task\'s own change', () => {
    const withAssumption = { ...result([]), assumptions: [assumption('ASM-1'), assumption('ASM-2')] }
    const evidence = { ...withAssumption, evidence: ['T1-AC01', 'T1-AC05', 'W-AC01'].map((ac) => ({ ac, check: 'test', result: 'passed' })) }
    const only = (tag: string) => (text: string) => text === tag
    const problems = check(evidence, [], { hasMarker: only(`ASSUMPTION(${TASK}/ASM-1)`) })
    assert.deepEqual(problems.length, 1)
    assert.match(problems[0]!, /Assumption ASM-2: marker ASSUMPTION\(oferty-pracy-abc\.1\/ASM-2\) is not added/)
    assert.deepEqual(check(evidence), [])
  })
})

describe('resultShapeProblems', () => {
  it('accepts a complete result', () => {
    assert.deepEqual(resultShapeProblems(result([deviation()])), [])
  })

  it('requires an assumption\'s sources and the part of the PRD it serves', () => {
    const { sources: _s, ...noSources } = assumption('ASM-1')
    const problems = resultShapeProblems({ ...result([]), assumptions: [noSources as Assumption, { ...assumption('ASM-2'), prd: '' }] })
    assert.equal(problems.length, 2)
    assert.match(problems[0]!, /ASM-1 needs a sources list/)
    assert.deepEqual(resultShapeProblems({ ...result([]), assumptions: [assumption('ASM-1')] }), [])
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

  it('ignores the epic’s shared criteria, which every task names', () => {
    const siblings = [task('a', { description: 'W-AC03' }), task('b', { description: 'W-AC03' }), task('c', { description: 'W-AC03, R2-01' })]
    const d = deviation({ requirements: ['R2-01'], deferred_acs: ['W-AC03'] })
    assert.deepEqual(dependants(d, TASK, siblings, sharedCriteria({ ...epic, metadata: { shared: 'W-AC01,W-AC03' } })), ['c'])
  })
})

describe('rangeIds', () => {
  it('expands dash and dot ranges with the same prefix, keeping padding', () => {
    assert.deepEqual(rangeIds('Reguły: F2-01–F2-03, F2-08.'), ['F2-01', 'F2-02', 'F2-03'])
    assert.deepEqual(rangeIds('A1-AC02..A1-AC04'), ['A1-AC02', 'A1-AC03', 'A1-AC04'])
    assert.deepEqual(rangeIds('R-9 - R-11'), ['R-9', 'R-10', 'R-11'])
  })

  it('skips ranges with different prefixes, reversed ends or plain IDs', () => {
    assert.deepEqual(rangeIds('F2-01–A1-05, F2-05–F2-01, F2-01 and F2-02'), [])
  })
})

describe('ranges in dependants and load_bearing', () => {
  it('finds a task that names the deviation’s ID only inside a range', () => {
    const siblings = [task('a', { description: 'Reguły: F2-01–F2-05.' })]
    assert.deepEqual(dependants(deviation({ requirements: ['F2-03'], deferred_acs: [] }), TASK, siblings), ['a'])
  })

  it('reads ranges in load_bearing', () => {
    assert.ok(loadBearing({ ...epic, metadata: { load_bearing: 'F2-06–F2-08, A5-R03' } }).has('F2-07'))
  })
})

describe('bearingAssumptions', () => {
  it('lists assumptions touching load-bearing IDs', () => {
    const bearing = { ...epic, metadata: { load_bearing: 'A1-AC05' } }
    const a = (id: string, requirements: string[]) => ({ ...assumption(id), requirements })
    assert.deepEqual(bearingAssumptions([a('ASM-1', ['F2-05']), a('ASM-2', ['F2-02', 'A1-AC05'])], bearing), [
      { id: 'ASM-2', touched: ['A1-AC05'] },
    ])
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
