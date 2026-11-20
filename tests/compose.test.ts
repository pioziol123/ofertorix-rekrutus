import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { workerTimings } from '../lib/workers/worker.ts'

/** The lines of one service of compose.yaml, up to the next service. */
function service(name: string): string {
  const compose = readFileSync(
    new URL('../compose.yaml', import.meta.url),
    'utf8',
  )
  const start = compose.search(new RegExp(`^  ${name}:\\s*$`, 'm'))
  expect(start, `service ${name}`).toBeGreaterThan(-1)
  const rest = compose.slice(start + 1)
  const end = rest.search(/^ {2}\S|^\S/m)
  return end === -1 ? rest : rest.slice(0, end)
}

/** A Compose duration such as `45s`, `1m30s` or `500ms`, in milliseconds. */
function duration(text: string): number {
  const units: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
  }
  let total = 0
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g))
    total += Number(amount) * units[unit!]!
  return total
}

describe('worker container configuration', () => {
  it('gives the worker more time to stop than the 30 s it waits for running jobs (B1-AC13)', () => {
    const grace = /^ {4}stop_grace_period:\s*(\S+)\s*$/m.exec(service('worker'))
    expect(grace, 'stop_grace_period of the worker').not.toBeNull()
    expect(duration(grace![1]!)).toBeGreaterThan(workerTimings.stopGraceMs)
  })

  it('checks the worker’s health through its liveness record (B1-AC14)', () => {
    expect(service('worker')).toMatch(/test: \[CMD, pnpm, health:worker\]/)
  })
})
