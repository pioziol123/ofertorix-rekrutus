import { describe, expect, it } from 'vitest'
import { aboveZero, limitAmount, limitAmountMessages } from './budget.ts'

describe('an amount the owner sets as a limit (T13-R04)', () => {
  it('refuses a text, a negative amount and an amount with three decimal places, each with a message (T13-AC04)', () => {
    expect(limitAmount('sto złotych')).toEqual({
      refused: limitAmountMessages.notNumber,
    })
    expect(limitAmount('')).toEqual({ refused: limitAmountMessages.notNumber })
    expect(limitAmount('-5')).toEqual({ refused: limitAmountMessages.negative })
    expect(limitAmount('-0,50')).toEqual({
      refused: limitAmountMessages.negative,
    })
    expect(limitAmount('12.345')).toEqual({
      refused: limitAmountMessages.decimals,
    })
    expect(limitAmount('12,345')).toEqual({
      refused: limitAmountMessages.decimals,
    })
    for (const message of Object.values(limitAmountMessages))
      expect(message).not.toBe('')
  })

  it('accepts zero and more, with up to two decimal places (T13-R02, T13-R03)', () => {
    expect(limitAmount('0')).toEqual({ amount: '0' })
    expect(limitAmount(' 150 ')).toEqual({ amount: '150' })
    expect(limitAmount('150.5')).toEqual({ amount: '150.5' })
    expect(limitAmount('0012.30')).toEqual({ amount: '12.30' })
  })

  it('reads a comma as the decimal point, and refuses an amount the limit cannot hold (sq2.14 ASM-2)', () => {
    expect(limitAmount('150,50')).toEqual({ amount: '150.50' })
    expect(limitAmount('9999999999,99')).toEqual({ amount: '9999999999.99' })
    expect(limitAmount('10000000000')).toEqual({
      refused: limitAmountMessages.tooLarge,
    })
    expect(limitAmount('1 000')).toEqual({
      refused: limitAmountMessages.notNumber,
    })
  })
})

describe('a part of the budget shown only above zero (T13-R01)', () => {
  it('tells zero from an amount', () => {
    expect(aboveZero('0.000000')).toBe(false)
    expect(aboveZero('0.000001')).toBe(true)
  })
})
