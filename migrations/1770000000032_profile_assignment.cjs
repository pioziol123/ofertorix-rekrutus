// The Profile prepares a proposal through an assignment of the AI module
// (task oferty-pracy-sq2.8, solution design of epic sq2, sections "Which
// task changes the database" and "T7–T9"): the CV import keeps the
// identifier of the assignment placed for its current text revision, beside
// the reference to the old AI record, which stays until the old way is
// removed. The identifier is written in the same save as the text revision
// it was placed for, and cleared when a revision is saved without one, so a
// non-null identifier always belongs to the import's current revision. It
// has no foreign key: the AI module's tables are its own. The unique index
// lets the Profile's receiver find the import of an assignment.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE profile_imports ADD COLUMN assignment_id uuid;
CREATE UNIQUE INDEX profile_imports_assignment ON profile_imports(assignment_id)
 WHERE assignment_id IS NOT NULL;
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
