import { describe, expect, it } from 'vitest'
import { choiceOnClose, choiceSummary } from '../app/utils/multi-choice.ts'

/** The shared multi-choice filter (lq3 T4-R02, nq3 T1-R08). */

describe('the shared multi-choice filter (nq3 T1-AC06, lq3 T4-AC02)', () => {
  it('applies a list when it closes, an empty choice meaning all', () => {
    expect(choiceOnClose(['indeed'], ['indeed'])).toBeNull()
    expect(choiceOnClose(['indeed', 'bayt'], ['bayt', 'indeed'])).toBeNull()
    expect(choiceOnClose([], ['indeed', 'bayt'])).toEqual(['indeed', 'bayt'])
    expect(choiceOnClose(['indeed'], [])).toEqual([])
  })

  it('says "Wszystkie" for nothing chosen, the label of one choice, or a count', () => {
    const label = (value: string) => value.toUpperCase()
    expect(choiceSummary([], label)).toBe('Wszystkie')
    expect(choiceSummary(['indeed'], label)).toBe('INDEED')
    expect(choiceSummary(['indeed', 'bayt'], label)).toBe('Wybrano: 2')
  })
})
