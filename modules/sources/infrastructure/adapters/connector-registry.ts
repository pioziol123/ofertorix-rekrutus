import type { SourceConnector } from './connector.ts'

/** Finds the connector of a source by the source's stable name. */
export interface ConnectorProvider {
  /** Throws `UnknownConnectorError` for a name no connector has. */
  get(name: string): SourceConnector
  /** Every registered name, in registration order. */
  names(): readonly string[]
}

/** Two connectors share a name: a configuration error, no connector wins. */
export class DuplicateConnectorNameError extends Error {
  override name = 'DuplicateConnectorNameError'
  constructor(public readonly sourceName: string) {
    super(`Duplicate source connector: ${sourceName}`)
  }
}

/** No connector has the name. The message holds the name only. */
export class UnknownConnectorError extends Error {
  override name = 'UnknownConnectorError'
  constructor(public readonly sourceName: string) {
    super(`Unknown source: ${sourceName}`)
  }
}

export function createConnectorRegistry(
  connectors: readonly SourceConnector[],
): ConnectorProvider {
  const byName = new Map<string, SourceConnector>()
  for (const connector of connectors) {
    if (byName.has(connector.name))
      throw new DuplicateConnectorNameError(connector.name)
    byName.set(connector.name, connector)
  }
  const names = [...byName.keys()]
  return {
    get(name) {
      const connector = byName.get(name)
      if (!connector) throw new UnknownConnectorError(name)
      return connector
    },
    names: () => names,
  }
}
