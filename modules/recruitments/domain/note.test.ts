import { describe, expect, it } from 'vitest'
import { refusalText } from '../refusal-codes.ts'
import {
  checkNote,
  noteCounterText,
  noteFits,
  noteLength,
  noteLimit,
  NoteTooLong,
} from './note.ts'

/** The note's limit and its counter (task oferty-pracy-lq3.2, A-R09, A-R10, T2-R13). */
describe('the note of an application', () => {
  it('allows 10 000 characters and refuses 10 001 with the reason of A-R10 (A-AC03)', () => {
    expect(noteLimit).toBe(10_000)
    expect(() => checkNote('a'.repeat(10_000))).not.toThrow()
    expect(() => checkNote('')).not.toThrow()
    const refusal = (() => {
      try {
        checkNote('a'.repeat(10_001))
      } catch (error) {
        return error
      }
    })()
    expect(refusal).toBeInstanceOf(NoteTooLong)
    expect((refusal as NoteTooLong).reason).toBe('note_too_long')
    expect(refusalText('note_too_long')).toBe(
      'Notatka może mieć najwyżej 10 000 znaków',
    )
  })

  it('counts characters as Unicode code points, so a letter outside the basic plane is one', () => {
    expect(noteLength('ąę😀')).toBe(3)
    expect(noteFits('😀'.repeat(10_000))).toBe(true)
    expect(noteFits('😀'.repeat(10_001))).toBe(false)
  })

  it('shows the counter as "N / 10 000" (T2-AC11)', () => {
    expect(noteCounterText('')).toBe('0 / 10 000')
    expect(noteCounterText('a'.repeat(123))).toBe('123 / 10 000')
    expect(noteCounterText('a'.repeat(1234))).toBe('1 234 / 10 000')
    expect(noteCounterText('a'.repeat(10_001))).toBe('10 001 / 10 000')
  })
})
