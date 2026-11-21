import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { queueErrorHandling, runPass, startPasses } from '../periodic/pass.ts'
import { periodicSteps } from '../periodic/steps.ts'

describe('the periodic process (B6-R09)', () => {
  it('logs the error of one step with its name and still runs the others, in order (B6-AC08)', async () => {
    const ran: string[] = []
    const logged: string[] = []
    await runPass(
      [
        { name: 'first', run: async () => ran.push('first') },
        {
          name: 'failing',
          run: async () => {
            ran.push('failing')
            throw new Error('database unavailable')
          },
        },
        { name: 'last', run: async () => ran.push('last') },
      ],
      (message) => logged.push(message),
    )
    expect(ran).toEqual(['first', 'failing', 'last'])
    expect(logged).toEqual([
      'Periodic step "failing" failed: database unavailable',
    ])
  })

  it('starts the next pass only after the previous one ended, and stops after the running pass', async () => {
    const events: string[] = []
    let passes = 0
    const process = startPasses(
      [
        {
          name: 'slow',
          run: async () => {
            const pass = ++passes
            events.push(`start ${pass}`)
            await sleep(40)
            events.push(`end ${pass}`)
          },
        },
      ],
      { intervalMs: 10 },
    )
    await sleep(75)
    await process.stop()
    const ended = events.length
    await sleep(40)
    expect(events.length).toBe(ended)
    expect(events.slice(0, 4)).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
    expect(events.at(-1)).toMatch(/^end /)
  })

  it('funds AI work, advances and cleans up batches, resumes profile proposals and requests the daily syncs, in that order', () => {
    expect(periodicSteps.map((step) => step.name)).toEqual([
      'fund AI executions waiting for budget',
      'advance sent AI batches',
      'clean up ended AI batches',
      'resume profile proposal preparations',
      'request daily ad syncs',
    ])
  })

  it('ends the process for a queue error while it starts and only logs one after it started', () => {
    const ended: string[] = []
    const logged: string[] = []
    const handling = queueErrorHandling(
      (message) => ended.push(message),
      (message) => logged.push(message),
    )
    handling.listener(new Error('connection refused'))
    expect(ended).toEqual(['the queue reported an error: connection refused'])
    handling.started()
    handling.listener(new Error('supervision failed'))
    expect(ended).toHaveLength(1)
    expect(logged).toEqual(['Queue unavailable: supervision failed'])
  })
})
