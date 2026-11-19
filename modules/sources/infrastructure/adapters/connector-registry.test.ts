import { describe, expect, it } from 'vitest'
import { jobspySources } from '../../domain/jobspy-catalog.ts'
import { polishSources } from '../../domain/polish-catalog.ts'
import type { SourceConnector } from './connector.ts'
import {
  createConnectorRegistry,
  DuplicateConnectorNameError,
  UnknownConnectorError,
} from './connector-registry.ts'
import { sourceConnectors } from './source-connectors.ts'

const connector = (name: string): SourceConnector => ({
  name,
  infersUnavailabilityFromAbsence: false,
  scheduled: false,
  enabled: () => true,
  scopeParameters: () => ({}),
  fetch: async () => ({ complete: true }),
})

describe('connector registry', () => {
  it('lists names in registration order and finds each connector by name', () => {
    const first = connector('first')
    const second = connector('second')
    const registry = createConnectorRegistry([first, second])
    expect(registry.names()).toEqual(['first', 'second'])
    expect(registry.get('first')).toBe(first)
    expect(registry.get('second')).toBe(second)
  })

  it('is not built from two connectors with the same name', () => {
    const build = () =>
      createConnectorRegistry([
        connector('one'),
        connector('twin'),
        connector('twin'),
      ])
    expect(build).toThrow(DuplicateConnectorNameError)
    try {
      build()
    } catch (error) {
      expect((error as DuplicateConnectorNameError).sourceName).toBe('twin')
      expect((error as Error).message).toContain('twin')
    }
  })

  it('reports an unknown name with that name only', () => {
    const registry = createConnectorRegistry([connector('registered')])
    let caught: unknown
    try {
      registry.get('missing')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(UnknownConnectorError)
    const error = caught as UnknownConnectorError
    expect(error.sourceName).toBe('missing')
    expect(error.message).toBe('Unknown source: missing')
    expect(error.message).not.toContain('registered')
  })
})

describe('application connector registry', () => {
  it('holds exactly SOLID.Jobs, Himalayas, the JobSpy and Polish portals', () => {
    expect(sourceConnectors.names()).toEqual([
      'solid-jobs',
      'himalayas',
      ...jobspySources,
      ...polishSources,
    ])
  })

  it('finds each connector under its own name', () => {
    for (const name of sourceConnectors.names())
      expect(sourceConnectors.get(name).name).toBe(name)
  })
})
