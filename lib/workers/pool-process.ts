/**
 * The entry of a pool process. It runs the plugins index given as its first
 * argument once, then carries out, one at a time, the jobs the worker
 * passes to it, reporting that it is alive while a job runs. It knows no
 * queue: it gets the definition name and the job's data only.
 */
import { closePool } from '../db.ts'
import {
  reportIntervalMs,
  type ProcessMessage,
  type RunMessage,
} from './messages.ts'
import { loadRegistry, ModulePluginError } from './registry.ts'

const send = (message: ProcessMessage) => process.send?.(message)

const plugins = process.argv[2]
if (!plugins || !process.send) {
  console.error('A pool process is started by the worker with a plugins index')
  process.exit(1)
}

// The worker ending means this process ends too: a job must not outlive it.
process.on('disconnect', () => process.exit(0))

let registry: Awaited<ReturnType<typeof loadRegistry>>
try {
  registry = await loadRegistry(plugins)
} catch (error) {
  send({
    type: 'plugin-failed',
    module: error instanceof ModulePluginError ? error.module : undefined,
    message: error instanceof Error ? error.message : String(error),
  })
  await closePool().catch(() => {})
  process.exit(1)
}

process.on('message', (message: RunMessage) => {
  if (message?.type !== 'run') return
  void run(message)
})
send({ type: 'ready' })

async function run(message: RunMessage) {
  send({ type: 'alive' })
  const timer = setInterval(() => send({ type: 'alive' }), reportIntervalMs)
  try {
    const registration = registry.get(message.definition)
    const handle = message.failureCopy
      ? registration?.failureHandler
      : registration?.handler
    if (!handle)
      throw new Error(
        `No ${message.failureCopy ? 'failure handler' : 'handler'} registered for job "${message.definition}"`,
      )
    await handle(message.data)
    send({ type: 'done' })
  } catch (error) {
    send({
      type: 'failed',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearInterval(timer)
  }
}
