// The queue of reading the text of an uploaded CV (task oferty-pracy-2ba.4,
// B4-D02): a queue migration written once (B1-D05). It names the queue and
// its key mode itself and imports no module: exclusivity, because at most
// one CV is read at a time (B4-R04). The queue configuration gives its
// attempts and time limit. The queue of the former path is removed after
// the migrations, once its imports have been requested here (B4-R08).
exports.up = async () => {
  const { createQueue } = await import('../lib/queues/index.ts')
  await createQueue('profile-cv-text', 'exclusivity')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
