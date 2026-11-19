import { createHash } from 'node:crypto'

/** The SHA-256 of a document or text, as stored with an import. */
export const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex')

/** The kind of an uploaded CV document: a PDF or DOCX of at most 10 MiB. */
export function validateDocument(name: string, bytes: Buffer): 'pdf' | 'docx' {
  if (bytes.length > 10 * 1024 * 1024 || !bytes.length)
    throw new Error('Invalid document size')
  if (/\.pdf$/i.test(name) && bytes.subarray(0, 5).toString() === '%PDF-')
    return 'pdf'
  if (
    /\.docx$/i.test(name) &&
    bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  )
    return 'docx'
  throw new Error('Only PDF and DOCX are supported')
}
