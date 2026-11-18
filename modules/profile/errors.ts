/**
 * The command relied on state that changed in the meantime: the draft or
 * import text revision, the active version or a reused command id. Nothing
 * was written; the owner reloads and decides again.
 */
export class ProfileConflict extends Error {}

/** The import has no proposal to apply (unknown import or none prepared). */
export class ProposalNotFound extends Error {
  constructor() {
    super('Proposal not found')
  }
}
