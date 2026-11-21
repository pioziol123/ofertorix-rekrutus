import { readExchangeOfAssignment } from '../infrastructure/persistence/operations.ts'

/** What one operation sent to its provider and received, in order. */
export type OperationExchange = {
  /** The operation's place among its assignment's operations, from 1. */
  ordinal: number
  /** Each request as sent and each raw response as received (T2-R08). */
  entries: { kind: 'request' | 'response'; content: string }[]
}

/** The exchange of an assignment, or null for an unknown identifier. */
export type AssignmentExchange = {
  assignmentId: string
  /** Every operation of the assignment, from the first. */
  operations: OperationExchange[]
} | null

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads the exchange kept with an assignment's operations (solution design
 * of epic sq2, T7–T9, "Contract: exchange read"): for each operation, in
 * order, the requests sent and the raw responses received, as the executor
 * wrote them. An operation that sent nothing has no entries. An unknown
 * identifier gives null. It reads committed state without row locks. Its
 * one consumer is Matching's view of an assessment's provider exchange
 * (T8-R07); the exchange holds the requesting module's input and the
 * provider's full output, so it stays out of every other read.
 */
export async function readAssignmentExchange(
  assignmentId: string,
): Promise<AssignmentExchange> {
  if (!uuid.test(assignmentId)) return null
  const id = assignmentId.toLowerCase()
  const { exists, operations, rows } = await readExchangeOfAssignment(id)
  if (!exists) return null
  return {
    assignmentId: id,
    operations: operations.map((ordinal) => ({
      ordinal,
      entries: rows
        .filter((row) => row.ordinal === ordinal)
        .map((row) => ({ kind: row.kind, content: row.content })),
    })),
  }
}
