// The two queues of AI executions (task oferty-pracy-2ba.6, B6-D01): queue
// migrations written once (B1-D05). They name the queues and their key
// mode themselves and import no module: exclusivity on a constant key, so
// at most one paid execution and one execution on the local model are
// carried out at a time in the whole system. The queue configuration gives
// their attempts, retry delay and time limit. The queue of the former path
// is removed after the migrations, once its executions have been requested
// here (B6-R10).
exports.up = async () => {
  const { createQueue } = await import('../lib/queues/index.ts')
  await createQueue('ai-execution-paid', 'exclusivity')
  await createQueue('ai-execution-local', 'exclusivity')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
