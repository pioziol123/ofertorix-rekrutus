import { describe, expect, it } from 'vitest'
import {
  refusalText,
  noteTooLongMessage,
  stageChangedMessage,
} from '../refusal-codes.ts'
import {
  ApplicationMissing,
  checkFirstMove,
  checkMove,
  settleUnappliedMove,
  StageChanged,
  TransitionNotAllowed,
} from './moves.ts'
import {
  allowedStages,
  noApplicationLabel,
  stageLabels,
  stages,
  type Stage,
} from './stages.ts'

/** The transition table of A-R03, written out as the requirement lists it. */
const table: [Stage | null, Stage[]][] = [
  [null, ['to_consider', 'cv_sent', 'rejected']],
  ['to_consider', ['cv_sent', 'rejected', 'removed']],
  ['cv_sent', ['rejected', 'to_consider']],
  ['rejected', ['to_consider', 'cv_sent', 'removed']],
  ['removed', ['to_consider', 'cv_sent', 'rejected']],
]

describe('the stage rules (A-AC06)', () => {
  it.each(table)('from %s the field lists exactly %j', (from, allowed) => {
    expect([...allowedStages(from)].sort()).toEqual([...allowed].sort())
  })

  it('never lists the current stage, and never "Zdjęta z listy" after "CV wysłane"', () => {
    for (const stage of stages)
      expect(allowedStages(stage)).not.toContain(stage)
    expect(allowedStages('cv_sent')).not.toContain('removed')
    expect(allowedStages(null)).not.toContain('removed')
  })

  it('labels the stages and no application as A-R02 and A-R14 say (A-AC11)', () => {
    expect(stageLabels).toEqual({
      to_consider: 'Do rozważenia',
      cv_sent: 'CV wysłane',
      rejected: 'Odrzucone',
      removed: 'Zdjęta z listy',
    })
    expect(noApplicationLabel).toBe('Bez aplikacji')
  })
})

describe('the decisions on a move (D12)', () => {
  it('allows every pair of A-R03 and refuses every other pair as a transition not allowed', () => {
    for (const from of stages)
      for (const to of stages) {
        const allowed = table.find(([f]) => f === from)![1].includes(to)
        if (allowed) expect(() => checkMove(from, to)).not.toThrow()
        else expect(() => checkMove(from, to)).toThrow(TransitionNotAllowed)
      }
    for (const to of stages) {
      if (to === 'removed')
        expect(() => checkFirstMove(to)).toThrow(TransitionNotAllowed)
      else expect(() => checkFirstMove(to)).not.toThrow()
    }
  })

  it('counts a move to the stage the application already has as done (A-R13)', () => {
    expect(settleUnappliedMove('cv_sent', 'cv_sent')).toBe('done')
  })

  it('refuses a move from a page showing another stage as a stale page (A-R07)', () => {
    expect(() => settleUnappliedMove('rejected', 'cv_sent')).toThrow(
      StageChanged,
    )
  })

  it('refuses a move of an offer without an application as missing', () => {
    expect(() => settleUnappliedMove(null, 'cv_sent')).toThrow(
      ApplicationMissing,
    )
  })

  it('gives each refusal its reason and a message without the refused value', () => {
    const refusals = [
      [new StageChanged(), 'stage_changed'],
      [new TransitionNotAllowed(), 'transition_not_allowed'],
      [new ApplicationMissing(), 'application_missing'],
    ] as const
    for (const [refusal, reason] of refusals) {
      expect(refusal.reason).toBe(reason)
      for (const stage of stages) expect(refusal.message).not.toContain(stage)
    }
  })
})

describe('the texts of refusal codes (D13)', () => {
  it('gives the texts of A-R07 and A-R10 for their codes', () => {
    expect(refusalText('application_stage_changed')).toBe(
      'Etap tej aplikacji się zmienił — odśwież stronę',
    )
    expect(stageChangedMessage).toBe(refusalText('application_stage_changed'))
    expect(refusalText('note_too_long')).toBe(
      'Notatka może mieć najwyżej 10 000 znaków',
    )
    expect(noteTooLongMessage).toBe(refusalText('note_too_long'))
  })

  it('shows the code itself for a code without a text', () => {
    expect(refusalText('transition_not_allowed')).toBe('transition_not_allowed')
  })
})
