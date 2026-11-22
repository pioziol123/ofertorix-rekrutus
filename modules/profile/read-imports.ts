import { scrubContacts } from '../../lib/contact-details.ts'
import {
  listImportRows,
  readImportRow,
  type ImportSummary,
} from './infrastructure/persistence/imports.ts'

export { proposalAiConfigured } from './infrastructure/adapters/proposal-ai.ts'

/**
 * One import: its state, the text for review, the state and result of
 * proposal preparation as the import stores them (ZA-D09), without the
 * storage details of the original file.
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
    ...view,
    suggested_text: scrubContacts(
      String(row.professional_text ?? row.source_text ?? ''),
    ),
  }
}

/** The imports, newest first, with the state of proposal preparation. */
export async function listImports(): Promise<ImportSummary[]> {
  return listImportRows()
}
