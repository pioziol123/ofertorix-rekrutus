import {
  checkProposal,
  ProposalEvidenceError,
  type Proposal,
} from '../../../lib/profile/model.ts'

/**
 * A result the Profile does not accept: the owner's message, and the rule
 * it broke as a diagnostic reason.
 */
export class ProposalRejected extends Error {
  constructor(
    message: string,
    readonly reason: 'unconfirmed_quote' | 'invalid_proposal',
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

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
      cause instanceof ProposalEvidenceError
        ? 'unconfirmed_quote'
        : 'invalid_proposal',
      { cause },
    )
  }
}
