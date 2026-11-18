import {
  parsePolish,
  polishEnabled,
  polishParameters,
  polishQuery,
  runPolish,
  type PolishQuery,
  type PolishSource,
} from '../../../../../lib/sources/polish.ts'
import {
  ConnectorError,
  throwIfAborted,
  toConnectorAd,
  type SourceConnector,
} from '../connector.ts'

/** Runs the Polish portal helper process and returns its raw output. */
export type PolishCollector = (
  query: PolishQuery,
  signal: AbortSignal,
) => Promise<unknown>

const invalid = 'Invalid Polish source result'

/**
 * A Polish job portal, read by the helper process in one batch. The scope
 * comes from the validated query of the request. It is complete when the
 * helper exhausted the results and no record was rejected, repeated or
 * without a description. A portal disabled in configuration is not
 * fetched.
 */
export function createPolishConnector(
  source: PolishSource,
  collect: PolishCollector = (query, signal) => runPolish(query, { signal }),
): SourceConnector {
  return {
    name: source,
    infersUnavailabilityFromAbsence: false,
    scheduled: false,
    enabled: () => polishEnabled(source),
    scopeParameters(request) {
      const query = polishQuery.parse(request)
      if (query.source !== source) throw new ConnectorError(invalid)
      return polishParameters(query)
    },
    async fetch(parameters, onBatch, signal) {
      throwIfAborted(signal)
      if (!polishEnabled(source))
        throw new ConnectorError('Polish source is disabled')
      const query = polishQuery.parse(
        (parameters as { query?: unknown } | null)?.query,
      )
      if (query.source !== source || parameters?.adapterVersion !== 1)
        throw new ConnectorError(invalid)
      const batch = parsePolish(await collect(query, signal), query)
      await onBatch(batch.jobs.map(toConnectorAd))
      return batch.status === 'complete'
        ? { complete: true, diagnostics: batch.diagnostics }
        : {
            complete: false,
            reason: batch.error ?? 'Import niepełny',
            diagnostics: batch.diagnostics,
          }
    },
  }
}
