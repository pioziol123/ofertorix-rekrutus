/**
 * Untracked settings of the runner's copy. The agent token stays in `.sandcastle/.env`,
 * which Sandcastle passes into the agent's environment; the location of the task
 * database lives apart in `.sandcastle/runner.json`, so no path of the owner's copy
 * reaches the agent (U2-R03, U2-R05).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ENV_FILE = '.sandcastle/.env'
export const SETTINGS_FILE = '.sandcastle/runner.json'
export const TOKEN_KEY = 'CLAUDE_CODE_OAUTH_TOKEN'

export interface Settings {
  /** The `.beads` directory of the owner's task database. */
  beadsDir: string
}

export function readSettings(repo: string): Settings {
  return JSON.parse(readFileSync(join(repo, SETTINGS_FILE), 'utf8')) as Settings
}

export function writeSettings(repo: string, settings: Settings): void {
  writeFileSync(join(repo, SETTINGS_FILE), `${JSON.stringify(settings, null, 2)}\n`)
}

/** The value of the agent token in an env file, or '' when it is missing. */
export function tokenIn(envFile: string): string {
  if (!existsSync(envFile)) return ''
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(new RegExp(`^\\s*${TOKEN_KEY}\\s*=\\s*(.*)$`))
    if (match) return match[1]!.trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

/** Why the runner refuses to start from this copy; empty when it may start. */
export function settingsProblems(repo: string): string[] {
  const problems: string[] = []
  if (!tokenIn(join(repo, ENV_FILE))) problems.push(`${ENV_FILE} has no ${TOKEN_KEY}`)
  let settings: Partial<Settings> = {}
  try {
    settings = readSettings(repo)
  } catch {
    problems.push(`${SETTINGS_FILE} with the location of the task database is missing or unreadable`)
    return problems
  }
  if (!settings.beadsDir) problems.push(`${SETTINGS_FILE} does not name beadsDir`)
  else if (!existsSync(settings.beadsDir)) problems.push(`the task database ${settings.beadsDir} does not exist`)
  return problems
}
