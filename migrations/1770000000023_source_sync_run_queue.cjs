// The queue of carrying out ad sync runs (task oferty-pracy-2ba.5, B5-D03):
// a queue migration written once (B1-D05). It names the queue and its key
// mode itself and imports no module: exclusivity, because the jobs of one
// source are never carried out at the same time (B5-D02). The queue
// configuration gives its attempts and time limit. The queue of the former
// path is removed after the migrations, once its runs have been requested
// here (B5-R08).
exports.up = async () => {
  const { createQueue } = await import('../lib/queues/index.ts')
  await createQueue('source-sync-run', 'exclusivity')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
