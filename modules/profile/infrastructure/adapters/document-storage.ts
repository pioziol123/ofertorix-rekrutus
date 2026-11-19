import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { digest } from '../../domain/cv-document.ts'

/** The private directory of the original CV documents. */
export const documentRoot = () => process.env.DOCUMENTS_DIR ?? '/data/documents'

/** The stored file of an import, as its row records it. */
export type StoredDocument = {
  pathKey: string
  sha256: string
  name: string
  kind: string
}

/**
 * Reads a stored original and checks it against its recorded hash. Throws
 * when the reference is not one the import wrote, or the file is missing or
 * changed.
 */
export async function readStoredDocument(
  document: StoredDocument,
  root = documentRoot(),
) {
  if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(document.pathKey))
    throw new Error('Invalid document reference')
  let bytes: Buffer
  try {
    bytes = await readFile(join(root, document.pathKey))
  } catch {
    throw new Error('Source document missing')
  }
  if (digest(bytes) !== document.sha256)
    throw new Error('Source document hash mismatch')
  return { bytes, name: document.name, kind: document.kind }
}

/** The path of a stored original, for the text extraction process. */
export const storedDocumentPath = (pathKey: string, root = documentRoot()) =>
  join(root, pathKey)
