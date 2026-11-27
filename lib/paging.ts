/**
 * The paging library: the one list of numbers per page and the rules of
 * moving between pages that every paged list shares (lq3 T4-R01, nq3
 * T1-R09). Pure and without server-only dependencies, so the pages in the
 * browser and the modules' reads on the server use the same list: a read
 * accepts exactly the numbers its page offers.
 */

export const pageSizes = [10, 20, 50, 100] as const
export type PageSize = (typeof pageSizes)[number]
export const defaultPageSize: PageSize = 20

/** The number per page an address names, or the default when it is not one of `pageSizes`. */
export function readPageSize(raw: string | null): PageSize {
  const size = Number(raw)
  return (pageSizes as readonly number[]).includes(size)
    ? (size as PageSize)
    : defaultPageSize
}

/**
 * The page an address names: an unreadable page gives 1, a page below 1
 * gives 1. The page beyond the last is left to the read, which knows the
 * total.
 */
export const readPage = (raw: string | null): number =>
  raw !== null && /^-?\d+$/.test(raw) ? Math.max(1, Number(raw)) : 1

/** Number of pages for `total` matching rows, at least 1. */
export const pageCount = (total: number, size: number): number =>
  Math.max(1, Math.ceil(total / size))

/** The query after the number per page changed: back to page 1. */
export const changePageSize = <Q extends { page: number; size: PageSize }>(
  query: Q,
  size: PageSize,
): Q => (size === query.size ? query : { ...query, size, page: 1 })

/** The query showing another page. */
export const showPage = <Q extends { page: number }>(
  query: Q,
  page: number,
): Q => ({ ...query, page: Math.max(1, Math.trunc(page)) })
