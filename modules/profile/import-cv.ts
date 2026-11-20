import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { transaction } from '../../lib/db.ts'
import { sendJob } from '../../lib/queues/index.ts'
import { digest, validateDocument } from './domain/cv-document.ts'
import { originalFile } from './extract-cv-text.ts'
import { documentRoot } from './infrastructure/adapters/document-storage.ts'
import { cvTextReadingJob } from './infrastructure/worker/cv-text-queue.ts'
import {
  insertFileImport,
  insertTextImport,
  markImportFailed,
  setImportStatus,
} from './infrastructure/persistence/imports.ts'

/** Imports a pasted CV text; it is ready for review at once. */
export async function importCvText(text: string): Promise<string> {
  if (!text.trim() || text.length > 120000)
    throw new Error('Text must contain 1–120000 characters')
  const id = randomUUID()
  await insertTextImport(id, text, digest(text))
  return id
}

/**
 * Imports a CV document (PDF or DOCX): keeps the original in the private
 * document storage and requests reading its text (B4-R01). Storing the
 * original, then marking the import queued and requesting the job in one
 * transaction, happen before the import id is returned; when any of them fails the import is marked failed and
 * the error says the document was not accepted.
 */
export async function importCvDocument(
  name: string,
  bytes: Buffer,
  root = documentRoot(),
): Promise<string> {
  const kind = validateDocument(name, bytes),
    id = randomUUID(),
    pathKey = `${id}.${kind}`
  // Strip control characters and separators from the download filename.
  // eslint-disable-next-line no-control-regex
  const safeName = name.replace(/[\r\n\x00-\x1f/\\]/g, '_').slice(0, 200)
  await insertFileImport({
    id,
    kind,
    name: safeName,
    size: bytes.length,
    sha256: digest(bytes),
    pathKey,
  })
  try {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await writeFile(join(root, `${pathKey}.tmp`), bytes, {
      flag: 'wx',
      mode: 0o600,
    })
    await rename(join(root, `${pathKey}.tmp`), join(root, pathKey))
    await transaction(async () => {
      await setImportStatus(id, 'queued')
      await sendJob(cvTextReadingJob, { importId: id })
    })
  } catch {
    await markImportFailed(
      id,
      'Nie udało się przyjąć pliku. Sprawdź lokalny zapis dokumentów.',
    )
    throw new Error('Document storage failed')
  }
  return id
}

/**
 * The original document of an import, checked against its stored hash, or
 * null when the import has no document.
 */
export async function readOriginalFile(
  importId: string,
  root = documentRoot(),
) {
  return originalFile(importId, root)
}
