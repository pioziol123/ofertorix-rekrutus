import { scrubContacts } from '../../lib/contact-details.ts'
import { readLatestExecution } from '../ai/index.ts'
import {
  needsOldExecution,
  preparationView,
} from './domain/proposal-preparation.ts'
import {
  listImportRows,
  readImportRow,
  type ImportSummary,
} from './infrastructure/persistence/imports.ts'

export { proposalAiConfigured } from './infrastructure/adapters/proposal-ai.ts'

/**
 * The status and message with the state of proposal preparation. Only a
 * preparation of the old way reads its latest execution; a preparation
 * with an assignment is shown from the import alone (ZA-D09).
 */
async function withPreparation<
  T extends {
    id: string
    status: string
    error: string | null
    assignment_id?: string | null
  },
>(row: T): Promise<T> {
  const stored = { ...row, assignmentId: row.assignment_id ?? null }
  if (!needsOldExecution(stored)) return row
  return {
    ...row,
    ...preparationView(stored, await readLatestExecution(row.id)),
  }
}

/**
 * One import: its state, the text for review, the state and result of
 * proposal preparation, without the storage details of the original file.
 */
export async function readImport(importId: string) {
  const row = await readImportRow(importId)
  if (!row) return null
  const {
    path_key: _path,
    sha256: _hash,
    ...view
  } = row as Record<string, unknown> & {
    id: string
    status: string
    error: string | null
    assignment_id: string | null
  }
  return {
    ...(await withPreparation(view)),
    suggested_text: scrubContacts(
      String(row.professional_text ?? row.source_text ?? ''),
    ),
  }
}

/** The imports, newest first, with the state of proposal preparation. */
export async function listImports(): Promise<ImportSummary[]> {
  return Promise.all((await listImportRows()).map(withPreparation))
}
