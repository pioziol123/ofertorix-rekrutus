// Finds implementation detail below the level of a specification document:
// what the implementer chooses (paths, file names, function and class code,
// code blocks) has no place in a solution design or in requirements.

export type Severity = 'error' | 'warning'

export interface AltitudeIssue {
  line: number
  severity: Severity
  rule: string
  match: string
}

/** A line carrying this marker with a reason is skipped, e.g. to name legacy code once. */
const SUPPRESS = /<!--\s*altitude-ok:\s*\S[^>]*-->/
/** URLs point outside the repository and are left alone. */
const URL = /\b[a-z][\w+.-]*:\/\/\S+/gi

const CODE_FILE = /(?<![\w./-])[\w./-]*\w\.(?:ts|tsx|mts|cts|js|mjs|cjs|vue|py|sh|sql|json|ya?ml)(?![\w-])/g
/** Product names that look like file names, such as Node.js or Chart.js. */
const PRODUCT_NAME = /^[A-Z][\w]*\.js$/
const FUNCTION_CODE = /\bfunction\s*\w*\s*\(|\bclass\s+[A-Z]\w*\s*(?:\{|extends\b|implements\b)/g
/** Inline code that reads as an identifier, a member access or a call. */
const IDENTIFIER = /`(?:[a-z]+[A-Z]\w*|[A-Z][a-z0-9]+[A-Z]\w*|[^`\s]*\w\.[a-z]\w*[^`\s]*|[^`]*\w\([^`]*)`/g
const FENCE = /^\s*(?:>\s*)*(```+|~~~+)\s*([\w-]*)/
/** Fenced blocks that hold a diagram rather than code. */
const DIAGRAM = new Set(['mermaid'])

/**
 * Checks one document. `directories` are the repository's top-level code
 * directories; a path into one of them is below the document's level.
 */
export function findAltitudeIssues(text: string, directories: readonly string[]): AltitudeIssue[] {
  const issues: AltitudeIssue[] = []
  const directory = directories.length
    ? new RegExp(`(?<![\\w./-])(?:${directories.map(escape).join('|')})/(?:[\\w./-]*[\\w/])?`, 'g')
    : null
  let fence: { marker: string; line: number } | null = null

  for (const [index, raw] of text.split('\n').entries()) {
    const line = index + 1
    const opening = FENCE.exec(raw)
    if (fence !== null) {
      if (opening && opening[1]!.startsWith(fence.marker) && !opening[2]) fence = null
      continue
    }
    if (opening) {
      fence = { marker: opening[1]!, line }
      if (!DIAGRAM.has(opening[2]!.toLowerCase()))
        issues.push({ line, severity: 'error', rule: 'code block', match: raw.trim() })
      continue
    }
    if (SUPPRESS.test(raw)) continue
    const content = raw.replace(URL, '')

    const add = (severity: Severity, rule: string, pattern: RegExp | null, keep = (_: string) => true) => {
      if (!pattern) return
      for (const found of content.matchAll(pattern))
        if (keep(found[0])) issues.push({ line, severity, rule, match: found[0] })
    }
    add('error', 'code file', CODE_FILE, (match) => !PRODUCT_NAME.test(match))
    const files = issues.filter((issue) => issue.line === line).map((issue) => issue.match)
    add('error', 'code path', directory, (match) => !files.some((file) => file.includes(match)))
    add('error', 'function or class code', FUNCTION_CODE)
    add('warning', 'code identifier', IDENTIFIER, (match) => !files.some((file) => match.includes(file)))
  }

  if (fence !== null)
    issues.push({ line: fence.line, severity: 'error', rule: 'unclosed code block', match: 'no closing fence' })
  return issues
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
