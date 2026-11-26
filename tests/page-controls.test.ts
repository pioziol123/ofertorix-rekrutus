import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  afterRequestQuery,
  historyAddress,
  type SyncHistoryQuery,
} from '../modules/sources/view.ts'
import {
  escapeCloses,
  pageJumpKey,
  pageJumpNumbers,
  tooltipPosition,
  navigationStayed,
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
    const open = {
      dialog: false,
      filterList: false,
      pageList: false,
      details: true,
    }
    expect(escapeCloses(open)).toBe('details')
    expect(escapeCloses({ ...open, pageList: true })).toBe('pageList')
    expect(escapeCloses({ ...open, filterList: true })).toBe('filterList')
    expect(escapeCloses({ ...open, details: false })).toBeNull()
    // The dialog of the sources to sync closes first (T3-R01).
    expect(
      escapeCloses({ ...open, filterList: true, pageList: true, dialog: true }),
    ).toBe('dialog')
  })
})

describe('the list read after a request (T3-R07, R08, T3-AC07)', () => {
  const start: SyncHistoryQuery = {
    sources: ['indeed'],
    states: [],
    trigger: null,
    period: 'all',
    page: 2,
    size: 20,
  }
  const target = (sync: string | null) => ({
    path: '/syncs',
    query: historyAddress(afterRequestQuery(start), sync),
  })

  it.each([
    ['another list', '/syncs?source=indeed&period=all&page=2', null],
    ['that list', '/syncs?state=queued,running', null],
    ['that list with repeated keys', '/syncs?state=queued&state=running', null],
    [
      'that list with the open sync first',
      '/syncs?sync=a&state=queued,running',
      'a',
    ],
    [
      'that list with the same open sync',
      '/syncs?state=queued,running&sync=a',
      'a',
    ],
    [
      'that list with another sync to open',
      '/syncs?state=queued,running&sync=a',
      'b',
    ],
  ])(
    'reads the list once from %s: through the changed address or by its own read',
    async (_, from, sync) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/syncs', component: {} }],
      })
      await router.push(from)
      const before = router.currentRoute.value
      const result = await router.push(target(sync))
      // The page reads the list when its route changes, and itself when
      // the navigation stayed: exactly one of them happens.
      const changed = router.currentRoute.value !== before
      expect(Number(changed) + Number(navigationStayed(result))).toBe(1)
    },
  )
})
