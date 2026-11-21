// Matching assesses offers through assignments of the AI module (task
// oferty-pracy-sq2.9, solution design of epic sq2, sections "Which task
// changes the database" and "T7–T9"): an assessment request keeps the
// identifier of the assignment placed for it, beside the reference to the
// old AI record, which stays until the old way is removed. The identifier
// is written in the save that places the assignment. It has no foreign
// key: the AI module's tables are its own. The unique index lets
// Matching's receiver find the request of an assignment.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE matching_requests ADD COLUMN assignment_id uuid;
CREATE UNIQUE INDEX matching_requests_assignment ON matching_requests(assignment_id)
 WHERE assignment_id IS NOT NULL;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
