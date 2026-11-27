import { describe, expect, it } from 'vitest'
import {
  moveFailureText,
  stageMoveFailureText,
  stageReadFailureText,
} from '../app/utils/application-stage.ts'

/**
 * What the stage field of offer details shows for a failed request (task
 * oferty-pracy-lq3.1, T1-R02, D13 and ASSUMPTION(oferty-pracy-lq3.1/ASM-1)).
 */

/** The shape of the error a failed `$fetch` throws. */
function fetchError(status?: number, code?: string) {
  return Object.assign(new Error('request failed'), {
    status,
    statusCode: status,
    data: code ? { statusCode: status, data: { code } } : undefined,
  })
}

describe('the stage field after a failed request', () => {
  it('shows the message of A-R07 for a stale page (T1-AC03)', () => {
    expect(moveFailureText(fetchError(409, 'application_stage_changed'))).toBe(
      'Etap tej aplikacji się zmienił — odśwież stronę',
    )
  })

  it('shows the code itself for a code without a text (D13)', () => {
    expect(moveFailureText(fetchError(422, 'transition_not_allowed'))).toBe(
      'transition_not_allowed',
    )
  })

  it('shows the move failure text for a failure without a code (ASM-1)', () => {
    for (const error of [
      new TypeError('fetch failed'),
      fetchError(500),
      fetchError(403),
      fetchError(413),
      null,
    ])
      expect(moveFailureText(error)).toBe(
        'Nie udało się zmienić etapu. Spróbuj ponownie.',
      )
    expect(stageMoveFailureText).toBe(
      'Nie udało się zmienić etapu. Spróbuj ponownie.',
    )
  })

  it('has a read failure text for a read that fails other than with 404 (ASM-1)', () => {
    expect(stageReadFailureText).toBe('Nie udało się wczytać etapu aplikacji.')
  })
})
