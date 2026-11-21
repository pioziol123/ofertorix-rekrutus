import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  executionCauses,
  executionStates,
  type AiExecution,
} from '../../ai/index.ts'
import { importStatusLabel } from './import-status.ts'
import {
  failedAssignmentMessage,
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
  it('gives every failure cause a message that names no path', () => {
    for (const cause of executionCauses) {
      const message = preparationMessage({ state: 'failed', cause })
      if (cause !== 'interrupted')
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
    ['interrupted', 'Worker utracił prawo do publikacji'],
  ] as const)('keeps the existing message for %s', (cause, message) => {
    expect(preparationMessage({ state: 'failed', cause })).toContain(message)
  })
  it('shows the import status from the latest execution while preparation is in progress', () => {
    const execution = (
      state: AiExecution['state'],
      cause: AiExecution['cause'] = null,
    ) => ({ state, cause }) as AiExecution
    const stored = { status: 'ai_queued', error: null, assignmentId: null }
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
    const decided = { status: 'proposal', error: null, assignmentId: null }
    for (const state of executionStates)
      expect(preparationView(decided, execution(state))).toEqual({
        status: 'proposal',
        error: null,
      })
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

describe('T7-AC03: what the owner sees of a preparation with an assignment', () => {
  const quoteMessage =
    'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.'
  const formatMessage =
    'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.'
  const failedMessage =
    'Nie udało się przygotować propozycji. Profil pozostaje bez zmian. Szczegóły są w panelu zleceń AI.'
  const removedLabels = [
    'Czeka na przygotowanie propozycji',
    'Czeka na środki w budżecie',
  ]
  // The messages chosen by the state and cause of the old way, except the
  // format message, which the Profile keeps for its own check (T7-R04).
  const removedMessages = [
    ...new Set(
      executionCauses.flatMap((cause) =>
        (['failed', 'uncertain'] as const).map((state) =>
          preparationMessage({ state, cause }),
        ),
      ),
    ),
  ].filter((message) => message !== formatMessage)
  /** The label and message the page shows for the view state. */
  const shown = (view: { status: string; error: string | null }) => ({
    label: importStatusLabel(view.status),
    message: view.error,
  })
  const withAssignment = (status: string, error: string | null = null) => ({
    status,
    error,
    assignmentId: '00000000-0000-4000-8000-000000000001',
  })
  // Every execution of the old way the import may still have from an
  // earlier preparation.
  const executions: (AiExecution | null)[] = [
    null,
    ...executionStates.flatMap((state) =>
      executionCauses.map((cause) => ({ state, cause }) as AiExecution),
    ),
  ]
  const cases = [
    // The receiver has not ended the preparation: the assignment is in
    // progress or needs attention.
    [withAssignment('ai_running'), 'Przygotowywanie propozycji', null],
    [withAssignment('proposal'), 'Propozycja gotowa', null],
    [
      withAssignment('needs_attention', failedAssignmentMessage),
      'Wymaga sprawdzenia',
      failedMessage,
    ],
    [
      withAssignment('needs_attention', quoteMessage),
      'Wymaga sprawdzenia',
      quoteMessage,
    ],
    [
      withAssignment('needs_attention', formatMessage),
      'Wymaga sprawdzenia',
      formatMessage,
    ],
  ] as const
  it.each(cases)(
    'shows the texts of T7-R04 from the import alone: %j',
    (stored, label, message) => {
      for (const execution of executions)
        expect(shown(preparationView(stored, execution))).toEqual({
          label,
          message,
        })
    },
  )
  it('never shows a removed label or message', () => {
    for (const [stored] of cases)
      for (const execution of executions) {
        const view = shown(preparationView(stored, execution))
        expect(removedLabels).not.toContain(view.label)
        expect(removedMessages).not.toContain(view.message)
      }
    expect(removedMessages).not.toContain(failedMessage)
    expect(removedMessages).not.toContain(quoteMessage)
  })
  it('keeps the label of a missing configuration (T1-R08)', () => {
    expect(importStatusLabel('needs_configuration')).toBe(
      'Wymaga konfiguracji AI',
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
