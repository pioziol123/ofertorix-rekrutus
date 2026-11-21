// The exchange of each operation of an assignment with its provider (task
// oferty-pracy-sq2.3, solution design of epic sq2, section "Data" and
// decision ZA-D08): the exact request sent and every raw response received,
// in the order the executor wrote them, always kept. The executor writes a
// request before it is sent and a response before it is read.
exports.up = (pgm) =>
  pgm.sql(`
CREATE TABLE ai_operation_exchange (
 operation_id uuid NOT NULL REFERENCES ai_operations(id),
 sequence integer NOT NULL CHECK(sequence > 0),
 kind text NOT NULL CHECK(kind IN ('request','response')),
 content text NOT NULL,
 PRIMARY KEY(operation_id, sequence)
);
`)
exports.down = () => {
  throw new Error('Forward-only migration')
}
