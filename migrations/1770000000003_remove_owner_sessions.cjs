// Owner explicitly chose local access without accounts before this feature shipped.
exports.up = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS owner_sessions;')
}
exports.down = () => {
  throw new Error('Forward-only migration')
}
