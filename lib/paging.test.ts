import { describe, expect, it } from 'vitest'
import {
  changePageSize,
  defaultPageSize,
  pageCount,
  pageSizes,
  readPage,
  readPageSize,
  showPage,
} from './paging.ts'

/** The shared paging (lq3 T4-R01, nq3 T1-R09). */

describe('the shared paging (nq3 T1-AC07, lq3 T4-AC01)', () => {
  it('offers 10, 20, 50 and 100 per page, 20 by default', () => {
    expect(pageSizes).toEqual([10, 20, 50, 100])
    expect(defaultPageSize).toBe(20)
    for (const size of pageSizes) expect(readPageSize(String(size))).toBe(size)
    for (const raw of [null, '30', 'abc', '', '20.5'])
      expect(readPageSize(raw), String(raw)).toBe(20)
  })

  it('reads a page below 1 or an unreadable one as page 1', () => {
    expect(readPage('7')).toBe(7)
    for (const raw of [null, '0', '-3', 'x', '2.5'])
      expect(readPage(raw), String(raw)).toBe(1)
  })

  it('goes back to page 1 when the number per page changes', () => {
    const onPage3 = { page: 3, size: 50 as const, other: 'kept' }
    expect(changePageSize(onPage3, 100)).toEqual({
      page: 1,
      size: 100,
      other: 'kept',
    })
    expect(changePageSize(onPage3, 50)).toBe(onPage3)
    expect(showPage(onPage3, 7)).toEqual({ ...onPage3, page: 7 })
    expect(showPage(onPage3, 0).page).toBe(1)
  })

  it('counts at least one page', () => {
    expect(pageCount(0, 20)).toBe(1)
    expect(pageCount(20, 20)).toBe(1)
    expect(pageCount(21, 20)).toBe(2)
  })
})
