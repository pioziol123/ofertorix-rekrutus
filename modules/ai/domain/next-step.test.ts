import { describe, expect, it } from 'vitest'
import { nextStep } from './next-step.ts'

// The rule of what follows the end of an operation, checked from passed
// facts alone: no database, queue or executor.
describe('what follows the end of an operation (T4-R01, T4-R02, T4-R03, T6-R08)', () => {
  const failed = {
    assignmentStatus: 'in_progress',
    state: 'failed',
    retryable: true,
    origin: 'automatic',
  } as const
  const first = {
    automaticOperations: 1,
    automaticOperationLimit: 3,
    deadlinePassed: false,
  }

  it('adds a next operation after an ordinary failure of an automatic operation below the limit', () => {
    expect(nextStep(failed, first)).toBe('next_operation')
    expect(nextStep(failed, { ...first, automaticOperations: 2 })).toBe(
      'next_operation',
    )
  })

  it('needs attention after the last automatic operation failed', () => {
    expect(nextStep(failed, { ...first, automaticOperations: 3 })).toBe(
      'needs_attention',
    )
  })

  it('needs attention after a non-retryable failure, a failure of an operation the owner added, and an uncertain end', () => {
    expect(nextStep({ ...failed, retryable: false }, first)).toBe(
      'needs_attention',
    )
    expect(nextStep({ ...failed, origin: 'manual' }, first)).toBe(
      'needs_attention',
    )
    expect(
      nextStep({ ...failed, state: 'uncertain', retryable: null }, first),
    ).toBe('needs_attention')
  })

  it('adds no operation once the deadline has passed', () => {
    expect(nextStep(failed, { ...first, deadlinePassed: true })).toBe(
      'needs_attention',
    )
  })

  it('leaves a result to the delivery, and an assignment no longer in progress as it is', () => {
    expect(
      nextStep({ ...failed, state: 'succeeded', retryable: null }, first),
    ).toBe('nothing')
    for (const assignmentStatus of [
      'needs_attention',
      'succeeded',
      'failed',
    ] as const)
      expect(nextStep({ ...failed, assignmentStatus }, first)).toBe('nothing')
  })
})
