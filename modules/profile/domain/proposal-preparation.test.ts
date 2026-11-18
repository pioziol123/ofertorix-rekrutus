import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  executionCauses,
  executionStates,
  type AiExecution,
} from '../../ai/index.ts'
import {
  preparationMessage,
  preparationView,
  uncertainMessage,
} from './proposal-preparation.ts'
import { ProposalRejected, readProposal } from './proposal-result.ts'

const a9r07 =
  'Nie wiadomo, jak zakończyło się przygotowanie propozycji. Profil pozostaje bez zmian. Sprawdź stan wykonania przed ponowieniem.'

describe('A9-AC08: the message follows the public state and cause only', () => {
  it('shows the A9-R07 message for every uncertain end', () => {
    expect(uncertainMessage).toBe(a9r07)
    for (const cause of executionCauses)
      expect(preparationMessage({ state: 'uncertain', cause })).toBe(a9r07)
  })
  it('gives every failure cause a message that names no path and leaves the profile unchanged', () => {
    for (const cause of executionCauses) {
      const message = preparationMessage({ state: 'failed', cause })
      expect(message).toContain('Profil pozostaje bez zmian')
      expect(message).not.toMatch(/lokaln|płatn|koszt|OpenAI|Ollam/i)
      expect(message).not.toBe(a9r07)
    }
  })
  it.each([
    ['refused', 'odmówiło'],
    ['incomplete', 'nie ukończyło'],
    ['no_content', 'jednej kompletnej'],
    ['format', 'format danych'],
  ] as const)('keeps the existing message for %s', (cause, message) => {
    expect(preparationMessage({ state: 'failed', cause })).toContain(message)
  })
  it('shows the import status from the latest execution while preparation is in progress', () => {
    const execution = (
      state: AiExecution['state'],
      cause: AiExecution['cause'] = null,
    ) => ({ state, cause }) as AiExecution
    const stored = { status: 'ai_queued', error: null }
    expect(preparationView(stored, execution('waiting_budget'))).toEqual({
      status: 'waiting_budget',
      error: null,
    })
    expect(preparationView(stored, execution('queued')).status).toBe(
      'ai_queued',
    )
    expect(preparationView(stored, execution('running')).status).toBe(
      'ai_running',
    )
    expect(preparationView(stored, execution('delivering')).status).toBe(
      'ai_running',
    )
    expect(preparationView(stored, execution('uncertain', 'network'))).toEqual({
      status: 'needs_attention',
      error: a9r07,
    })
    expect(
      preparationView(stored, execution('failed', 'interrupted')).status,
    ).toBe('needs_attention')
    // Ends with the Profile's decision are recorded with the import itself.
    const decided = { status: 'proposal', error: null }
    for (const state of executionStates)
      expect(preparationView(decided, execution(state))).toEqual(decided)
  })
  it('reads no path, runtime or unconfirmed-cost fact of an execution', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
          files.push(path)
      }
    }
    walk(join(import.meta.dirname, '..'))
    for (const file of files)
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /runtimeState|runtime_state|cost\.unknown|ollama|openai|ai_executions|ai_attempts|ai_local|modules\/ai\/(?!index)|\.\.\/ai\/(?!index)/i,
      )
  })
})

describe('safe proposal diagnostics', () => {
  const marker = 'PRIVATE_CV_SENTINEL'
  const valid = { summary: null, skills: [], experience: [] }
  it.each([
    [{ ...valid, unexpected: marker }, 'format danych'],
    [
      {
        ...valid,
        skills: [{ name: marker, description: marker, evidence: marker }],
      },
      'potwierdzić cytatów',
    ],
  ])(
    'rejects the result without leaking model or CV content',
    (value, message) => {
      let caught: unknown
      try {
        readProposal(value, 'Different reviewed professional text')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProposalRejected)
      expect((caught as Error).message).toContain(message)
      expect((caught as Error).message).not.toContain(marker)
    },
  )
})
