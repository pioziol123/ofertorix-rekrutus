import { jobspySources } from '../../domain/jobspy-catalog.ts'
import { polishSources } from '../../domain/polish-catalog.ts'
import { createConnectorRegistry } from './connector-registry.ts'
import { createHimalayasConnector } from './himalayas/connector.ts'
import { createJobspyConnector } from './jobspy/connector.ts'
import { createPolishConnector } from './polish/connector.ts'
import { createSolidJobsConnector } from './solid-jobs/connector.ts'

/**
 * The application's connectors: the only place that knows concrete ones.
 * Built on import, so a repeated name stops the server and the worker from
 * starting. Sources disabled in configuration stay registered; enqueueing
 * checks whether a source is enabled.
 */
export const sourceConnectors = createConnectorRegistry([
  createSolidJobsConnector(),
  createHimalayasConnector(),
  ...jobspySources.map((source) => createJobspyConnector(source)),
  ...polishSources.map((source) => createPolishConnector(source)),
])
