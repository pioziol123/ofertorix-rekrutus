import { describe, expect, it } from 'vitest'
import { findAltitudeIssues } from '../scripts/spec-altitude.ts'

const directories = ['lib', 'server', 'worker']
const check = (text: string) => findAltitudeIssues(text, directories)

describe('findAltitudeIssues', () => {
  it('accepts a document at the level of a design', () => {
    expect(check([
      '- **Pool.** One `pg` pool per process; jobs go through `pg-boss`.',
      '- The worker runs on Node.js and renders with Nuxt.js.',
      '- See [requirements](requirements.md#r-05) and the column `offer_id`.',
    ].join('\n'))).toEqual([])
  })

  it('reports code file names and links to them', () => {
    expect(check('Edit [store](../../lib/matching/store.ts) and nuxt.config.ts.').map((i) => i.match))
      .toEqual(['../../lib/matching/store.ts', 'nuxt.config.ts'])
  })

  it('reports paths into code directories', () => {
    const issues = check('Models live in `lib/ai/models/` next to worker/.')
    expect(issues.map((i) => [i.rule, i.match])).toEqual([
      ['code path', 'lib/ai/models/'],
      ['code path', 'worker/'],
    ])
  })

  it('reports function and class code', () => {
    expect(check('Then function run() and class Store extends Base {').map((i) => i.match))
      .toEqual(['function run(', 'class Store extends'])
  })

  it('leaves URLs and product names alone', () => {
    expect(check('See https://example.com/x/openapi.yaml, Express.js and Chart.js on an iPhone(13).')).toEqual([])
  })

  it('reports an unclosed code block', () => {
    expect(check(['```mermaid', 'A --> B', 'lib/x.ts'].join('\n'))).toEqual([
      { line: 1, severity: 'error', rule: 'unclosed code block', match: 'no closing fence' },
    ])
  })

  it('reports a code block inside a quote', () => {
    expect(check(['> ```ts', '> x()', '> ```'].join('\n')).map((i) => i.rule)).toEqual(['code block'])
  })

  it('reports code blocks but not diagrams, and skips their content', () => {
    const issues = check(['```ts', 'const x = load("a.ts")', '```', '```mermaid', 'A --> B', '```'].join('\n'))
    expect(issues).toEqual([{ line: 1, severity: 'error', rule: 'code block', match: '```ts' }])
  })

  it('warns about inline code that reads as an identifier, member or call', () => {
    expect(check('`chargeCeiling`, `AiConfiguration`, `ctx.offerId`, `prepare(x)`, `pg`, `offer_id`, `R-05`').map((i) => i.match))
      .toEqual(['`chargeCeiling`', '`AiConfiguration`', '`ctx.offerId`', '`prepare(x)`'])
  })

  it('skips a line marked with a reason', () => {
    expect(check('Replaces lib/profile/ai.ts <!-- altitude-ok: names the legacy code once -->')).toEqual([])
    expect(check('Replaces lib/profile/ai.ts <!-- altitude-ok: -->')).not.toEqual([])
  })
})
