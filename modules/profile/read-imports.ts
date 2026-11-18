import { scrubContacts } from '../../lib/contact-details.ts'
import { readLatestExecution } from '../ai/index.ts'
import {
  preparationInProgress,
  preparationView,
} from './domain/proposal-preparation.ts'
import {
  listImportRows,
  readImportRow,
  type ImportSummary,
} from './infrastructure/persistence/imports.ts'

export { proposalAiConfigured } from './infrastructure/adapters/proposal-ai.ts'

/** The status and message with the state of proposal preparation. */
async function withPreparation<
  T extends { id: string; status: string; error: string | null },
>(row: T): Promise<T> {
  if (!preparationInProgress.includes(row.status)) return row
  return { ...row, ...preparationView(row, await readLatestExecution(row.id)) }
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
