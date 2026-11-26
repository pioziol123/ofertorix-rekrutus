/**
 * Mechanics of page controls that follow from no module's rules: where a
 * tooltip goes in the window, the keyboard of a page-number list and which
 * overlay Escape closes. Pure functions, so tests check them without a
 * browser. Used by the page "Synchronizacje" (T1-R07, R09, R12).
 */

import { isNavigationFailure, NavigationFailureType } from 'vue-router'

type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Where a tooltip of `size` goes for an anchor's box in a window of
 * `viewport` (T1-R07): under the anchor, right-aligned with it, or above it
 * when there is no room below, always at least `margin` px from every edge
 * of the window that can hold it.
 */
export function tooltipPosition(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 16,
  gap = 8,
): { left: number; top: number } {
  const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(value, high))
  const left = clamp(
    anchor.right - size.width,
    margin,
    viewport.width - size.width - margin,
  )
  let top = anchor.bottom + gap
  if (top + size.height > viewport.height - margin)
    top = anchor.top - size.height - gap
  return {
    left,
    top: clamp(top, margin, viewport.height - size.height - margin),
  }
}

/** The open page list (T1-R09): the digits typed so far. */
export type PageJump = { typed: string }

/** The page numbers the list shows: those starting with the typed digits. */
export const pageJumpNumbers = (pages: number, jump: PageJump): number[] =>
  Array.from({ length: pages }, (_, index) => index + 1).filter((page) =>
    String(page).startsWith(jump.typed),
  )

/**
 * What a key does while the page list is open (T1-R09): a digit narrows
 * the list, Backspace removes the last digit, Enter opens the first page
 * shown, Escape closes the list. Other keys change nothing.
 */
export function pageJumpKey(
  pages: number,
  jump: PageJump,
  key: string,
):
  | { action: 'list'; jump: PageJump }
  | { action: 'open'; page: number }
  | { action: 'close' } {
  if (/^\d$/.test(key))
    return { action: 'list', jump: { typed: jump.typed + key } }
  if (key === 'Backspace')
    return { action: 'list', jump: { typed: jump.typed.slice(0, -1) } }
  if (key === 'Escape') return { action: 'close' }
  if (key === 'Enter') {
    const first = pageJumpNumbers(pages, jump)[0]
    return first === undefined
      ? { action: 'list', jump }
      : { action: 'open', page: first }
  }
  return { action: 'list', jump }
}

/**
 * What Escape closes on the page, innermost first: the dialog of the
 * sources to sync (T3-R01), an open filter list, the page list, then the
 * details drawer (T1-R08, R09, R12).
 */
export function escapeCloses(open: {
  dialog: boolean
  filterList: boolean
  pageList: boolean
  details: boolean
}): 'dialog' | 'filterList' | 'pageList' | 'details' | null {
  if (open.dialog) return 'dialog'
  if (open.filterList) return 'filterList'
  if (open.pageList) return 'pageList'
  return open.details ? 'details' : null
}

/**
 * Whether a navigation of the router stayed at the address the page shows.
 * The page reads its list whenever its address changes, so after such a
 * navigation it reads the list itself, and otherwise leaves the read to the
 * navigation: either way it reads it once (T3-R07, R08). The router decides
 * what the same address is, key order and repeated keys included.
 */
export const navigationStayed = (result: unknown): boolean =>
  isNavigationFailure(result, NavigationFailureType.duplicated)
