# A queue job has one key with three modes: none, exclusivity, deduplication

Modules need two different guarantees from the queue: exclusivity (at most one ad sync of a source, or one CV reading, carried out at a time) and deduplication (a second request for the same work does not enter the queue while the first one waits or runs). We give each job definition one key with one of three modes, mapped to pg-boss queue policies (`standard`, `singleton`, `exclusive`), because pg-boss enforces them with a unique index in the database, so they hold with several workers too. The mode cannot be changed on an existing queue; changing it means a new queue, which makes the choice hard to reverse.

## Considered options

- A group with a group concurrency of 1: not strict when two workers fetch at the same moment.
- Exclusivity kept by the worker: a worker sees only its own jobs.

Decided by the owner on 2026-11-19 and 2026-11-20 (epic `oferty-pracy-2ba`, decision B1-D03 in its [solution design](../specs/2ba-praca-w-tle/solution-design.md#b1)).
