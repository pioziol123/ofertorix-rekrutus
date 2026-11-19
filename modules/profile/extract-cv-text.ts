import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { PgBoss } from 'pg-boss'
import { transaction } from '../../lib/db.ts'
import {
  documentRoot,
  readStoredDocument,
  storedDocumentPath,
} from './infrastructure/adapters/document-storage.ts'
import {
  markSourceMissing,
  markTextNeeded,
  readImportDocument,
  requeueStalledImport,
  saveExtractedText,
  stalledImports,
  takeQueuedImport,
} from './infrastructure/persistence/imports.ts'
import { sendCvTextJob } from './infrastructure/worker/cv-text-queue.ts'

/**
 * The original document of an import, checked against its stored hash, or
 * null when the import has no document.
 */
export async function originalFile(importId: string, root = documentRoot()) {
  const document = await readImportDocument(importId)
  return document ? readStoredDocument(document, root) : null
}

/**
 * Reads the text of a queued file import. Only the run that moves the
 * import from queued to extracting reads it, and its result is saved only
 * while the import is still being extracted.
 */
export async function extractImport(id: string, root = documentRoot()) {
  const taken = await takeQueuedImport(id)
  if (!taken) return
  try {
    await originalFile(id, root)
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--max-old-space-size=256',
        '--import',
        'tsx',
        fileURLToPath(new URL('../../scripts/extract-cv.ts', import.meta.url)),
        taken.kind,
        storedDocumentPath(taken.pathKey, root),
      ],
      { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    )
    const { text } = JSON.parse(stdout) as { text: string }
    if (!text.trim()) throw new Error('No text')
    if (text.length > 120000) throw new Error('Too long')
    await saveExtractedText(id, text)
  } catch {
    await markTextNeeded(
      id,
      'Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany.',
    )
  }
}

/**
 * Queues again the file imports that have not moved for 3 minutes. Each
 * one changes only from the state and moment recovery read, so two
 * recoveries queue it once.
 */
export async function recoverImports(boss: PgBoss) {
  for (const stalled of await stalledImports()) {
    try {
      await originalFile(stalled.id)
    } catch {
      await markSourceMissing(stalled)
      continue
    }
    await transaction(async () => {
      if (await requeueStalledImport(stalled))
        await sendCvTextJob(boss, stalled.id)
    })
  }
}
