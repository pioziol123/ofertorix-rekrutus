import { z } from 'zod'
import {
  assignmentPageSize,
  type AssignmentListPage,
  type AssignmentRow,
} from '../domain/panel.ts'
import {
  readAssignmentListRows,
  type AssignmentListRow,
  type ListPosition,
} from '../infrastructure/persistence/panel.ts'
import { requestingModuleName } from './resolve-executor.ts'

const cursorSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  z.uuid(),
])

const encodeCursor = (position: ListPosition) =>
  Buffer.from(
    JSON.stringify([position.group, position.placedAt, position.id]),
  ).toString('base64url')

/** The position a cursor gives; null for one this read did not write. */
function decodeCursor(cursor: string): ListPosition | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    )
    if (!parsed.success) return null
    const [group, placedAt, id] = parsed.data
    if (Number.isNaN(Date.parse(placedAt))) return null
    return { group, placedAt, id }
  } catch {
    return null
  }
}

/**
 * The row data of an assignment for the panel (T11-R02): the requesting
 * module's name from the settings, and the time left to the time limit at
 * `now` for an assignment not yet final.
 */
export function assignmentRow(
  row: AssignmentListRow,
  now: Date,
): AssignmentRow {
  const final = row.status === 'succeeded' || row.status === 'failed'
  return {
    assignmentId: row.id,
    label: row.label,
    type: row.type,
    requestingModule: requestingModuleName(row.settingsName),
    executor: row.executor,
    status: row.status,
    failureReason: row.failureReason,
    placedAt: row.placedAt.toISOString(),
    deadline: row.deadline.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    timeLeftSeconds: final
      ? null
      : Math.max(
          0,
          Math.floor((row.deadline.getTime() - now.getTime()) / 1000),
        ),
    charge: row.charge,
  }
}

/**
 * One page of the panel's list of assignments (T11-R02): every assignment,
 * those needing attention first, then the others, each group from the
 * newest placed, 50 at a time. Without a cursor it gives the first page;
 * the cursor of a page gives the one after it. A cursor this read did not
 * write gives an empty page. Reads committed state without row locks; a
 * row placed or changed between two pages may be missed or shown twice.
 */
export async function readAssignmentList(
  cursor?: string | null,
  now: Date = new Date(),
): Promise<AssignmentListPage> {
  const after = cursor ? decodeCursor(cursor) : null
  if (cursor && !after) return { items: [], nextCursor: null }
  const rows = await readAssignmentListRows(after, assignmentPageSize + 1)
  const page = rows.slice(0, assignmentPageSize)
  return {
    items: page.map((row) => assignmentRow(row, now)),
    nextCursor:
      rows.length > assignmentPageSize
        ? encodeCursor(page.at(-1)!.position)
        : null,
  }
}
