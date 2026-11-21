/**
 * The periodic process (B6-R09): a separate process, started next to the
 * worker as its own container service, that repeats a pass 60 s after the
 * previous pass ended. It knows the public operations it calls by name and
 * runs no module plugin. It has no health check; the container restarts it
 * when it exits.
 */
import { closePool, db } from '../lib/db.ts'
import {
  connectQueues,
  onQueueError,
  startQueues,
  stopQueues,
} from '../lib/queues/index.ts'
import { currentScheduleDay } from '../modules/sources/index.ts'
import { queueErrorHandling, startPasses } from './pass.ts'
import { periodicSteps } from './steps.ts'

function fatal(message: string): never {
  console.error(`Periodic process failed: ${message}`)
  process.exit(1)
}

// An unavailable database or queue, an invalid queue configuration or an
// invalid schedule ends the process at start. A queue error after the start
// is logged and the passes go on; a step it makes fail is logged by the pass.
const queueErrors = queueErrorHandling(fatal)
onQueueError(queueErrors.listener)
try {
  startQueues()
  currentScheduleDay()
  await connectQueues()
  await db().query('SELECT 1')
} catch (error) {
  fatal((error as Error).message)
}
queueErrors.started()

const passes = startPasses(periodicSteps)
console.info('Periodic process ready')

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await passes.stop()
  await stopQueues()
  await closePool()
}
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    void shutdown()
      .then(() => process.exit(0))
      .catch(() => fatal('it could not stop'))
  })
