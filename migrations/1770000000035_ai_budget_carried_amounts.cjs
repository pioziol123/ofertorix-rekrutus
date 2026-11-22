// The two carried amounts of a month's AI budget (task oferty-pracy-sq2.11,
// solution design of epic sq2, "Data" and "Which task changes the
// database"): the charge of the earlier records of a month that began
// before the deployment of assignments, as a settled and a held amount
// (T10-R01). They are zero by default, for every month the deployment did
// not carry anything into; the next migration fills them. Amounts are kept
// in millionths of a złoty, as the month's limit is.
exports.up = (pgm) =>
  pgm.sql(`
ALTER TABLE ai_budget_months
 ADD COLUMN carried_settled numeric(16,6) NOT NULL DEFAULT 0 CHECK(carried_settled >= 0),
 ADD COLUMN carried_held numeric(16,6) NOT NULL DEFAULT 0 CHECK(carried_held >= 0);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
