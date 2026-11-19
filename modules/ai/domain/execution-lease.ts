/**
 * The lease of a running paid execution: while its worker runs it, the
 * worker renews the lease every `renewEveryMs` to the database clock plus
 * `durationSeconds`. An execution whose lease expired, or that has none,
 * lost its worker. Executions on the shared local slot do not take it;
 * the slot has its own lease.
 *
 * The values are the policy of the AI coordination; tests may shorten
 * them.
 */
export const executionLease = {
  renewEveryMs: 30_000,
  durationSeconds: 120,
}
