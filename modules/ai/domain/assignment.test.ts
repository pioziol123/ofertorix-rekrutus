import { describe, expect, it } from 'vitest'
import { assignmentStatuses, isFinal, ownerActions } from './assignment.ts'

describe("the owner's actions an assignment allows (T12-R01, T12-R03, T12-R05)", () => {
  it('allows Retry only while the assignment needs attention within its time limit', () => {
    for (const status of assignmentStatuses)
      for (const withinTimeLimit of [true, false])
        expect(ownerActions({ status, withinTimeLimit }).retry).toBe(
          status === 'needs_attention' && withinTimeLimit,
        )
  })

  it('allows Reject while the assignment is not final, also past its time limit', () => {
    for (const withinTimeLimit of [true, false]) {
      expect(
        ownerActions({ status: 'in_progress', withinTimeLimit }).reject,
      ).toBe(true)
      expect(
        ownerActions({ status: 'needs_attention', withinTimeLimit }).reject,
      ).toBe(true)
      expect(
        ownerActions({ status: 'succeeded', withinTimeLimit }).reject,
      ).toBe(false)
      expect(ownerActions({ status: 'failed', withinTimeLimit }).reject).toBe(
        false,
      )
    }
  })

  it('counts succeeded and failed as final', () => {
    expect(assignmentStatuses.filter(isFinal)).toEqual(['succeeded', 'failed'])
  })
})
