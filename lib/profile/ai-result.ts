import { checkProposal, ProposalEvidenceError } from './model.ts'
import type { ModelResult } from '../ai/models/model.ts'

export class AiResultError extends Error {}
export function readAiProposal(result: ModelResult, input: string) {
  if (result.outcome === 'refused')
    throw new AiResultError(
      'AI odmówiło przygotowania propozycji. Sprawdź tekst zawodowy. Profil pozostaje bez zmian.',
    )
  if (result.outcome !== 'completed')
    throw new AiResultError(
      'AI nie ukończyło odpowiedzi. Spróbuj przygotować propozycję z krótszego tekstu. Profil pozostaje bez zmian.',
    )
  if (!result.text)
    throw new AiResultError(
      'AI nie zwróciło jednej kompletnej propozycji. Profil pozostaje bez zmian.',
    )
  try {
    return checkProposal(JSON.parse(result.text), input)
  } catch (cause) {
    throw new AiResultError(
      cause instanceof ProposalEvidenceError
        ? 'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.'
        : 'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.',
      { cause },
    )
  }
}
