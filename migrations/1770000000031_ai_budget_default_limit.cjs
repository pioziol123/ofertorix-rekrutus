// The default limit of a month's AI budget (task oferty-pracy-sq2.4,
// solution design of epic sq2, sections "Data" and "Which task changes the
// database"): a one-row table holding the limit a month gets when the first
// operation of an assignment that needs its budget creates it (T3-R07). It
// starts at 100 PLN, the amount fixed in code today; the owner changes it
// from task oferty-pracy-sq2.14. The amount is kept in millionths of a
// złoty, as the month's limit is. The old way of requesting AI work keeps
// its own default in code until it is removed.
exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE ai_budget_default_limit (
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 limit_pln numeric(16,6) NOT NULL CHECK(limit_pln >= 0)
);
INSERT INTO ai_budget_default_limit(limit_pln) VALUES (100);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
