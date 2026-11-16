import { createHash } from 'node:crypto'

/**
 * Canonical JSON: object keys sorted, arrays kept in order. Scope
 * fingerprints and ad content hashes are computed from it, so its output
 * must never change for existing values.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** SHA-256 of the canonical form: a scope fingerprint or a content hash. */
export function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
