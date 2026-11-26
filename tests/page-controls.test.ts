import { describe, expect, it } from 'vitest'
import {
  escapeCloses,
  pageJumpKey,
  pageJumpNumbers,
  tooltipPosition,
} from '../app/utils/page-controls.ts'

/** The page controls of the page "Synchronizacje" (T1-R07, R09, R12). */

describe('the tooltip’s position (T1-R07, T1-AC05)', () => {
  const viewport = { width: 1000, height: 700 }
  const size = { width: 380, height: 60 }
  const box = (left: number, top: number, width = 80, height = 20) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  })
  const keepsMargin = (position: { left: number; top: number }) => {
    expect(position.left).toBeGreaterThanOrEqual(16)
    expect(position.top).toBeGreaterThanOrEqual(16)
    expect(position.left + size.width).toBeLessThanOrEqual(viewport.width - 16)
    expect(position.top + size.height).toBeLessThanOrEqual(viewport.height - 16)
  }

  it('sits under the label, aligned with its right edge', () => {
    const position = tooltipPosition(box(500, 100), size, viewport)
    expect(position).toEqual({ left: 200, top: 128 })
    keepsMargin(position)
  })

  it('keeps 16 px from the right edge for a label at the right edge of the window', () => {
    const position = tooltipPosition(box(930, 100, 70), size, viewport)
    expect(position.left).toBe(viewport.width - size.width - 16)
    keepsMargin(position)
  })

  it('keeps 16 px from the left, the top and the bottom edges', () => {
    keepsMargin(tooltipPosition(box(0, 100, 40), size, viewport))
    const low = tooltipPosition(box(500, 660), size, viewport)
    expect(low.top).toBe(660 - size.height - 8)
    keepsMargin(low)
    keepsMargin(tooltipPosition(box(500, 0, 80, 5), size, viewport))
  })
})

describe('the page list (T1-R09, T1-AC07)', () => {
  it('lists every page, and the pages starting with the typed digits', () => {
    expect(pageJumpNumbers(3, { typed: '' })).toEqual([1, 2, 3])
    expect(pageJumpNumbers(18, { typed: '1' })).toEqual([
      1, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ])
    expect(pageJumpNumbers(18, { typed: '12' })).toEqual([12])
    expect(pageJumpNumbers(18, { typed: '9' })).toEqual([9])
    expect(pageJumpNumbers(18, { typed: '19' })).toEqual([])
  })

  it('narrows by typed digits, restores the previous list on Backspace, opens the first page on Enter and closes on Escape', () => {
    let jump = { typed: '' }
    const press = (key: string) => {
      const outcome = pageJumpKey(18, jump, key)
      if (outcome.action === 'list') jump = outcome.jump
      return outcome
    }
    press('1')
    const afterOne = pageJumpNumbers(18, jump)
    press('2')
    expect(pageJumpNumbers(18, jump)).toEqual([12])
    press('Backspace')
    expect(pageJumpNumbers(18, jump)).toEqual(afterOne)
    expect(press('Enter')).toEqual({ action: 'open', page: 1 })
    press('5')
    expect(press('Enter')).toEqual({ action: 'open', page: 15 })
    expect(press('a')).toEqual({ action: 'list', jump: { typed: '15' } })
    expect(press('Escape')).toEqual({ action: 'close' })
    expect(pageJumpKey(18, { typed: '9' }, '9')).toEqual({
      action: 'list',
      jump: { typed: '99' },
    })
    expect(pageJumpKey(18, { typed: '99' }, 'Enter')).toEqual({
      action: 'list',
      jump: { typed: '99' },
    })
  })
})

describe('Escape on the page (T1-R12, T1-AC10)', () => {
  it('closes the details when no list is open, an open list first', () => {
    const open = { filterList: false, pageList: false, details: true }
    expect(escapeCloses(open)).toBe('details')
    expect(escapeCloses({ ...open, pageList: true })).toBe('pageList')
    expect(escapeCloses({ ...open, filterList: true })).toBe('filterList')
    expect(escapeCloses({ ...open, details: false })).toBeNull()
  })
})
