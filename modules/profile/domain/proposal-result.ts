import {
  checkProposal,
  ProposalEvidenceError,
  type Proposal,
} from '../../../lib/profile/model.ts'

/** A result the Profile does not accept, with the owner's message. */
export class ProposalRejected extends Error {}

/**
 * The proposal in a result that matches the response schema, checked by
 * the Profile's rules: the proposal contract and quotes present in the text
 * revision it was prepared from. The message names no CV or model content.
 */
export function readProposal(result: unknown, text: string): Proposal {
  try {
    return checkProposal(result, text)
  } catch (cause) {
    throw new ProposalRejected(
      cause instanceof ProposalEvidenceError
        ? 'Nie udało się potwierdzić cytatów AI w tekście CV. Profil pozostaje bez zmian.'
        : 'Odpowiedź AI ma nieprawidłowy format danych. Profil pozostaje bez zmian.',
      { cause },
    )
  }
}
