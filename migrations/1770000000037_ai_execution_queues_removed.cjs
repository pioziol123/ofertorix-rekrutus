// The queues of the old way of requesting AI work are deleted with their
// jobs (task oferty-pracy-sq2.11, solution design of epic sq2, T10): a
// queue migration written once (B1-D05) that names the queues itself and
// imports no module. Each queue goes with its failure queue. The work they
// held is not carried over: each requesting module ends its matters that
// waited for it in the migration step (T10-R02). The queue of the path
// before them, `ai-execution`, goes too where it is still left: the
// migration step no longer carries its work over.
exports.up = async () => {
  const { deleteQueue } = await import('../lib/queues/index.ts')
  for (const queue of ['ai-execution-paid', 'ai-execution-local']) {
    await deleteQueue(queue)
    await deleteQueue(`${queue}.failed`)
  }
  await deleteQueue('ai-execution')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
