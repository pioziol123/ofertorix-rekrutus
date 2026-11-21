import { db } from '../../../../lib/db.ts'
import type { Proposal } from '../../domain/profile-data.ts'
import type { StoredDocument } from '../adapters/document-storage.ts'

/** The import fields proposal preparation checks before it starts. */
export type ImportForPreparation = {
  textRevision: number
  hasSourceText: boolean
  status: string
  originalName: string | null
}

/** Reads the import and locks it until the transaction ends. */
export async function lockImport(
  importId: string,
): Promise<ImportForPreparation | null> {
  const row = (
    await db().query(
      'SELECT text_revision,source_text IS NOT NULL AS has_source_text,status,original_name FROM profile_imports WHERE id=$1 FOR UPDATE',
      [importId],
    )
  ).rows[0]
  return row
    ? {
        textRevision: row.text_revision as number,
        hasSourceText: row.has_source_text as boolean,
        status: row.status as string,
        originalName: (row.original_name as string | null) ?? null,
      }
    : null
}

/**
 * Saves the cleaned text as the import's new revision with the assignment
 * placed for it, or none, clears the previous proposal and sets the status.
 * The import's assignment identifier always belongs to its current revision.
 */
export async function saveTextRevision(
  importId: string,
  revision: number,
  text: string,
  status: string,
  assignmentId: string | null,
) {
  await db().query(
    'INSERT INTO profile_import_texts(import_id,revision,text) VALUES($1,$2,$3)',
    [importId, revision, text],
  )
  await db().query(
    'UPDATE profile_imports SET professional_text=$2,text_revision=$3,proposal=NULL,status=$4,error=NULL,assignment_id=$5,updated_at=now() WHERE id=$1',
    [importId, text, revision, status, assignmentId],
  )
}

export async function setImportStatus(importId: string, status: string) {
  await db().query(
    'UPDATE profile_imports SET status=$2,error=NULL,updated_at=now() WHERE id=$1',
    [importId, status],
  )
}

/** A preparation in progress for an assignment, with the text it was placed for. */
export type AssignmentPreparation = {
  importId: string
  revision: number
  text: string
}

/**
 * The preparation of the import that keeps the assignment, while it is
 * still in progress, locking the import until the transaction ends; null
 * when no import keeps it or its preparation has ended.
 */
export async function lockAssignmentPreparation(
  assignmentId: string,
  inProgressStatus: string,
): Promise<AssignmentPreparation | null> {
  const row = (
    await db().query(
      `SELECT i.id,i.text_revision,t.text FROM profile_imports i JOIN profile_import_texts t ON t.import_id=i.id AND t.revision=i.text_revision
       WHERE i.assignment_id=$1 AND i.status=$2 FOR UPDATE OF i`,
      [assignmentId, inProgressStatus],
    )
  ).rows[0]
  return row
    ? {
        importId: row.id as string,
        revision: row.text_revision as number,
        text: row.text as string,
      }
    : null
}

/** The text of a revision, locking the import when it is still current. */
export async function lockCurrentText(
  importId: string,
  revision: number,
): Promise<string | null> {
  const row = (
    await db().query(
      `SELECT t.text FROM profile_imports i JOIN profile_import_texts t ON t.import_id=i.id AND t.revision=i.text_revision
       WHERE i.id=$1 AND i.text_revision=$2 FOR UPDATE OF i`,
      [importId, revision],
    )
  ).rows[0]
  return (row?.text as string | undefined) ?? null
}

/** Saves the proposal for the revision, if the revision is still current. */
export async function saveProposal(
  importId: string,
  revision: number,
  proposal: Proposal,
) {
  await db().query(
    "UPDATE profile_imports SET status='proposal',proposal=$3,error=NULL,updated_at=now() WHERE id=$1 AND text_revision=$2",
    [importId, revision, proposal],
  )
}

/**
 * Records that preparation for the revision ended without a proposal, if
 * the revision is still current.
 */
export async function saveNoProposal(
  importId: string,
  revision: number,
  message: string,
) {
  await db().query(
    "UPDATE profile_imports SET status='needs_attention',proposal=NULL,error=$3,updated_at=now() WHERE id=$1 AND text_revision=$2",
    [importId, revision, message],
  )
}

/** One import with everything the import read shows. */
export async function readImportRow(
  importId: string,
): Promise<Record<string, unknown> | null> {
  return (
    (await db().query('SELECT * FROM profile_imports WHERE id=$1', [importId]))
      .rows[0] ?? null
  )
}

export type ImportSummary = {
  id: string
  kind: string
  original_name: string | null
  status: string
  error: string | null
  created_at: Date
  assignment_id: string | null
}

/** The imports, newest first. */
export async function listImportRows(): Promise<ImportSummary[]> {
  return (
    await db().query(
      'SELECT id,kind,original_name,status,error,created_at,assignment_id FROM profile_imports ORDER BY created_at DESC',
    )
  ).rows
}

/** The import's saved proposal, the text it quotes and that text's revision. */
export type SavedProposal = {
  proposal: unknown
  text: string
  textRevision: number
}

/**
 * The proposal of an import whose preparation ended with one, or null. One
 * row read, so the proposal, the text and the revision belong together.
 */
export async function findSavedProposal(
  importId: string,
): Promise<SavedProposal | null> {
  const row = (
    await db().query(
      "SELECT proposal,professional_text,text_revision FROM profile_imports WHERE id=$1 AND status='proposal'",
      [importId],
    )
  ).rows[0]
  return row
    ? {
        proposal: row.proposal,
        text: row.professional_text as string,
        textRevision: row.text_revision as number,
      }
    : null
}

/** Saves a pasted CV text as an import ready for review. */
export async function insertTextImport(
  id: string,
  text: string,
  sha256: string,
) {
  await db().query(
    `INSERT INTO profile_imports(id,kind,status,source_text,sha256) VALUES($1,'text','ready',$2,$3)`,
    [id, text, sha256],
  )
}

/** Records an uploaded document whose original is being stored. */
export async function insertFileImport(file: {
  id: string
  kind: string
  name: string
  size: number
  sha256: string
  pathKey: string
}) {
  await db().query(
    `INSERT INTO profile_imports(id,kind,original_name,byte_size,sha256,path_key,status) VALUES($1,$2,$3,$4,$5,$6,'receiving')`,
    [file.id, file.kind, file.name, file.size, file.sha256, file.pathKey],
  )
}

/** Ends an import that could not be accepted, with the owner's message. */
export async function markImportFailed(importId: string, message: string) {
  await db().query(
    "UPDATE profile_imports SET status='failed',error=$2 WHERE id=$1",
    [importId, message],
  )
}

/** The stored original of an import, or null when it has none. */
export async function readImportDocument(
  importId: string,
): Promise<StoredDocument | null> {
  const row = (
    await db().query(
      'SELECT path_key,sha256,original_name,kind FROM profile_imports WHERE id=$1',
      [importId],
    )
  ).rows[0]
  if (!row?.path_key) return null
  return {
    pathKey: String(row.path_key),
    sha256: String(row.sha256),
    name: String(row.original_name),
    kind: String(row.kind),
  }
}

/**
 * Moves a file import that is queued, or left extracting by a lost attempt,
 * to extracting in one conditional write, and returns its kind; null
 * when the import is in any other state or does not exist (B4-R04).
 */
export async function takeImportForReading(
  importId: string,
): Promise<{ kind: string } | null> {
  const row = (
    await db().query(
      "UPDATE profile_imports SET status='extracting',updated_at=now() WHERE id=$1 AND status IN ('queued','extracting') RETURNING kind",
      [importId],
    )
  ).rows[0]
  return row ? { kind: String(row.kind) } : null
}

/** Saves the extracted text while the import is still being extracted. */
export async function saveExtractedText(importId: string, text: string) {
  await db().query(
    "UPDATE profile_imports SET status='ready',source_text=$2,error=NULL,updated_at=now() WHERE id=$1 AND status='extracting'",
    [importId, text],
  )
}

/** Asks for pasted text while the import is still being extracted. */
export async function markTextNeeded(importId: string, message: string) {
  await db().query(
    "UPDATE profile_imports SET status='needs_text',error=$2,updated_at=now() WHERE id=$1 AND status='extracting'",
    [importId, message],
  )
}

/**
 * Asks for pasted text after reading ended without a result, only while the
 * import is still queued or being extracted, so a repeat changes nothing.
 */
export async function markUnfinishedTextNeeded(
  importId: string,
  message: string,
) {
  await db().query(
    "UPDATE profile_imports SET status='needs_text',error=$2,updated_at=now() WHERE id=$1 AND status IN ('queued','extracting')",
    [importId, message],
  )
}

/** Marks an import whose original is unusable, while it is being extracted. */
export async function markSourceMissing(importId: string, message: string) {
  await db().query(
    "UPDATE profile_imports SET status='source_missing',error=$2,updated_at=now() WHERE id=$1 AND status='extracting'",
    [importId, message],
  )
}

/** The file imports whose reading was requested and has not ended. */
export async function unfinishedReadings(): Promise<string[]> {
  return (
    await db().query(
      "SELECT id FROM profile_imports WHERE status IN ('queued','extracting') AND path_key IS NOT NULL ORDER BY created_at",
    )
  ).rows.map((row) => row.id as string)
}
