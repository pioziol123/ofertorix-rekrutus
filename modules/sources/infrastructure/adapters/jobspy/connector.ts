import { hash } from '../../../domain/canonical-hash.ts'
import {
  fingerprintFor,
  jobspyEnabled,
  parametersFor,
  parseJobspy,
  runJobspy,
} from '../../../../../lib/sources/jobspy.ts'
import type { JobspySource } from '../../../../../lib/sources/jobspy-catalog.ts'
import {
  ConnectorError,
  throwIfAborted,
  toConnectorAd,
  type SourceConnector,
} from '../connector.ts'

/** Runs the JobSpy helper process and returns its raw output. */
export type JobspyCollector = (signal: AbortSignal) => Promise<unknown>

/**
 * A portal from the JobSpy catalogue, read by the JobSpy helper process in
 * one batch. The scope is complete when the helper exhausted the results
 * and no record was rejected, repeated, outside the scope or without a
 * description. A portal disabled in configuration is not fetched.
 */
export function createJobspyConnector(
  source: JobspySource,
  collect: JobspyCollector = (signal) => runJobspy({ source, signal }),
): SourceConnector {
  return {
    name: source,
    infersUnavailabilityFromAbsence: false,
    scopeParameters: () => parametersFor(source),
    async fetch(parameters, onBatch, signal) {
      throwIfAborted(signal)
      if (!jobspyEnabled(source))
        throw new ConnectorError('JobSpy source is disabled')
      if (hash(parameters) !== fingerprintFor(source))
        throw new ConnectorError('Invalid JobSpy result')
      const batch = parseJobspy(await collect(signal), source)
      await onBatch(batch.jobs.map(toConnectorAd))
      return batch.status === 'complete'
        ? { complete: true, diagnostics: batch.diagnostics }
        : {
            complete: false,
            reason: batch.error ?? 'JobSpy query incomplete',
            diagnostics: batch.diagnostics,
          }
    },
  }
}
