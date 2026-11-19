// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  createConnectorRegistry,
  type ConnectorProvider,
} from '../modules/sources/infrastructure/adapters/connector-registry.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  createHimalayasConnector,
  type HimalayasPageFetcher,
} from '../modules/sources/infrastructure/adapters/himalayas/connector.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createJobspyConnector } from '../modules/sources/infrastructure/adapters/jobspy/connector.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import { createPolishConnector } from '../modules/sources/infrastructure/adapters/polish/connector.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import {
  createSolidJobsConnector,
  type SolidJobsPageFetcher,
} from '../modules/sources/infrastructure/adapters/solid-jobs/connector.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { JobspySource } from '../modules/sources/domain/jobspy-catalog.ts'
// ASSUMPTION(oferty-pracy-0mq.12/ASM-1): a test reaches a module's internals.
import type { PolishSource } from '../modules/sources/domain/polish-catalog.ts'

// Registries holding one connector whose source access is simulated.

export const solidJobsWith = (fetchPage: SolidJobsPageFetcher) =>
  createConnectorRegistry([createSolidJobsConnector(fetchPage)])

export const himalayasWith = (fetchPage: HimalayasPageFetcher) =>
  createConnectorRegistry([createHimalayasConnector(fetchPage)])

export const jobspyWith = (
  collect: () => Promise<unknown>,
  source: JobspySource,
): ConnectorProvider =>
  createConnectorRegistry([createJobspyConnector(source, () => collect())])

export const polishWith = (
  collect: () => Promise<unknown>,
  source: PolishSource,
): ConnectorProvider =>
  createConnectorRegistry([createPolishConnector(source, () => collect())])
