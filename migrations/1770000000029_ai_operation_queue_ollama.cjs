// The queue of the operations of the local executor (task oferty-pracy-sq2.2,
// epic sq2, ZA-D01): a queue migration written once (B1-D05). It names the
// queue and its key mode itself and imports no module: exclusivity on a
// constant key, so the executor carries out at most one operation at a time
// in the whole system. The queue configuration gives its attempts, retry
// delay and time limit. It stands beside the queue of the old way,
// `ai-execution-local`, until that way is removed (ZA-D07).
exports.up = async () => {
  const { createQueue } = await import('../lib/queues/index.ts')
  await createQueue('ai-operation-ollama', 'exclusivity')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
