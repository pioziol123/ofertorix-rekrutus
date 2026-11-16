import { describe, expect, it } from 'vitest'
import { finishedRunStatus } from './run-status.ts'

describe('finished run status (A5-R03)', () => {
  it.each([
    [true, false, 0, 'complete'],
    [true, false, 3, 'complete'],
    [false, false, 3, 'partial'],
    [false, false, 0, 'failed'],
    [true, true, 3, 'partial'],
    [true, true, 0, 'failed'],
    [false, true, 1, 'partial'],
  ] as const)(
    'source complete %s, save failed %s, %i saved ads: %s',
    (sourceComplete, saveFailed, uniqueAds, expected) => {
      expect(finishedRunStatus({ sourceComplete, saveFailed, uniqueAds })).toBe(
        expected,
      )
    },
  )
})
