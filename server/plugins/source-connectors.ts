import { sourceConnectors } from '../../modules/sources/infrastructure/adapters/source-connectors'

// Routes load lazily, so the connector registry is built at server start:
// a repeated source name stops the server instead of the first request.
export default defineNitroPlugin(() => {
  void sourceConnectors
})
