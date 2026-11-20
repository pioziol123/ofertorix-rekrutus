import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sendJob } from '../../lib/queues/index.ts'
import { transaction } from '../../lib/db.ts'
import {
  documentRoot,
  readStoredDocument,
  storedDocumentPath,
} from './infrastructure/adapters/document-storage.ts'
import {
  markSourceMissing,
  markTextNeeded,
  markUnfinishedTextNeeded,
  readImportDocument,
  saveExtractedText,
  takeImportForReading,
  unfinishedReadings,
} from './infrastructure/persistence/imports.ts'
import {
  cvTextReadingJob,
  type CvTextReading,
} from './infrastructure/worker/cv-text-queue.ts'

/** What the owner sees when the text could not be read (B4-R02). */
export const textNeededMessage =
  'Nie udało się odczytać tekstu (plik bez tekstu, uszkodzony, zablokowany lub przekroczony limit). Wklej tekst CV; oryginał jest zachowany.'

/** What the owner sees when the stored original is unusable (B4-R03). */
export const sourceMissingMessage = 'Brak poprawnego pliku źródłowego'

/**
 * The original document of an import, checked against its stored hash, or
 * null when the import has no document.
 */
export async function originalFile(importId: string, root = documentRoot()) {
  const document = await readImportDocument(importId)
  return document ? readStoredDocument(document, root) : null
}

/**
 * The job handler of reading a CV's text (B4-R02–B4-R04). Only a run that
 * moves the import from queued, or from extracting left by a lost attempt,
 * to extracting reads it; an import in any other state is not changed.
 * Exclusivity with a constant key lets no other reading run meanwhile, so
 * taking over an import left extracting cannot overlap another reading. Its
 * result is saved only while the import is still being extracted.
 */
export async function readCvText(
  { importId }: CvTextReading,
  root = documentRoot(),
) {
  const taken = await takeImportForReading(importId)
  if (!taken) return
  const document = await readImportDocument(importId)
  try {
    if (!document) throw new Error('No stored original')
    await readStoredDocument(document, root)
  } catch {
    await markSourceMissing(importId, sourceMissingMessage)
    return
  }
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--max-old-space-size=256',
        '--import',
        'tsx',
        fileURLToPath(
          new URL('./infrastructure/adapters/extract-cv.ts', import.meta.url),
        ),
        taken.kind,
        storedDocumentPath(document.pathKey, root),
      ],
      { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    )
    const { text } = JSON.parse(stdout) as { text: string }
    if (!text.trim()) throw new Error('No text')
    if (text.length > 120000) throw new Error('Too long')
    await saveExtractedText(importId, text)
  } catch {
    await markTextNeeded(importId, textNeededMessage)
  }
}

/**
 * The failure handler of reading a CV's text, called after the last attempt
 * failed, also when the worker died in it (B4-R05, B1-D10): asks for pasted
 * text while the import is still queued or being extracted. A CV in any
 * other state, e.g. read meanwhile, is not changed, and a repeat has no
 * further effect.
 */
export async function endFailedCvTextReading({ importId }: CvTextReading) {
  await markUnfinishedTextNeeded(importId, textNeededMessage)
}

/**
 * Requests one reading in the queue library for every file import that is
 * queued or being extracted, in one transaction (B4-R08). The migration
 * step calls it once, while the queue of the former path still exists, so
 * the imports that queue held are read in the new way. Returns how many.
 */
export async function requestUnfinishedCvTextReadings(): Promise<number> {
  return transaction(async () => {
    const imports = await unfinishedReadings()
    for (const importId of imports)
      await sendJob(cvTextReadingJob, { importId })
    return imports.length
  })
}
