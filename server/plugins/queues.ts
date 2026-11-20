import { startQueues } from '../../lib/queues/index'

// Starts the queue library's connection at server start. An invalid queue
// configuration stops the server (B1-R04). The module plugins are not run
// here: the web application sends jobs without loading handling code.
export default defineNitroPlugin(() => {
  startQueues()
})
