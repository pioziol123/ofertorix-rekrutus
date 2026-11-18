/**
 * The contract every source connector implements, whatever the source
 * offers: an API, HTML pages or a helper process. The synchronisation
 * process depends on this contract only, never on a concrete source.
 */

/** JSON object describing what a scope fetches; its hash is the fingerprint. */
export type ScopeParameters = Record<string, unknown>

/** Ad content exactly as stored; its hash is the revision's content hash. */
export type AdContent = Record<string, unknown> & { jobOfferKey: string }

/** One ad found by a connector. */
export type ConnectorAd = {
  /** The ad's key in its source. */
  externalId: string
  url: string | null
  /** Unknown when null. */
  validTo: Date | null
  content: AdContent
}

export type ConnectorDiagnostics = Record<string, unknown>

/** Whether the connector checked the whole scope, and if not, why. */
export type ConnectorResult =
  | { complete: true; diagnostics?: ConnectorDiagnostics }
  | { complete: false; reason: string; diagnostics?: ConnectorDiagnostics }

/** Receives one batch; the connector waits for it before fetching more. */
export type BatchReceiver = (ads: ConnectorAd[]) => Promise<void>

export interface SourceConnector {
  /** The source's stable name: its existing source identifier. */
  readonly name: string
  /**
   * Whether an ad missing from a complete run may be taken as unavailable.
   */
  readonly infersUnavailabilityFromAbsence: boolean
  /** Whether the schedule requests the source's sync every day. */
  readonly scheduled: boolean
  /**
   * Whether configuration allows requesting the source. A disabled source
   * stays registered, so its earlier runs stay readable.
   */
  enabled(): boolean
  /**
   * Scope parameters for a request. The request is source specific (e.g.
   * the query of a Polish portal); sources with a fixed scope ignore it.
   */
  scopeParameters(request?: unknown): ScopeParameters
  /**
   * Fetches the scope and hands ads over in batches. Errors thrown by
   * `onBatch` propagate unchanged. An aborted `signal` ends the fetch with
   * `ConnectorAbortedError`.
   */
  fetch(
    parameters: ScopeParameters,
    onBatch: BatchReceiver,
    signal: AbortSignal,
  ): Promise<ConnectorResult>
}

/**
 * A connector failure whose message is safe to store with the run: it
 * holds neither secrets nor raw source responses. Callers replace any other
 * error with a generic message.
 */
export class ConnectorError extends Error {
  override name = 'ConnectorError'
}

/** The source asked to retry later than the connector is willing to wait. */
export class RetryDeferredError extends ConnectorError {
  override name = 'RetryDeferredError'
  constructor(
    label: string,
    public readonly status: number,
    public readonly retryAfter: string | null,
  ) {
    super(`${label} HTTP ${status}; retry deferred`)
  }
}

/** The fetch stopped because its signal was aborted. */
export class ConnectorAbortedError extends Error {
  override name = 'ConnectorAbortedError'
  constructor() {
    super('Source fetch aborted')
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ConnectorAbortedError()
}

/**
 * Builds a batch entry from stored ad content, reading the URL and expiry
 * the same way the batch store does.
 */
export function toConnectorAd(content: AdContent): ConnectorAd {
  return {
    externalId: content.jobOfferKey,
    url: typeof content.url === 'string' ? content.url : null,
    validTo:
      typeof content.validTo === 'string' &&
      Number.isFinite(Date.parse(content.validTo))
        ? new Date(content.validTo)
        : null,
    content,
  }
}
